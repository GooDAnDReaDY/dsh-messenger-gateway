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

export function parseChatKey(key) {
  const parts = String(key || "").split(":")
  if (parts.length < 2) return null
  const platform = parts[0]
  const chatId = parts[1]
  const threadId = parts.length >= 3 ? normalizeThreadId(parts[2]) : 0
  const out = { platform, chatId, threadId }
  if (parts.length >= 5 && parts[3] === "u") {
    const userId = Number(parts[4])
    if (Number.isFinite(userId)) out.userId = userId
  }
  return out
}

/** Extra Telegram API fields for forum topic replies. */
export function telegramThreadParams(threadId) {
  const tid = normalizeThreadId(threadId)
  return tid > 0 ? { message_thread_id: tid } : {}
}
