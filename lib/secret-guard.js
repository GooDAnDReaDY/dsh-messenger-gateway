// Protects the plugin secrets from being wiped by a settings-card save.
//
// DSH serves describe({ redactSecrets: true }) to the browser — fields with
// role('secret') (botToken, webhookSecret, webhook secrets) never reach the
// client. The settings card saves whole sections, so every save (e.g. a proxy
// change) would store an empty token and switch the bot off. We remember the
// last non-empty values and restore them when a save blanks them. An explicit
// value change (non-empty new value) always wins — PUT /config in lib/index.js
// behaves the same way.

export const SECRET_FIELDS = [
  ['telegram', 'botToken'],
  ['telegram', 'webhookSecret'],
  ['telegram', 'proxyUrl'],
  ['discord', 'botToken'],
  ['slack', 'botToken'],
  ['webhooks', 'secret'],
  ['memory', 'token'],
]

function keyOf(section, field) {
  return `${section}.${field}`
}

/** Snapshot of the config's non-empty secrets: { 'telegram.botToken': '123:ABC' }. */
export function readSecrets(config) {
  const out = {}
  for (const [section, field] of SECRET_FIELDS) {
    const value = String(config?.[section]?.[field] ?? '')
    out[keyOf(section, field)] = value
  }
  return out
}

/**
 * Returns a copy of the config with the secrets restored.
 * @param previous snapshot from readSecrets() taken before the write
 * @param config parsed config after the write
 * @returns {{ config: object, restored: string[] }} — restored is empty when there is nothing to fix
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
