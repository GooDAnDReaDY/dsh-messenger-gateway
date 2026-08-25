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

export const MESSENGER_RELAY_INSTRUCTION = 'Канал: Telegram. Отвечай только пользователю по-русски. Не выводи ход рассуждений, планирование и служебный текст на английском.'
