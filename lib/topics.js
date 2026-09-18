/** Forum topic / thread helpers (Telegram message_thread_id). */

export function normalizeThreadId(threadId) {
  const n = Number(threadId)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.trunc(n)
}

/** Stable base key: platform+chat+topic. */
export function chatKey(platform, chatId, threadId = 0) {
  return `${platform}:${chatId}:${normalizeThreadId(threadId)}`
}

/**
 * Session map key.
 * scope=user in groups → one agent per user in that chat/topic.
 * Private chats ignore user suffix (already 1:1).
 */
export function sessionKey({ platform, chatId, threadId = 0, userId, chatType, scope = "chat" }) {
  const base = chatKey(platform, chatId, threadId)
  const isGroup = chatType === "group" || chatType === "supergroup"
  if (scope === "user" && isGroup && userId != null && Number.isFinite(Number(userId))) {
    return `${base}:u:${Number(userId)}`
  }
  return base
}

/** Extra Telegram API fields for forum topic replies. */
export function telegramThreadParams(threadId) {
  const tid = normalizeThreadId(threadId)
  return tid > 0 ? { message_thread_id: tid } : {}
}
