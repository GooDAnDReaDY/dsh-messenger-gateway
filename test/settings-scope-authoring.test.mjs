import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

test('settings card binds settingsScope and gates on snapshot status (Issue #44)', () => {
  assert.match(client, /settingsScope\.bind\(\{\s*namespace:\s*NS\s*\}\)/)
  assert.match(client, /snapStatus === 'loading'/)
  assert.match(client, /snapStatus !== 'ready'/)
  assert.match(client, /getSnapshot/)
  assert.doesNotMatch(client, /fetch\('\/dsh-messenger-gateway\/config'/)
})

test('settings.plugin.item registers key+locale NS and injects ctx (Issue #45)', () => {
  assert.match(client, /name:\s*'settings\.plugin\.item'/)
  assert.match(client, /key:\s*NS/)
  assert.match(client, /locale:\s*NS/)
  assert.match(client, /inject:\s*\(\)\s*=>\s*\(\{\s*ctx\s*\}\)/)
  assert.match(client, /(?:exports\.)?inject\s*[:=]\s*\['slots',\s*'locale',\s*'settingsScope'\]/)
  assert.doesNotMatch(client, /settings\.section/)
})

test('save collects every field error instead of aborting on first', () => {
  assert.match(client, /SETTINGS_KEYS/)
  assert.match(client, /broken\.push/)
  assert.match(client, /for \(const key of SETTINGS_KEYS\)/)
})