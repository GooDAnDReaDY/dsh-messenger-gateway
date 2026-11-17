import { randomBytes } from 'node:crypto'
import { writeJsonAtomicSync, readJsonStateSync, StateCorruptError } from './storage-atomic.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PAIRING_SCHEMA_VERSION = 1

export function generatePairingCode(length = 8) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

const migratePairing = (raw) => ({
  schemaVersion: PAIRING_SCHEMA_VERSION,
  approved: Array.isArray(raw?.approved) ? raw.approved : [],
  pending: raw?.pending && typeof raw.pending === 'object' ? raw.pending : {},
})

const logLoadFailure = (logger, err) => {
  const detail = err instanceof StateCorruptError
    ? `state file corrupted and unrecoverable; access stays fail-closed (empty allowlist); corrupted copy preserved at ${err.corruptBackup || 'an unknown path'}`
    : `read error: ${err?.message || err}`
  const message = `[dsh-messenger-gateway] pairing store ${detail}`
  if (typeof logger?.error === 'function') logger.error(message)
  else logger?.warn?.(message)
}

/** @param {string} filePath @param {any} [opts] */
export function createPairingStore(filePath, { logger } = {}) {
  const state = { pending: {}, /** @type {number[]} */ approved: [] }
  if (filePath) {
    try {
      const { data, recovered, corruptBackup } = readJsonStateSync(filePath, {
        version: PAIRING_SCHEMA_VERSION,
        migrate: migratePairing,
      })
      if (data) {
        state.approved = (data.approved || []).map(Number).filter(Number.isFinite)
        state.pending = data.pending && typeof data.pending === 'object' ? data.pending : {}
      }
      if (recovered) {
        logger?.warn?.(`[dsh-messenger-gateway] pairing store recovered from .bak after corruption; preserved copy: ${corruptBackup}`)
      }
    } catch (err) {
      if (err instanceof StateCorruptError || err?.name === 'StateVersionError') logLoadFailure(logger, err)
      else logger?.warn?.('[dsh-messenger-gateway] pairing store read error:', err?.message || err)
    }
  }
  const persist = () => {
    if (!filePath) return
    try {
      writeJsonAtomicSync(filePath, {
        schemaVersion: PAIRING_SCHEMA_VERSION,
        approved: state.approved,
        pending: state.pending,
      })
    } catch (err) {
      logger?.warn?.('[dsh-messenger-gateway] pairing store persist error:', err?.message || err)
    }
  }
  const prune = () => {
    const now = Date.now()
    for (const [code, row] of Object.entries(state.pending)) {
      if (!row || now > Number(row.expiresAt || 0)) delete state.pending[code]
    }
  }
  return {
    listApproved: () => [...state.approved],
    listPending: () => {
      prune()
      return Object.entries(state.pending).map(([code, row]) => ({
        code,
        userId: Number(row.userId),
        username: String(row.username || ''),
        createdAt: Number(row.createdAt) || 0,
        expiresAt: Number(row.expiresAt) || 0,
      })).sort((a, b) => a.createdAt - b.createdAt)
    },
    isApproved: (userId) => state.approved.includes(Number(userId)),
    addApproved: (userId) => {
      const id = Number(userId)
      if (!Number.isFinite(id)) return false
      if (!state.approved.includes(id)) {
        state.approved.push(id)
        persist()
      }
      return true
    },
    requestCode(userId, meta = {}) {
      prune()
      const uid = Number(userId)
      for (const [code, row] of Object.entries(state.pending)) {
        if (Number(row.userId) === uid && Date.now() < Number(row.expiresAt)) return { code, reused: true, ...row }
      }
      const recent = Object.values(state.pending).find((r) => Number(r.userId) === uid && Date.now() - Number(r.createdAt || 0) < 600_000)
      if (recent) {
        const err = /** @type {any} */ (new Error('pairing rate limited'))
        err.code = 'RATE_LIMIT'
        throw err
      }
      if (Object.keys(state.pending).length >= 20) {
        const err = /** @type {any} */ (new Error('too many pending pairing codes'))
        err.code = 'FULL'
        throw err
      }
      const code = generatePairingCode()
      const row = {
        userId: uid,
        username: String(meta.username || ''),
        createdAt: Date.now(),
        expiresAt: Date.now() + 3_600_000,
      }
      state.pending[code] = row
      persist()
      return { code, reused: false, ...row }
    },
    approveCode(code, actorUserId) {
      prune()
      const key = String(code || '').trim().toUpperCase()
      const row = state.pending[key]
      if (!row) return { ok: false, error: 'unknown or expired code' }
      if (Date.now() > Number(row.expiresAt)) {
        delete state.pending[key]
        persist()
        return { ok: false, error: 'code expired' }
      }
      delete state.pending[key]
      const id = Number(row.userId)
      if (Number.isFinite(id) && !state.approved.includes(id)) state.approved.push(id)
      persist()
      return { ok: true, userId: row.userId, username: row.username, actorUserId: Number(actorUserId) }
    },
    rejectCode(code) {
      prune()
      const key = String(code || '').trim().toUpperCase()
      if (!state.pending[key]) return { ok: false, error: 'unknown or expired code' }
      const row = state.pending[key]
      delete state.pending[key]
      persist()
      return { ok: true, userId: row.userId, username: row.username }
    },
  }
}