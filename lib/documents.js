/** Format a cached inbound document/video path for the agent (fs tools). */
export function formatInboundDocument(att) {
  const kind = att?.kind || 'document'
  const labels = { video: 'Видео', sticker: 'Стикер', animation: 'GIF', document: 'Документ' }
  const label = labels[kind] || 'Файл'
  const name = att?.name ? ` ${att.name}` : ''
  const mime = att?.mime ? ` (${att.mime})` : ''
  const emoji = att?.emoji ? ` emoji=${att.emoji}` : ''
  return `[${label}${name}${mime}${emoji}]\nПуть: ${att.path}`
}

export function documentOnlyHint(attachments, userText) {
  if (String(userText || '').trim()) return ''
  const docs = attachments.filter((a) => ['document', 'video', 'sticker', 'animation'].includes(a.kind))
  if (!docs.length) return ''
  if (docs.length === 1) {
    const k = docs[0].kind
    if (k === 'sticker') return '[Пользователь отправил стикер]'
    if (k === 'video' || k === 'animation') return '[Пользователь отправил видео]'
    return '[Пользователь отправил файл]'
  }
  return `[Пользователь отправил ${docs.length} файла]`
}

export const TEXT_INJECT_EXTS = new Set([
  '.md', '.txt', '.csv', '.log', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh', '.bash', '.zsh', '.ps1',
  '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.rb', '.php',
  '.html', '.css', '.scss', '.sql', '.r', '.swift', '.vue', '.svelte',
])
