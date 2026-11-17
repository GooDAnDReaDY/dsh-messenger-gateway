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

/**
 * Split raw markdown into chunks whose FORMATTED rendering (measured by
 * `measure`) stays within `budget`, so no HTML tag is ever cut at a chunk
 * boundary (#229). Fence-aware: lines inside ``` fences always stay with
 * their block. A single oversized unit (huge fenceless line) is hard-split.
 *
 * @param {string} text raw markdown
 * @param {number} budget max allowed length of the FORMATTED chunk
 * @param {(s: string) => string} measure renders raw markdown to its
 *   Telegram HTML form (used for length measurement)
 * @returns {string[]} raw markdown chunks (format each separately)
 */
export function splitMarkdownForTelegram(text, budget, measure) {
  const raw = String(text ?? '')
  if (measure(raw).length <= budget) return [raw]
  const chunks = []
  let cur = ''
  let fence = false

  const flushCur = () => {
    const trimmed = cur.replace(/^\n+/, '').replace(/\n+$/, '')
    if (trimmed) chunks.push(trimmed)
    cur = ''
  }

  for (const line of raw.split('\n')) {
    if (line.trimStart().startsWith('```')) fence = !fence
    const candidate = cur ? cur + '\n' + line : line
    if (fence || measure(candidate).length <= budget) {
      // Inside a fence we must keep the block intact even over budget; the
      // pathological single-fence-megablock case is hard-split below.
      cur = candidate
      continue
    }
    flushCur()
    cur = line
    if (measure(cur).length > budget) {
      // Single long line without fences: hard-split at word boundaries.
      while (measure(cur).length > budget) {
        let cut = cur.lastIndexOf(' ', budget)
        if (cut < budget / 2) cut = budget
        chunks.push(cur.slice(0, cut).trim())
        cur = cur.slice(cut).trim()
      }
    }
  }
  flushCur()
  return chunks.length > 0 ? chunks : [raw]
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
