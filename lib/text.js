export function splitText(text, maxLen) {
  const raw = String(text ?? '')
  if (raw.length <= maxLen) return [raw]
  const chunks = []
  let rest = raw
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen)
    if (cut < maxLen / 2) cut = rest.lastIndexOf(' ', maxLen)
    if (cut < maxLen / 2) cut = maxLen
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trimStart()
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks
}

export function assistantText(message) {
  return (message?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}


/** Drop English reasoning preamble before the user-facing reply (Telegram). */
export function stripReasoningPreamble(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return raw
  const paragraphs = raw.split(/\n\n+/)
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const cyrillic = (p.match(/[\u0400-\u04FF]/g) || []).length
    const latin = (p.match(/[A-Za-z]/g) || []).length
    if (cyrillic >= 12 && cyrillic > latin) return paragraphs.slice(i).join('\n\n').trim()
  }
  return raw
}

export const MESSENGER_RELAY_INSTRUCTION = 'Channel: Messenger. Reply concisely and directly to the user. Do not leak internal reasoning or planning traces.'

/**
 * Truncate string to maxLen without splitting UTF-16 surrogate pairs.
 * If the cut falls on a high surrogate, drops the high surrogate so the string is well-formed.
 */
export function truncateSafe(str, maxLen = 80) {
  const raw = String(str ?? '')
  if (raw.length <= maxLen) return raw
  let sliced = raw.slice(0, maxLen)
  const lastCode = sliced.charCodeAt(sliced.length - 1)
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    sliced = sliced.slice(0, -1)
  }
  if (typeof sliced.isWellFormed === 'function' && !sliced.isWellFormed()) {
    sliced = sliced.replace(/[\uD800-\uDFFF]+$/, '')
  }
  return sliced
}
