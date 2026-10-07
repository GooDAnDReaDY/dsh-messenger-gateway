import { open } from 'node:fs/promises'
import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'

/** Format a cached inbound document/video path for the agent (fs tools). */
export function formatInboundDocument(att, parsed = null) {
  const kind = att?.kind || 'document'
  const labels = { video: 'Video', sticker: 'Sticker', animation: 'GIF', document: 'Document' }
  const label = labels[kind] || 'File'
  const name = att?.name ? ` ${att.name}` : ''
  const mime = att?.mime ? ` (${att.mime})` : ''
  const emoji = att?.emoji ? ` emoji=${att.emoji}` : ''
  let base = `[${label}${name}${mime}${emoji}]\nPath: ${att.path}`

  if (parsed?.text) {
    const truncNote = parsed.truncated ? ' (content truncated)' : ''
    base += `\n\n[Extracted text from file${truncNote}]:\n\`\`\`\n${parsed.text}\n\`\`\``
  }
  return base
}

export function documentOnlyHint(attachments, userText) {
  if (String(userText || '').trim()) return ''
  const docs = attachments.filter((a) => ['document', 'video', 'sticker', 'animation'].includes(a.kind))
  if (!docs.length) return ''
  if (docs.length === 1) {
    const k = docs[0].kind
    if (k === 'sticker') return '[User sent a sticker]'
    if (k === 'video' || k === 'animation') return '[User sent a video]'
    return '[User sent a file]'
  }
  return `[User sent ${docs.length} files]`
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
    const handle = await open(filePath, 'r')
    let rawBuffer
    let truncated = false
    let originalLength = 0

    try {
      const st = await handle.stat()
      originalLength = st.size

      if (TEXT_INJECT_EXTS.has(ext)) {
        const toRead = Math.min(st.size, maxBytes)
        const buf = Buffer.alloc(toRead)
        const { bytesRead } = await handle.read(buf, 0, toRead, 0)
        rawBuffer = buf.subarray(0, bytesRead)
        truncated = st.size > toRead
      } else if (ext === '.pdf' || ext === '.docx') {
        const maxBinary = Math.max(maxBytes * 4, 10 * 1024 * 1024)
        if (st.size > maxBinary) {
          return { parsed: false, error: `File size (${st.size} bytes) exceeds safety parse limit` }
        }
        const buf = Buffer.alloc(st.size)
        const { bytesRead } = await handle.read(buf, 0, st.size, 0)
        rawBuffer = buf.subarray(0, bytesRead)
      } else {
        return { parsed: false, type: 'unsupported' }
      }
    } finally {
      await handle.close()
    }

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
    }

    text = text.trim()
    if (!text) return { parsed: false, type: parsedType }

    if (text.length > maxBytes) {
      text = text.slice(0, maxBytes)
      truncated = true
    }

    return {
      parsed: true,
      type: parsedType,
      text,
      truncated,
      originalLength: originalLength || text.length,
    }
  } catch (err) {
    return { parsed: false, error: err.message }
  }
}

