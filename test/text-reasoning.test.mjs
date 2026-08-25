import test from 'node:test'
import assert from 'node:assert/strict'
import { stripReasoningPreamble } from '../lib/text.js'

test('stripReasoningPreamble keeps Russian answer after English preamble', () => {
  const raw = 'The image was attached. Let me analyze.\n\nНа картинке — сканер.'
  assert.equal(stripReasoningPreamble(raw), 'На картинке — сканер.')
})

test('stripReasoningPreamble leaves Russian-only text', () => {
  assert.equal(stripReasoningPreamble('Привет'), 'Привет')
})
