/** Prepare agent text for dsh-tts and map audio to Telegram voice messages. */

export const DEFAULT_TTS_MAX_CHARS = 4000

export function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function prepareTtsText(answer, maxChars = DEFAULT_TTS_MAX_CHARS) {
  const stripped = stripMarkdownForSpeech(answer)
  if (!stripped || stripped.length < 2) return ''
  const limit = Math.max(1, Number(maxChars) || DEFAULT_TTS_MAX_CHARS)
  return stripped.slice(0, limit)
}

export function voiceFileNameForMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('ogg') || m.includes('opus')) return 'reply.ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'reply.mp3'
  if (m.includes('wav')) return 'reply.wav'
  return 'reply.dat'
}

export function voiceReplyFile(spoken) {
  const mime = spoken?.mime || 'audio/mpeg'
  return {
    bytes: spoken.audio,
    mime,
    kind: 'voice',
    name: voiceFileNameForMime(mime),
  }
}
