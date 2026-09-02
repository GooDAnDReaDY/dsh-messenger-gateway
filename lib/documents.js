import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'

/** Format a cached inbound document/video path for the agent (fs tools). */
export function formatInboundDocument(att, parsed = null) {
  const kind = att?.kind || 'document'
  const labels = { video: 'Видео', sticker: 'Стикер', animation: 'GIF', document: 'Документ' }
  const label = labels[kind] || 'Файл'
  const name = att?.name ? ` ${att.name}` : ''
  const mime = att?.mime ? ` (${att.mime})` : ''
  const emoji = att?.emoji ? ` emoji=${att.emoji}` : ''
  let base = `[${label}${name}${mime}${emoji}]\nПуть: ${att.path}`

  if (parsed?.text) {
    const truncNote = parsed.truncated ? ' (содержимое усечено)' : ''
    base += `\n\n[Распознанный текст из файла${truncNote}]:\n\`\`\`\n${parsed.text}\n\`\`\``
  }
  return base
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
  '.md', '.txt', '.csv', '.tsv', '.log', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh', '.bash', '.zsh', '.ps1',
  '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.rb', '.php',
  '.html', '.css', '.scss', '.sql', '.r', '.swift', '.vue', '.svelte',
])

export function extractPdfText(buffer) {
  const content = buffer.toString('binary')
  const textBlocks = []
  // Matches text inside BT ... ET blocks
  const btRegex = /BT[\s\S]*?ET/g
  let btMatch
  while ((btMatch = btRegex.exec(content)) !== null) {
    const block = btMatch[0]
    // Matches (text) Tj
    const tjRegex = /\((.*?)\)\s*Tj/g
    let tjMatch
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textBlocks.push(tjMatch[1])
    }
    // Matches [(t1) 10 (t2)] TJ
    const arrayRegex = /\[(.*?)\]\s*TJ/g
    let arrMatch
    while ((arrMatch = arrayRegex.exec(block)) !== null) {
      const inner = arrMatch[1]
      const strRegex = /\((.*?)\)/g
      let strMatch
      while ((strMatch = strRegex.exec(inner)) !== null) {
        textBlocks.push(strMatch[1])
      }
    }
  }

  // Also check plain text streams if no BT/ET blocks were matched
  if (!textBlocks.length) {
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g
    let sMatch
    while ((sMatch = streamRegex.exec(content)) !== null) {
      const stream = sMatch[1]
      const strRegex = /\(([\w\s.,;:!?-]{4,})\)/g
      let strMatch
      while ((strMatch = strRegex.exec(stream)) !== null) {
        textBlocks.push(strMatch[1])
      }
    }
  }

  return textBlocks.join(' ').replace(/\\([()\\])/g, '$1').trim()
}

export function extractDocxText(buffer) {
  // Locate word/document.xml inside ZIP local file headers
  let pos = 0
  const needle = Buffer.from('word/document.xml', 'utf8')
  while (pos < buffer.length - 30) {
    // Local file header signature: 0x04034b50
    if (buffer[pos] === 0x50 && buffer[pos + 1] === 0x4b && buffer[pos + 2] === 0x03 && buffer[pos + 3] === 0x04) {
      const compMethod = buffer.readUInt16LE(pos + 8)
      const compSize = buffer.readUInt32LE(pos + 18)
      const nameLen = buffer.readUInt16LE(pos + 26)
      const extraLen = buffer.readUInt16LE(pos + 28)
      const nameStart = pos + 30
      const nameBuf = buffer.slice(nameStart, nameStart + nameLen)

      if (nameBuf.equals(needle)) {
        const dataStart = nameStart + nameLen + extraLen
        const compData = buffer.slice(dataStart, dataStart + compSize)
        let xmlStr = ''
        try {
          if (compMethod === 8) {
            xmlStr = inflateRawSync(compData).toString('utf8')
          } else {
            xmlStr = compData.toString('utf8')
          }
        } catch {
          return ''
        }
        // Extract all text inside <w:t>...</w:t> tags
        const textParts = []
        const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
        let tMatch
        while ((tMatch = tRegex.exec(xmlStr)) !== null) {
          textParts.push(tMatch[1])
        }
        return textParts.join(' ').trim()
      }
      pos = nameStart + nameLen + extraLen + compSize
    } else {
      pos++
    }
  }
  return ''
}

export async function parseDocument(filePath, opts = {}) {
  const { maxBytes = 64 * 1024 } = opts
  const ext = extname(filePath).toLowerCase()

  try {
    const rawBuffer = await readFile(filePath)
    let text = ''
    let parsedType = 'text'

    if (ext === '.pdf') {
      parsedType = 'pdf'
      text = extractPdfText(rawBuffer)
    } else if (ext === '.docx') {
      parsedType = 'docx'
      text = extractDocxText(rawBuffer)
    } else if (TEXT_INJECT_EXTS.has(ext)) {
      parsedType = ext.slice(1)
      text = rawBuffer.toString('utf8')
    } else {
      return { parsed: false, type: 'unsupported' }
    }

    text = text.trim()
    if (!text) return { parsed: false, type: parsedType }

    const originalLength = text.length
    let truncated = false
    if (text.length > maxBytes) {
      text = text.slice(0, maxBytes)
      truncated = true
    }

    return {
      parsed: true,
      type: parsedType,
      text,
      truncated,
      originalLength,
    }
  } catch (err) {
    return { parsed: false, error: err.message }
  }
}
