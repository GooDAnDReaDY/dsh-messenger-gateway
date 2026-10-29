/**
 * Outbound Transactional Queue (Outbox DLQ) with Offline Recovery & Backoff (#155).
 *
 * Guarantees zero message loss during temporary network hiccups, Telegram 429
 * throttling, 502/504 gateway errors, and process restarts:
 * - Atomic persistent disk queue (~/.dsh/storages/outbox-queue.json).
 * - Exponential backoff with jitter and Telegram 429 `retry_after` awareness.
 * - Dead Letter Queue (DLQ) for items failing after max retries or terminal errors.
 * - Recovery of pending uncommitted outbound jobs on gateway startup.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeJsonAtomic } from './storage-atomic.js'
import { isTopicGoneError } from './telegram-errors.js'

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
  let isFlushing = false
  let isStopped = false

  function loadSync() {
    try {
      if (existsSync(storagePath)) {
        const raw = readFileSync(storagePath, 'utf8')
        const data = JSON.parse(raw)
        if (Array.isArray(data.pending)) pending = data.pending
        if (Array.isArray(data.dlq)) dlq = data.dlq
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

  loadSync()

  async function persist() {
    try {
      await writeJsonAtomic(storagePath, { pending, dlq })
    } catch (err) {
      if (logger) {
        logger.warn?.(`[outbox] failed to persist queue to disk: ${err.message}`)
      }
    }
  }

  async function flush() {
    if (isFlushing || isStopped) return
    if (!pending.length) return
    isFlushing = true
    const now = Date.now()
    let dirty = false

    try {
      const readyJobs = pending.filter((j) => (j.nextRetryAt || 0) <= now)
      for (const job of readyJobs) {
        if (isStopped) break
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
            dirty = true
            if (logger) {
              logger.warn?.(`[outbox] job ${job.id} failed (attempt ${job.attempts}/${max}), retrying in ${Math.round(delayMs / 1000)}s: ${job.lastError}`)
            }
          }
        }
      }
    } finally {
      isFlushing = false
      if (dirty) {
        await persist()
      }
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
    pending.push(item)
    await persist()
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
    const count = dlq.length
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
    await flush()
    return count
  }

  async function clearDlq() {
    const count = dlq.length
    dlq = []
    await persist()
    return count
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
