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

test('peerDependencies accept both the dsh 0.1.7 and 0.2.0 package lines', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.ok(pkg.version, 'version must be present')
  const range = pkg.peerDependencies['@deepseek-ai/dsh-settings']
  // DSH 0.2.0-rc.1 denies a profile bundle whose peers exclude the running
  // version. A prerelease of the next minor is not admitted by a range that does
  // not name it, so ^0.1.2-alpha.2 excluded 0.2.0-rc.1 and the plugin was skipped
  // at startup rather than warned about.
  assert.ok(
    range.includes('0.2.0-rc.1'),
    `dsh-settings peer ${range} must name the 0.2.0-rc.1 line explicitly`,
  )
  assert.ok(
    range.includes('0.1.7-rc.2'),
    `dsh-settings peer ${range} must keep the 0.1.7 line`,
  )
})
