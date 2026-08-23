import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

export const TELEGRAM_MAX_DOC_BYTES = 20 * 1024 * 1024

export const SUPPORTED_DOCUMENT_TYPES = {
  '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv',
  '.log': 'text/plain', '.json': 'application/json', '.xml': 'application/xml',
  '.yaml': 'application/yaml', '.yml': 'application/yaml', '.toml': 'application/toml',
  '.ini': 'text/plain', '.cfg': 'text/plain', '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ts': 'text/plain', '.py': 'text/plain', '.sh': 'text/plain',
}

export const IMAGE_EXT_TO_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
}

export const VIDEO_EXT_TO_MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
}

export function extOf(name, mime) {
  let ext = name ? extname(name).toLowerCase() : ''
  const m = String(mime || '').toLowerCase()
  if (!ext && m) ext = Object.entries(IMAGE_EXT_TO_MIME).find(([, v]) => v === m)?.[0] || ''
  return ext
}

export function classifyDocument(ext, mime) {
  const m = String(mime || '').toLowerCase()
  if (IMAGE_EXT_TO_MIME[ext] || m.startsWith('image/')) return 'image'
  if (VIDEO_EXT_TO_MIME[ext] || Object.values(VIDEO_EXT_TO_MIME).includes(m)) return 'video'
  if (SUPPORTED_DOCUMENT_TYPES[ext]) return 'doc'
  return 'unsupported'
}

export function mediaKindOf(path) {
  const ext = extname(path).toLowerCase()
  if (IMAGE_EXT_TO_MIME[ext]) return 'photo'
  if (['.ogg', '.opus', '.oga'].includes(ext)) return 'voice'
  if (['.mp3', '.m4a', '.wav', '.flac'].includes(ext)) return 'audio'
  return 'document'
}

export function safeName(name) {
  return String(name || 'file').replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'file'
}

export function saveToCache(cacheDir, name, bytes) {
  mkdirSync(cacheDir, { recursive: true })
  const path = join(cacheDir, name)
  writeFileSync(path, bytes)
  return path
}

export function cacheName(prefix, ext, name) {
  const base = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const display = name ? safeName(name) : ''
  return display ? `${base}-${display}${ext || ''}` : `${base}${ext || ''}`
}

export { basename }
