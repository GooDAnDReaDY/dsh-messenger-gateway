import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"

function writeJsonAtomicSync(filePath, data) {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8")
    renameSync(tmpPath, filePath)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch {}
    throw err
  }
}

export function createVoicePrefs(filePath) {
  /** @type {Record<string, boolean>} */
  let state = {}
  if (filePath && existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"))
      if (raw && typeof raw === "object") state = raw
    } catch {}
  }
  const persist = () => {
    if (!filePath) return
    try {
      writeJsonAtomicSync(filePath, state)
    } catch {}
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