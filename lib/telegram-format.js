export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const PH = '\uE000'

/** Convert common Markdown from LLM replies to Telegram HTML parse_mode. */
export function markdownToTelegramHtml(markdown) {
  let text = String(markdown ?? '')
  const slots = []

  const stash = (html) => {
    const id = slots.length
    slots.push(html)
    return `${PH}${id}${PH}`
  }

  text = text.replace(/```([\s\S]*?)```/g, (_, code) => stash(`<pre><code>${escapeHtml(code.replace(/^\n/, '').replace(/\n$/, ''))}</code></pre>`))
  text = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`))
  text = escapeHtml(text)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${escapeHtml(url)}">${label}</a>`)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>')
  text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>')
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
  for (let i = 0; i < slots.length; i++) text = text.replace(`${PH}${i}${PH}`, slots[i])
  return text
}

export function prepareTelegramText(text, format = 'html') {
  const raw = String(text ?? '')
  if (!raw || format === 'plain') return { text: raw, parseMode: undefined }
  return { text: markdownToTelegramHtml(raw), parseMode: 'HTML' }
}
