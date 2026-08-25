import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

test('client registers settings.plugin.item with settings namespace key', () => {
  assert.match(client, /const NS = 'dsh-messenger-gateway'/)
  assert.match(client, /name: 'settings\.plugin\.item'/)
  assert.match(client, /key: NS/)
  assert.match(client, /locale: NS/)
})

test('client keeps settings.section only as fallback', () => {
  assert.match(client, /if \(!tryPluginItem\(\)\)/)
  assert.match(client, /name: 'settings\.section'/)
})

test('client registers en/ru locale dictionaries', () => {
  assert.match(client, /ctx\.locale\.register\(NS, \{ en, ru \}\)/)
})
