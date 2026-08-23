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
