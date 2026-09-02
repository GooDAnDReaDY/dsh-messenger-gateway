export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const PH = '\uE000'

// Render inline markdown (bold/italic/code/links) inside already-HTML-escaped text.
function renderInline(t) {
  let s = escapeHtml(t)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${url.replace(/"/g, '%22')}">${label}</a>`)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>')
  return s
}

function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

function isTableDelimiter(line) {
  const s = line.trim()
  if (!s.startsWith('|') || !s.endsWith('|')) return false
  const cells = s.split('|').slice(1, -1)
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()))
}

// GFM pipe tables → bold heading + bullet rows (Telegram HTML has no table syntax).
function convertTables(text, stash) {
  const lines = text.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const headers = splitRow(line)
      const rows = []
      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && !isTableDelimiter(lines[j])) {
        rows.push(splitRow(lines[j]))
        j++
      }
      let blocks
      if (headers.length === 2) {
        // key/value table → bullet list, no separate heading row
        blocks = rows.map((row) => `• <b>${renderInline(row[0] || '')}</b>: ${renderInline(row[1] || '')}`)
      } else {
        blocks = rows.map((row) => {
          const heading = renderInline(row[0] || '')
          const bullets = headers
            .slice(1)
            .map((h, idx) => {
              const val = (row[idx + 1] || '').trim()
              if (!val) return null
              return `• ${renderInline(h)}: ${renderInline(val)}`
            })
            .filter(Boolean)
          return bullets.length ? `<b>${heading}</b>\n${bullets.join('\n')}` : `<b>${heading}</b>`
        })
      }
      out.push(stash(blocks.join('\n\n')))
      i = j
      continue
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

// GFM task lists → checkbox glyphs.
function convertTaskLists(text, stash) {
  const lines = text.split('\n')
  const out = []
  let buf = []
  const flush = () => {
    if (buf.length) {
      out.push(stash(buf.join('\n')))
      buf = []
    }
  }
  for (const line of lines) {
    const m = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (m) {
      buf.push(`${m[1]}${m[2].toLowerCase() === 'x' ? '☑' : '☐'} ${renderInline(m[3])}`)
    } else {
      flush()
      out.push(line)
    }
  }
  flush()
  return out.join('\n')
}

// <details><summary>..</summary>..</details> → bold summary + body (no native collapse in HTML).
function convertDetails(text, stash) {
  return text.replace(
    /<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
    (_, summary, body) => stash(`<b>${renderInline(summary.trim())}</b>\n${renderInline(body.trim())}`),
  )
}

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
  text = convertTables(text, stash)
  text = convertDetails(text, stash)
  text = convertTaskLists(text, stash)
  text = escapeHtml(text)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${url.replace(/"/g, '%22')}">${label}</a>`)
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
