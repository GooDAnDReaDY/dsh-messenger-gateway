/** Forum topic / thread helpers (Telegram message_thread_id). */

export function normalizeThreadId(threadId) {
  const n = Number(threadId)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.trunc(n)
}

/** Stable session key: one agent per platform+chat+topic. */
export function chatKey(platform, chatId, threadId = 0) {
  return `${platform}:${chatId}:${normalizeThreadId(threadId)}`
}

export function parseChatKey(key) {
  const parts = String(key || '').split(':')
  if (parts.length < 2) return null
  const platform = parts[0]
  const chatId = parts[1]
  const threadId = parts.length >= 3 ? normalizeThreadId(parts[2]) : 0
  return { platform, chatId, threadId }
}

/** Extra Telegram API fields for forum topic replies. */
export function telegramThreadParams(threadId) {
  const tid = normalizeThreadId(threadId)
  return tid > 0 ? { message_thread_id: tid } : {}
}
