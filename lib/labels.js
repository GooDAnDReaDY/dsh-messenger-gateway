/**
 * Human-readable session titles built from the originating chat.
 *
 * A messenger session is otherwise titled by DSH's own generator, which only sees
 * the message text and cannot tell two chats apart. Labelling the session with
 * "TG · @user" (DM) or "TG · Group › topic N" (group/forum topic) makes the
 * sidebar and the session list unambiguous when one bot serves many chats.
 */

const PLATFORM_TAGS = { telegram: 'TG', discord: 'DC', slack: 'SL' }

/**
 * Short platform tag used as the title prefix.
 * @param platform - adapter platform id.
 * @returns a 2-3 character tag, e.g. `TG`.
 */
export function platformTag(platform) {
  const key = String(platform || '').toLowerCase()
  return PLATFORM_TAGS[key] || key.slice(0, 2).toUpperCase() || 'MSG'
}

/**
 * Truncate a string to a UTF-8 byte budget without splitting a code point.
 * @param text - source text.
 * @param maxBytes - byte budget (0/undefined = no limit).
 * @returns the text, or its head plus an ellipsis when it does not fit.
 */
export function truncateBytes(text, maxBytes) {
  const value = String(text || '')
  if (!maxBytes || Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  // The ellipsis is multi-byte too: reserve its size instead of assuming one byte.
  const budget = maxBytes - Buffer.byteLength('…', 'utf8')
  let out = ''
  for (const char of value) {
    if (Buffer.byteLength(out + char, 'utf8') > budget) break
    out += char
  }
  return `${out}…`
}

/**
 * Compose the session title prefix for one chat.
 * @param input - platform, chatType, chatTitle, threadId, userName, userUsername, maxBytes.
 * @returns a single-line label such as `TG · @vi468` or `TG · Argo Navis › topic 5122`.
 */
export function chatLabel(input = {}) {
  const {
    platform, chatType, chatTitle, threadId, userName, userUsername, maxBytes = 60,
  } = input
  const tag = platformTag(platform)
  const isPrivate = !chatType || chatType === 'private'
  let base
  if (isPrivate) {
    const name = String(userName || chatTitle || '').trim() || 'DM'
    const handle = String(userUsername || '').replace(/^@/, '').trim()
    base = handle ? `@${handle}` : name
  } else {
    const title = String(chatTitle || '').trim() || 'group'
    base = threadId ? `${title} › topic ${threadId}` : title
  }
  return truncateBytes(`${tag} · ${base.replace(/\s+/g, ' ')}`, maxBytes)
}
