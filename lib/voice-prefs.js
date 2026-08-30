import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"

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
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(state, null, 2))
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
