import { en } from './en.js'
import { zh } from './zh.js'

export const locales = { en, zh }

export function getLocaleDictionary(locale = 'en') {
  const norm = String(locale || '').toLowerCase()
  if (norm.startsWith('zh')) return zh
  return en
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function t(key, params = {}, locale = 'en', options = {}) {
  const dict = getLocaleDictionary(locale)
  let template = dict[key] || en[key] || key
  const escape = options.escape !== false
  for (const [k, v] of Object.entries(params)) {
    const val = escape ? escapeHtml(v) : String(v)
    template = template.replaceAll(`{${k}}`, val)
  }
  return template
}

export { en, zh }
