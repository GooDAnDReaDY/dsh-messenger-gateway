import { readdir, stat, readFile } from 'node:fs/promises'
import { resolve, normalize, relative, join, extname } from 'node:path'

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)
  return `${val} ${units[i]}`
}

export function resolveSafePath(baseCwd, userPath = '.') {
  const base = resolve(normalize(baseCwd || process.cwd()))
  const cleanUser = String(userPath || '').trim() || '.'
  const target = resolve(base, cleanUser)

  const rel = relative(base, target)
  if (rel.startsWith('..') || (rel && resolve(base, rel) !== target)) {
    const err = new Error('Access denied: path traversal out of workspace')
    err.code = 'ERR_PATH_TRAVERSAL'
    throw err
  }
  return { base, target, relativePath: rel || '.' }
}

export async function listFiles(baseCwd, subPath = '.', opts = {}) {
  const { maxEntries = 50, showHidden = false } = opts
  const { base, target, relativePath } = resolveSafePath(baseCwd, subPath)

  let st
  try {
    st = await stat(target)
  } catch (err) {
    return { ok: false, error: `Каталог не найден: ${err.message}` }
  }

  if (!st.isDirectory()) {
    return {
      ok: true,
      isDirectory: false,
      currentPath: relativePath,
      entries: [{ name: relativePath, size: st.size, isDirectory: false }],
      formattedText: `📄 <b>${relativePath}</b> (${formatFileSize(st.size)})\nДля скачивания: <code>/get ${relativePath}</code>`,
    }
  }

  const rawEntries = await readdir(target, { withFileTypes: true })
  const entries = []

  for (const entry of rawEntries) {
    if (!showHidden && (entry.name.startsWith('.') || entry.name === 'node_modules')) {
      continue
    }
    const full = join(target, entry.name)
    try {
      const entryStat = await stat(full)
      entries.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entryStat.size,
        mtime: entryStat.mtimeMs,
      })
    } catch {
      entries.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: 0,
        mtime: 0,
      })
    }
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  const total = entries.length
  const sliced = entries.slice(0, maxEntries)

  const lines = [
    `📂 <b>Файлы: <code>${relativePath === '.' ? '/' : `/${relativePath}`}</code></b> (${total} элементов):`,
    '',
  ]

  if (relativePath !== '.') {
    lines.push('📁 <code>..</code> (на уровень выше: <code>/files ..</code>)')
  }

  for (const e of sliced) {
    if (e.isDirectory) {
      lines.push(`📁 <code>${e.name}/</code>`)
    } else {
      lines.push(`📄 <code>${e.name}</code> (${formatFileSize(e.size)})`)
    }
  }

  if (total > maxEntries) {
    lines.push(`\n<i>... и ещё ${total - maxEntries} файлов</i>`)
  }

  lines.push('\nСкачать файл: <code>/get <файл></code>\nПереход по папкам: <code>/files <папка></code>')

  return {
    ok: true,
    isDirectory: true,
    currentPath: relativePath,
    total,
    entries: sliced,
    formattedText: lines.join('\n'),
  }
}

export async function getFileForDownload(baseCwd, relativePath, maxBytes = 50 * 1024 * 1024) {
  const { target, relativePath: safeRel } = resolveSafePath(baseCwd, relativePath)
  let st
  try {
    st = await stat(target)
  } catch (err) {
    return { ok: false, error: `Файл не найден: ${safeRel}` }
  }

  if (st.isDirectory()) {
    return { ok: false, error: `«${safeRel}» является каталогом, а не файлом. Список: /files ${safeRel}` }
  }

  if (st.size > maxBytes) {
    return {
      ok: false,
      error: `Файл слишком большой (${formatFileSize(st.size)} > ${formatFileSize(maxBytes)}).`,
    }
  }

  const bytes = await readFile(target)
  const ext = extname(safeRel).toLowerCase()

  const mimeMap = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.html': 'text/html',
  }

  const mime = mimeMap[ext] || 'application/octet-stream'

  return {
    ok: true,
    name: safeRel.split(/[\\/]/).pop(),
    relativePath: safeRel,
    bytes,
    size: st.size,
    mime,
  }
}
