import test from 'node:test'
import assert from 'node:assert/strict'
import { extractTextDelta, buildStreamPreview, formatProgressLine } from '../lib/stream.js'

test('extractTextDelta', () => {
  assert.equal(extractTextDelta({ type: 'text-delta', text: 'hi' }), 'hi')
  assert.equal(extractTextDelta({ type: 'reasoning-delta', text: 'x' }), '')
})

test('buildStreamPreview includes tool line', () => {
  const s = buildStreamPreview('hello', 'bash')
  assert.match(s, /bash/)
  assert.match(s, /hello/)
})

test('formatProgressLine', () => {
  assert.match(formatProgressLine(''), /Думаю/)
  assert.match(formatProgressLine('web_search'), /web_search/)
})
