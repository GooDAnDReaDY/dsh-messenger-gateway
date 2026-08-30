import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('lib/index.js does not import removed settingsNamespace', () => {
  const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
  assert.doesNotMatch(src, /settingsNamespace/)
  assert.doesNotMatch(src, /@deepseek-ai\/dsh-settings/)
})

test('lib/index.js uses a plain string namespace', () => {
  const src = readFileSync(join(root, 'lib/index.js'), 'utf8')
  const m = src.match(/SETTINGS_NAMESPACE\s*=\s*'([^']+)'/)
  assert.ok(m, 'SETTINGS_NAMESPACE must be a plain string literal')
  assert.equal(m[1], 'dsh-messenger-gateway')
  assert.match(m[1], /^[a-z][a-z0-9-]*$/)
})

test('no runtime references to installSettingsSection / deepEqualJson in lib', () => {
  const files = ['index.js', 'config.js']
  for (const f of files) {
    const src = readFileSync(join(root, 'lib', f), 'utf8')
    assert.doesNotMatch(src, /installSettingsSection/)
    assert.doesNotMatch(src, /deepEqualJson/)
  }
})

test('peerDependencies pin dsh-settings to alpha.2', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, '0.3.2')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-settings'], '^0.1.2-alpha.2')
})
