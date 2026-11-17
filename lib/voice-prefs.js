import { writeJsonAtomicSync, readJsonStateSync, StateCorruptError } from "./storage-atomic.js"

const VOICE_PREFS_SCHEMA_VERSION = 1

// Legacy files store the prefs map at the top level; v1 wraps it so the
// schema version field never collides with a user id key (#227).
const migrateVoicePrefs = (raw) => ({
  schemaVersion: VOICE_PREFS_SCHEMA_VERSION,
  prefs: raw && typeof raw === "object" ? raw : {},
})

const logLoadFailure = (logger, kind, err) => {
  const detail = err instanceof StateCorruptError
    ? `state file corrupted and unrecoverable; starting empty; corrupted copy preserved at ${err.corruptBackup || "an unknown path"}`
    : `read error: ${err?.message || err}`
  const message = `[dsh-messenger-gateway] ${kind} ${detail}`
  if (typeof logger?.error === "function") logger.error(message)
  else logger?.warn?.(message)
}

/** @param {string} filePath @param {any} [opts] */
export function createVoicePrefs(filePath, { logger, kind = "voice prefs" } = {}) {
  /** @type {Record<string, boolean>} */
  let state = {}
  if (filePath) {
    try {
      const { data, recovered, corruptBackup } = readJsonStateSync(filePath, {
        version: VOICE_PREFS_SCHEMA_VERSION,
        migrate: migrateVoicePrefs,
      })
      if (data) state = data.prefs && typeof data.prefs === "object" ? data.prefs : {}
      if (recovered) {
        logger?.warn?.(`[dsh-messenger-gateway] ${kind} recovered from .bak after corruption; preserved copy: ${corruptBackup}`)
      }
    } catch (err) {
      if (err instanceof StateCorruptError || err?.name === "StateVersionError") logLoadFailure(logger, kind, err)
      else logger?.warn?.(`[dsh-messenger-gateway] ${kind} read error:`, err?.message || err)
    }
  }
  const persist = () => {
    if (!filePath) return
    try {
      writeJsonAtomicSync(filePath, { schemaVersion: VOICE_PREFS_SCHEMA_VERSION, prefs: state })
    } catch (err) {
      logger?.warn?.(`[dsh-messenger-gateway] ${kind} persist error:`, err?.message || err)
    }
  }
  const key = (userId) => String(Number(userId) || userId || "")
  return {
    get(userId) {
      const k = key(userId)
      if (!k || !(k in state)) return null
      return Boolean(state[k])
    },
    set(userId, enabled) {
      const k = key(userId)
      if (!k) return false
      state[k] = Boolean(enabled)
      persist()
      return true
    },
  }
}

/** Decide whether to speak the reply. */
export function shouldSpeakReply({ globalTts, voiceMode, inboundWasVoice, userPref, chatPref }) {
  if (chatPref === false) return false
  if (chatPref === true) return true
  if (globalTts) return true
  if (userPref === true) return true
  if (userPref === false) return false
  if (voiceMode === "always") return true
  if (voiceMode === "off") return false
  // mirror: speak if inbound was voice
  return Boolean(inboundWasVoice)
}