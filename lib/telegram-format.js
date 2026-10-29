export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const PH = '\uE000'

// Telegram HTML поддерживает только этот набор тегов; всё остальное (<script>,
// атрибуты, произвольные теги) обязано остаться текстом. Командные ответы самого
// плагина написаны HTML-тегами (<b>, <code>, ...), а конвейер рассчитан на
// Markdown и экранирует весь вход — из-за этого в чате были видны литеральные
// теги. Поэтому теги из белого списка вынимаем в слоты до экранирования и
// возвращаем уже как разметку.
const SAFE_TAG_NAMES = 'b|strong|i|em|u|s|strike|del|code|pre|tg-spoiler|blockquote'
const SAFE_TAG_RE = new RegExp(`<(/?)(${SAFE_TAG_NAMES})>`, 'gi')
const SAFE_ANCHOR_RE = /<a\s+href="([^"]{1,512})"\s*>/gi

const ENTITIES = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': '\u00a0',
}

/**
 * Однопроходное раскрытие типовых HTML-сущностей: плагин пишет `&lt;role&gt;`
 * там, где нужен текст `<role>`, а Markdown-конвейер ждёт обычный текст.
 * `&amp;` раскрывается последним, поэтому `&amp;lt;` остаётся `&lt;`.
 */
export function decodeHtmlEntities(text) {
  return String(text ?? '').replace(/&(lt|gt|quot|#39|apos|nbsp);|&amp;/g, (match) => ENTITIES[match] ?? '&')
}

const SAFE_TAG_ANY_RE = new RegExp(`<a\\s+href="([^"]{1,512})"\\s*>|<blockquote(\\s+expandable)?>|<(/?)(${SAFE_TAG_NAMES}|a)>`, 'gi')

/**
 * Вынимает в слоты только сбалансированные теги из белого списка. Незакрытый
 * `</b>` или тег с атрибутами (`<b onclick=...>`) остаются текстом и будут
 * экранированы — иначе Telegram отвергнет сообщение как невалидную разметку.
 */
function protectSafeTags(text, stash) {
  const open = []
  return text.replace(SAFE_TAG_ANY_RE, (match, href, expandable, closing, rawName) => {
    if (href !== undefined) {
      if (!isSafeUrl(href)) return match
      open.push('a')
      return stash(match)
    }
    if (expandable !== undefined) {
      open.push('blockquote')
      return stash(match)
    }
    const tag = String(rawName || 'a').toLowerCase()
    if (closing) {
      const index = open.lastIndexOf(tag)
      if (index === -1) return match
      open.splice(index, 1)
      return stash(match)
    }
    open.push(tag)
    return stash(match)
  })
}

/** Для режима plain: убрать разметку и раскрыть сущности, оставив чистый текст. */
export function stripSafeTags(text) {
  return decodeHtmlEntities(text)
    .replace(SAFE_ANCHOR_RE, '')
    .replace(/<\/a>/gi, '')
    .replace(/<blockquote\b[^>]*>/gi, '')
    .replace(SAFE_TAG_RE, '')
}

const SAFE_SCHEMES = new Set(['https:', 'http:', 'tg:'])

export function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  const clean = rawUrl.replace(/&amp;/g, '&').trim()
  try {
    const parsed = new URL(clean)
    return SAFE_SCHEMES.has(parsed.protocol.toLowerCase())
  } catch {
    if (/^tg:\/\//i.test(clean)) return true
    return false
  }
}

export function formatSafeLink(label, url) {
  if (!isSafeUrl(url)) {
    return `${label} (${url})`
  }
  return `<a href="${url.replace(/"/g, '%22')}">${label}</a>`
}

// Render inline markdown (bold/italic/code/links) inside already-HTML-escaped text.
function renderInline(t) {
  let s = escapeHtml(t)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => formatSafeLink(label, url))
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

  text = decodeHtmlEntities(text)
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => stash(`<pre><code>${escapeHtml(code.replace(/^\n/, '').replace(/\n$/, ''))}</code></pre>`))
  text = text.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`))
  text = protectSafeTags(text, stash)
  text = convertTables(text, stash)
  text = convertDetails(text, stash)
  text = convertTaskLists(text, stash)
  text = escapeHtml(text)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => formatSafeLink(label, url))
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
  if (!raw) return { text: raw, parseMode: undefined }
  if (format === 'plain') return { text: stripSafeTags(raw), parseMode: undefined }
  return { text: markdownToTelegramHtml(raw), parseMode: 'HTML' }
}
