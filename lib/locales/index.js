import { en } from './en.js'
import { zh } from './zh.js'

export const locales = { en, zh }

export function getLocaleDictionary(locale = 'en') {
  const norm = String(locale || '').toLowerCase()
  if (norm.startsWith('zh')) return zh
  return en
}

export function t(key, params = {}, locale = 'en') {
  const dict = getLocaleDictionary(locale)
  let template = dict[key] || en[key] || key
  for (const [k, v] of Object.entries(params)) {
    template = template.replaceAll(`{${k}}`, String(v))
  }
  return template
}

export { en, zh }
