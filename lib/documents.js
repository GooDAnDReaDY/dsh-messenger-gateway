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
    if (parsed.type === 'zip') {
      base += `\n\n[Extracted archive structure and code${truncNote}]:\n\`\`\`\n${parsed.text}\n\`\`\``
    } else {
      base += `\n\n[Extracted text from file${truncNote}]:\n\`\`\`\n${parsed.text}\n\`\`\``
    }
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


const IGNORED_ZIP_DIRS = new Set([
  "node_modules", ".git", ".turbo", "dist", "build", "vendor", "__pycache__", ".venv", ".idea", ".vscode",
])

const IGNORED_ZIP_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "cargo.lock", "gemfile.lock", "poetry.lock",
])

const BINARY_ZIP_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".class", ".pyc", ".o", ".a", ".woff", ".woff2", ".ttf", ".eot",
])

export function isSafeZipPath(name) {
  if (!name || typeof name !== "string") return false
  const normalized = name.replace(/\\/g, "/")
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false
  const parts = normalized.split("/")
  if (parts.includes("..") || parts.includes(".")) return false
  return true
}

export function extractZipEntries(buffer, opts = {}) {
  const {
    maxEntries = 100,
    maxUncompressedBytes = 10 * 1024 * 1024,
    maxFileBytes = 512 * 1024,
  } = opts

  // Locate End of Central Directory Record (EOCD: 0x06054b50)
  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid zip: End of Central Directory signature not found")
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)

  const entries = []
  let pos = cdOffset
  let totalUncompressed = 0

  for (let idx = 0; idx < totalEntries && idx < maxEntries; idx++) {
    if (pos + 46 > buffer.length) break
    if (buffer.readUInt32LE(pos) !== 0x02014b50) break

    const compMethod = buffer.readUInt16LE(pos + 10)
    const compSize = buffer.readUInt32LE(pos + 20)
    const uncompSize = buffer.readUInt32LE(pos + 24)
    const nameLen = buffer.readUInt16LE(pos + 28)
    const extraLen = buffer.readUInt16LE(pos + 30)
    const commentLen = buffer.readUInt16LE(pos + 32)
    const localOffset = buffer.readUInt32LE(pos + 42)

    if (pos + 46 + nameLen > buffer.length) break
    const rawName = buffer.toString("utf8", pos + 46, pos + 46 + nameLen).replace(/\\/g, "/")
    pos += 46 + nameLen + extraLen + commentLen

    if (rawName.endsWith("/")) continue
    if (!isSafeZipPath(rawName)) continue

    totalUncompressed += uncompSize
    if (totalUncompressed > maxUncompressedBytes) {
      break
    }

    const parts = rawName.split("/")
    if (parts.some((p) => IGNORED_ZIP_DIRS.has(p.toLowerCase()))) continue
    const base = parts[parts.length - 1].toLowerCase()
    if (IGNORED_ZIP_FILES.has(base)) continue
    const ext = extname(base).toLowerCase()
    if (BINARY_ZIP_EXTS.has(ext)) continue

    if (localOffset + 30 > buffer.length) continue
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localNameLen = buffer.readUInt16LE(localOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen

    if (dataStart + compSize > buffer.length) continue
    const compData = buffer.subarray(dataStart, dataStart + compSize)

    let content = null
    const canExtract = uncompSize <= maxFileBytes && (TEXT_INJECT_EXTS.has(ext) || !ext)
    if (canExtract) {
      try {
        if (compMethod === 8) {
          content = inflateRawSync(compData).toString("utf8")
        } else if (compMethod === 0) {
          content = compData.toString("utf8")
        }
      } catch {
        content = null
      }
    }

    entries.push({
      name: rawName,
      size: uncompSize,
      ext,
      content,
    })
  }

  return { entries, totalInArchive: totalEntries, totalUncompressed }
}

export function formatZipSummary(extracted, maxBytes = 64 * 1024) {
  const { entries, totalInArchive } = extracted
  if (!entries.length) {
    return {
      text: `[Archive contains no readable code or text files (${totalInArchive} entries total)]`,
      fileCount: 0,
      truncated: false,
    }
  }

  let summary = `Archive structure (${entries.length} text files extracted, ${totalInArchive} total entries):\n`
  for (const entry of entries) {
    summary += `  - ${entry.name} (${entry.size} B)\n`
  }
  summary += "\n"

  let truncated = false
  for (const entry of entries) {
    if (!entry.content) continue
    const header = `--- File: ${entry.name} ---\n`
    const fileBlock = header + entry.content.trim() + "\n\n"
    if (summary.length + fileBlock.length > maxBytes) {
      const remaining = maxBytes - summary.length - header.length - 40
      if (remaining > 100) {
        summary += header + entry.content.slice(0, remaining).trim() + "\n... [File content truncated]\n\n"
      }
      summary += `[Archive ingestion truncated: remaining ${entries.length} files omitted to fit context]\n`
      truncated = true
      break
    }
    summary += fileBlock
  }

  return {
    text: summary.trim(),
    fileCount: entries.length,
    truncated,
  }
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
      } else if (ext === '.pdf' || ext === '.docx' || ext === '.zip') {
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

    if (ext === '.zip') {
      parsedType = 'zip'
      const extracted = extractZipEntries(rawBuffer, opts)
      const formatted = formatZipSummary(extracted, maxBytes)
      text = formatted.text
      truncated = formatted.truncated
    } else if (ext === '.pdf') {
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

