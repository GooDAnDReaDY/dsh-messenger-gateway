// Защита секретов плагина от «пустой перезаписи» из карточки настроек.
//
// DSH отдаёт браузеру describe({ redactSecrets: true }) — поля с
// role('secret') (botToken, webhookSecret, secret вебхуков) в клиент не
// попадают. Карточка плагина сохраняет секцию целиком, поэтому при каждом
// сохранении (например, при смене прокси) в конфиг уезжает пустой токен и бот
// отключается. Здесь мы запоминаем последние непустые значения и возвращаем их
// обратно, если запись их обнулила. Явная смена значения (непустое новое)
// всегда выигрывает — так же ведёт себя и PUT /config в lib/index.js.

export const SECRET_FIELDS = [
  ['telegram', 'botToken'],
  ['telegram', 'webhookSecret'],
  ['discord', 'botToken'],
  ['slack', 'botToken'],
  ['webhooks', 'secret'],
]

function keyOf(section, field) {
  return `${section}.${field}`
}

/** Снимок непустых секретов конфига: { 'telegram.botToken': '123:ABC' }. */
export function readSecrets(config) {
  const out = {}
  for (const [section, field] of SECRET_FIELDS) {
    const value = String(config?.[section]?.[field] ?? '')
    out[keyOf(section, field)] = value
  }
  return out
}

/**
 * Возвращает копию конфига с восстановленными секретами.
 * @param previous снимок из readSecrets() до записи
 * @param config разобранный конфиг после записи
 * @returns {{ config: object, restored: string[] }} — restored пуст, если чинить нечего
 */
export function restoreSecrets(previous, config) {
  const restored = []
  const next = structuredClone(config ?? {})
  for (const [section, field] of SECRET_FIELDS) {
    const key = keyOf(section, field)
    const before = String(previous?.[key] ?? '')
    const after = String(next?.[section]?.[field] ?? '')
    if (before && !after) {
      next[section] = { ...(next[section] || {}), [field]: before }
      restored.push(key)
    }
  }
  return { config: next, restored }
}
