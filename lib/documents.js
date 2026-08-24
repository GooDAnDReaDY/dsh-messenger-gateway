/** Format a cached inbound document/video path for the agent (fs tools). */
export function formatInboundDocument(att) {
  const kind = att?.kind || 'document'
  const label = kind === 'video' ? 'Видео' : 'Документ'
  const name = att?.name ? ` ${att.name}` : ''
  const mime = att?.mime ? ` (${att.mime})` : ''
  return `[${label}${name}${mime}]\nПуть: ${att.path}`
}

export function documentOnlyHint(attachments, userText) {
  if (String(userText || '').trim()) return ''
  const docs = attachments.filter((a) => a.kind === 'document' || a.kind === 'video')
  if (!docs.length) return ''
  if (docs.length === 1) return '[Пользователь отправил файл]'
  return `[Пользователь отправил ${docs.length} файла]`
}
