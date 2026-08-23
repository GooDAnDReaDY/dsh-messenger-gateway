import test from 'node:test'
import assert from 'node:assert/strict'
import { splitText, assistantText } from '../lib/text.js'

test('splitText keeps short strings', () => {
  assert.deepEqual(splitText('hello', 100), ['hello'])
})

test('assistantText joins blocks', () => {
  assert.equal(assistantText({ content: [{ type: 'text', text: 'ab' }] }), 'ab')
})
