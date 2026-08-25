import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePairingCode(length = 8) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export function createPairingStore(filePath) {
  const state = { pending: {}, /** @type {number[]} */ approved: [] }
  if (filePath && existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'))
      if (Array.isArray(raw.approved)) state.approved = raw.approved.map(Number).filter(Number.isFinite)
      if (raw.pending && typeof raw.pending === 'object') state.pending = raw.pending
    } catch {}
  }
  const persist = () => {
    if (!filePath) return
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify({ approved: state.approved, pending: state.pending }, null, 2))
  }
  const prune = () => {
    const now = Date.now()
    for (const [code, row] of Object.entries(state.pending)) {
      if (!row || now > Number(row.expiresAt || 0)) delete state.pending[code]
    }
  }
  return {
    listApproved: () => [...state.approved],
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
      // rate: 1 per user / 10 min
      const recent = Object.values(state.pending).find((r) => Number(r.userId) === uid && Date.now() - Number(r.createdAt || 0) < 600_000)
      if (recent) {
        const err = new Error('pairing rate limited')
        err.code = 'RATE_LIMIT'
        throw err
      }
      if (Object.keys(state.pending).length >= 20) {
        const err = new Error('too many pending pairing codes')
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
  }
}
