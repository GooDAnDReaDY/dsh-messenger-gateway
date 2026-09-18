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

test('client does not register settings.section fallback (Issue #45)', () => {
  assert.doesNotMatch(client, /name:\s*'settings\.section'/)
  assert.doesNotMatch(client, /settings\.section/)
})

test('client registers en/zh locale dictionaries', () => {
  assert.match(client, /register\(NS,\s*\{\s*en,\s*zh\s*\}\)/)
})

test('client uses prefixed msgw- card classes (issue #6)', () => {
  assert.match(client, /msgw-card/)
  assert.match(client, /msgw-head/)
  assert.match(client, /msgw-title/)
  assert.match(client, /msgw-body/)
  assert.match(client, /msgw-foot/)
  assert.doesNotMatch(client, /msgw_card/)
})

test('Issue #75: dsh.client.inject declares client dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const inject = pkg.dsh?.client?.inject || []
  assert.ok(Array.isArray(inject))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-locale'), 'must include dsh-client-locale')
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-slots'), 'must include dsh-client-ui-slots')
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-settings'), 'must include dsh-client-ui-settings')
})

test('Issue #74: no hardcoded rgba or hex colors in lib/client.js styling', () => {
  const freshClient = readFileSync(join(root, 'lib/client.js'), 'utf8')
  const rgbaMatches = freshClient.match(/rgba\([^)]+\)/g) || []
  const hexMatches = freshClient.match(/#[0-9a-fA-F]{3,8}/g) || []
  assert.equal(rgbaMatches.length, 0, `Found hardcoded rgba in client: ${rgbaMatches.join(', ')}`)
  assert.equal(hexMatches.length, 0, `Found hardcoded hex in client: ${hexMatches.join(', ')}`)
})


