import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

test('Issue #70: package identity is strictly identical across 4 canonical locations', () => {
  // 1. package.json
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
  const manifestName = pkg.name
  assert.equal(manifestName, '@goodandready/dsh-messenger-gateway', 'package.json name must match scoped public name')

  // 2. cordis.patch.yml
  const patchYml = readFileSync(join(rootDir, 'cordis.patch.yml'), 'utf8')
  const patchMatch = patchYml.match(/name:\s*['"]?([^'"\r\n]+)['"]?/)
  assert.ok(patchMatch, 'cordis.patch.yml must specify a name')
  const patchName = patchMatch[1].trim()

  // 3. lib/client.js loader id
  const clientJs = readFileSync(join(rootDir, 'lib/client.js'), 'utf8')
  const clientMatch = clientJs.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)
  assert.ok(clientMatch, 'lib/client.js must specify id in __ModuleLoader__.load')
  const clientName = clientMatch[1].trim()

  // 4. lib/index.js export const name
  const indexJs = readFileSync(join(rootDir, 'lib/index.js'), 'utf8')
  const serverMatch = indexJs.match(/export\s+const\s+name\s*=\s*['"]([^'"]+)['"]/)
  assert.ok(serverMatch, 'lib/index.js must export const name')
  const serverName = serverMatch[1].trim()

  // Strict 4-way equality
  assert.equal(serverName, manifestName, 'lib/index.js export const name must match package.json')
  assert.equal(patchName, manifestName, 'cordis.patch.yml name must match package.json')
  assert.equal(clientName, manifestName, 'lib/client.js loader id must match package.json')
})
