/**
 * Outbound Transactional Queue (Outbox DLQ) with Offline Recovery & Backoff (#155).
 *
 * Guarantee scope (#217): the queue covers alerts, cron prompts and
 * autonomous messages — everything sent through sendToMessenger. Turn
 * replies to the user are streamed directly (adapter.sendReply) because
 * streaming edits cannot be replayed from a queue; that limitation is
 * documented in DESIGN.md.
 *
 * Single-writer safety (#218): every mutation (enqueue / flush / retry /
 * clear) takes an exclusive lock file scoped to the queue path and reloads
 * the on-disk state inside the lock — the disk copy is the source of truth,
 * so two gateway processes sharing a home neither lose nor duplicate jobs.
 *
 * - Atomic persistent disk queue (~/.dsh/storages/outbox-queue.json).
 * - Exponential backoff with jitter and Telegram 429 `retry_after` awareness.
 * - Dead Letter Queue (DLQ) for items failing after max retries or terminal errors.
 * - Recovery of pending uncommitted outbound jobs on gateway startup.
 */

import { existsSync, readFileSync, openSync, writeSync, closeSync, unlinkSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeJsonAtomic } from './storage-atomic.js'
import { isTopicGoneError } from './telegram-errors.js'

const LOCK_STALE_MS = 30_000
const OUTBOX_SCHEMA_VERSION = 1

/**
 * Exclusive lock file scoped to the queue (#218). Returns false when another
 * writer holds a fresh lock; steals locks older than LOCK_STALE_MS (crashed
 * writer). The caller must releaseLock() when it returns true.
 */
export function acquireLock(lockPath, staleMs = LOCK_STALE_MS) {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 })
  try {
    const fd = openSync(lockPath, 'wx')
    try { writeSync(fd, String(process.pid)) } catch { /* best-effort */ }
    closeSync(fd)
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
  let ageMs = 0
  try {
    ageMs = Date.now() - statSync(lockPath).mtimeMs
  } catch { ageMs = staleMs + 1 }
  if (ageMs < staleMs) return false
  try { unlinkSync(lockPath) } catch { return false }
  try {
    const fd = openSync(lockPath, 'wx')
    try { writeSync(fd, String(process.pid)) } catch { /* best-effort */ }
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

export function releaseLock(lockPath) {
  try { unlinkSync(lockPath) } catch { /* already gone */ }
}

export function resolveOutboxStoragePath(baseDir) {
  if (baseDir) return join(baseDir, 'outbox-queue.json')
  const dshHome = (typeof process !== 'undefined' && process.env?.DSH_HOME) || ''
  if (dshHome) return join(dshHome, 'storages', 'outbox-queue.json')
  return join(homedir(), '.dsh', 'storages', 'outbox-queue.json')
}

export function parseRetryAfter(err) {
  if (!err) return null
  if (typeof err.parameters?.retry_after === 'number') {
    return err.parameters.retry_after
  }
  if (typeof err.response?.parameters?.retry_after === 'number') {
    return err.response.parameters.retry_after
  }
  const msg = String(err.message || '')
  const match = msg.match(/retry after (\d+)/i)
  if (match) {
    const val = parseInt(match[1], 10)
    if (!Number.isNaN(val) && val > 0) return val
  }
  return null
}

export function computeOutboxBackoffMs(attempts, retryAfterSeconds, maxDelayMs = 60_000) {
  const jitter = Math.floor(Math.random() * 400)
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    return Math.min(maxDelayMs, (retryAfterSeconds * 1000) + jitter)
  }
  const count = Math.max(1, Math.min(10, Number(attempts) || 1))
  const baseDelay = 1000 * Math.pow(2, count - 1)
  return Math.min(maxDelayMs, baseDelay + jitter)
}

export function isTerminalSendError(err) {
  if (!err) return false
  if (isTopicGoneError(err)) return true
  const msg = String(err.message || '').toLowerCase()
  return (
    msg.includes('bot was blocked by the user') ||
    msg.includes('user is deactivated') ||
    msg.includes('chat not found') ||
    msg.includes('message is too long') ||
    msg.includes('message text is empty') ||
    msg.includes("can't parse entities") ||
    msg.includes('wrong file identifier') ||
    msg.includes('have no rights to send a message')
  )
}

export function createOutboxQueue(options = {}) {
  const {
    storagePath = resolveOutboxStoragePath(),
    senderFn,
    onDlq,
    logger,
    flushIntervalMs = 1000,
    defaultMaxAttempts = 5,
  } = options

  let pending = []
  let dlq = []
  let timer = null
  let isStopped = false
  const lockPath = `${storagePath}.lock`

  function loadDiskIntoMemory() {
    try {
      if (existsSync(storagePath)) {
        const raw = readFileSync(storagePath, 'utf8')
        const data = JSON.parse(raw)
        // Merge (#218): adopt jobs added to disk by another writer; drop our
        // in-memory copies that another writer has already removed (it sent
        // or DLQ'd them under the lock). In-memory runtime state (backoff
        // nextRetryAt) for jobs still on disk is preserved.
        const diskPending = Array.isArray(data.pending) ? data.pending : []
        const diskDlq = Array.isArray(data.dlq) ? data.dlq : []
        const diskPendingIds = new Set(diskPending.map((j) => j.id))
        for (const j of diskPending) {
          if (!pending.some((m) => m.id === j.id)) pending.push(j)
        }
        pending = pending.filter((m) => diskPendingIds.has(m.id))
        const diskDlqIds = new Set(diskDlq.map((j) => j.id))
        for (const j of diskDlq) {
          if (!dlq.some((m) => m.id === j.id)) dlq.push(j)
        }
        dlq = dlq.filter((m) => diskDlqIds.has(m.id))
        if (pending.length > 0 && logger) {
          logger.info?.(`[outbox] recovered ${pending.length} pending outbound jobs from disk`)
        }
      }
    } catch (err) {
      if (logger) {
        logger.warn?.(`[outbox] failed to load storage: ${err.message}`)
      }
    }
  }

  loadDiskIntoMemory()

  async function persist() {
    try {
      // schemaVersion envelope (#227): future format changes migrate instead
      // of misreading; readers stay tolerant of legacy files without it.
      await writeJsonAtomic(storagePath, { schemaVersion: OUTBOX_SCHEMA_VERSION, pending, dlq })
    } catch (err) {
      if (logger) {
        logger.warn?.(`[outbox] failed to persist queue to disk: ${err.message}`)
      }
    }
  }

  const PID = process.pid
  const CLAIM_MS = 60_000

  async function flush() {
    if (isStopped) return
    if (!pending.length) return
    // Brief retry loop: enqueue()'s void flush may transiently hold the lock.
    let lk = false
    for (let i = 0; i < 3 && !lk; i++) {
      lk = acquireLock(lockPath)
      if (!lk) await new Promise((r) => setTimeout(r, 50))
    }
    if (!lk) return // genuinely busy: the lock holder will process everything
    const now = Date.now()
    let dirty = false

    try {
      // Adopt jobs enqueued by another writer while we didn't hold the lock;
      // keep our in-memory runtime state (nextRetryAt backoff) for known ids.
      loadDiskIntoMemory()

      const readyJobs = pending.filter((j) => (j.nextRetryAt || 0) <= now)
      for (const job of readyJobs) {
        if (isStopped) break
        // Job claim (#218): a job locked by another live writer is skipped —
        // claims expire after CLAIM_MS so a crashed writer's jobs are adopted.
        if (job.claimedBy && job.claimedBy !== PID && job.claimUntil > now) continue
        job.claimedBy = PID
        job.claimUntil = now + CLAIM_MS
        dirty = true
        try {
          if (typeof senderFn !== 'function') {
            throw new Error('outbox senderFn not configured')
          }
          await senderFn(job)
          pending = pending.filter((j) => j.id !== job.id)
          dirty = true
        } catch (err) {
          job.attempts = (job.attempts || 0) + 1
          job.lastError = err?.message || String(err)
          const terminal = isTerminalSendError(err)
          const max = job.maxAttempts || defaultMaxAttempts

          if (terminal || job.attempts >= max) {
            pending = pending.filter((j) => j.id !== job.id)
            dlq.unshift({
              id: job.id,
              type: job.type,
              target: job.target,
              payload: job.payload,
              attempts: job.attempts,
              createdAt: job.createdAt,
              failedAt: Date.now(),
              terminal,
              error: job.lastError,
            })
            if (dlq.length > 100) dlq.length = 100
            dirty = true
            if (typeof onDlq === 'function') {
              try { onDlq(job, err) } catch (dlqErr) {
                logger?.warn?.(`[outbox] onDlq error: ${dlqErr.message}`)
              }
            }
          } else {
            const retryAfter = parseRetryAfter(err)
            const delayMs = computeOutboxBackoffMs(job.attempts, retryAfter)
            job.nextRetryAt = Date.now() + delayMs
            job.claimUntil = 0 // backoff: release the claim for the retry window
            dirty = true
            if (logger) {
              logger.warn?.(`[outbox] job ${job.id} failed (attempt ${job.attempts}/${max}), retrying in ${Math.round(delayMs / 1000)}s: ${job.lastError}`)
            }
          }
        }
      }
    } finally {
      if (dirty) {
        await persist()
      }
      releaseLock(lockPath)
    }
  }

  async function enqueue(job) {
    const item = {
      id: job.id || randomUUID(),
      type: job.type || 'message',
      target: job.target,
      payload: job.payload,
      attempts: 0,
      maxAttempts: job.maxAttempts || defaultMaxAttempts,
      createdAt: Date.now(),
      nextRetryAt: Date.now(),
      lastError: null,
    }
    while (!acquireLock(lockPath)) {
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      // Merge under the lock (#218): adopt jobs another instance enqueued.
      loadDiskIntoMemory()
      pending.push(item)
      await persist()
    } finally {
      releaseLock(lockPath)
    }
    void flush()
    return item
  }

  function start() {
    isStopped = false
    void flush()
    if (!timer && flushIntervalMs > 0) {
      timer = setInterval(() => { void flush() }, flushIntervalMs)
      timer.unref?.()
    }
  }

  function stop() {
    isStopped = true
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function status() {
    return {
      pendingCount: pending.length,
      dlqCount: dlq.length,
      pending: [...pending],
      dlq: [...dlq],
    }
  }

  async function retryDlq() {
    if (!dlq.length) return 0
    while (!acquireLock(lockPath)) {
      await new Promise((r) => setTimeout(r, 100))
    }
    let count = 0
    try {
      count = dlq.length
      for (const item of dlq) {
        pending.push({
          id: item.id || randomUUID(),
          type: item.type,
          target: item.target,
          payload: item.payload,
          attempts: 0,
          maxAttempts: defaultMaxAttempts,
          createdAt: Date.now(),
          nextRetryAt: Date.now(),
          lastError: null,
        })
      }
      dlq = []
      await persist()
    } finally {
      releaseLock(lockPath)
    }
    await flush()
    return count
  }

  async function clearDlq() {
    if (!acquireLock(lockPath)) return 0
    try {
      const count = dlq.length
      dlq = []
      await persist()
      return count
    } finally {
      releaseLock(lockPath)
    }
  }

  return {
    enqueue,
    flush,
    start,
    stop,
    status,
    retryDlq,
    clearDlq,
    get pending() { return pending },
    get dlq() { return dlq },
  }
}
