import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { photoOnlyHint, attachInboundPhoto } from '../lib/photos.js'
import { transcribeVoice } from '../lib/integrations.js'
import { buildOutboundFiles, stripImageUrls } from '../lib/outbound.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const turnSrc = readFileSync(join(root, 'lib/gateway-turn.js'), 'utf8')

test('Issue #87: gateway-turn.js imports all required photo, voice, and outbound helpers', () => {
  // Check imports in lib/gateway-turn.js
  assert.match(turnSrc, /import\s*\{[^}]*\breadFile\b[^}]*\}\s*from\s*['"]node:fs\/promises['"]/)
  assert.match(turnSrc, /import\s*\{[^}]*\battachInboundPhoto\b[^}]*\}\s*from\s*['"]\.\/photos\.js['"]/)
  assert.match(turnSrc, /import\s*\{[^}]*\bphotoOnlyHint\b[^}]*\}\s*from\s*['"]\.\/photos\.js['"]/)
  assert.match(turnSrc, /import\s*\{[^}]*\btranscribeVoice\b[^}]*\}\s*from\s*['"]\.\/integrations\.js['"]/)
  assert.match(turnSrc, /import\s*\{[^}]*\bbuildOutboundFiles\b[^}]*\}\s*from\s*['"]\.\/outbound\.js['"]/)
  assert.match(turnSrc, /import\s*\{[^}]*\bstripImageUrls\b[^}]*\}\s*from\s*['"]\.\/outbound\.js['"]/)
})

test('Issue #87: photo, voice, and outbound helpers operate as expected by gateway turn', async () => {
  // photoOnlyHint
  assert.equal(photoOnlyHint([{ kind: 'photo' }], ''), '[User attached a photo]')
  assert.equal(photoOnlyHint([{ kind: 'photo' }, { kind: 'photo' }], ''), '[User attached 2 photos]')
  assert.equal(photoOnlyHint([{ kind: 'photo' }], 'what is this?'), '')

  // stripImageUrls
  const rawReply = 'Here is your chart: /dsh-messenger-gateway/image?id=123 enjoy!'
  assert.equal(stripImageUrls(rawReply), 'Here is your chart:  enjoy!')

  // buildOutboundFiles signature and contract
  assert.equal(typeof buildOutboundFiles, 'function')
  assert.equal(typeof transcribeVoice, 'function')
  assert.equal(typeof attachInboundPhoto, 'function')
})
