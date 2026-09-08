import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ensureContentArray } from '../lib/content-guard.js'

describe('ensureContentArray', () => {
  it('passes through a valid ContentBlock array', () => {
    const blocks = [{ type: 'text', text: 'hello' }]
    const result = ensureContentArray(blocks)
    assert.deepStrictEqual(result, blocks)
  })

  it('wraps a non-empty string into a text block', () => {
    const result = ensureContentArray('hello world')
    assert.deepStrictEqual(result, [{ type: 'text', text: 'hello world' }])
  })

  it('wraps an empty string into a fallback text block', () => {
    const result = ensureContentArray('')
    assert.deepStrictEqual(result, [{ type: 'text', text: '(пустое сообщение)' }])
  })

  it('wraps undefined into a fallback text block', () => {
    const result = ensureContentArray(undefined)
    assert.deepStrictEqual(result, [{ type: 'text', text: '(пустое сообщение)' }])
  })

  it('wraps null into a fallback text block', () => {
    const result = ensureContentArray(null)
    assert.deepStrictEqual(result, [{ type: 'text', text: '(пустое сообщение)' }])
  })

  it('wraps a single ContentBlock object into an array', () => {
    const block = { type: 'text', text: 'single' }
    const result = ensureContentArray(block)
    assert.deepStrictEqual(result, [block])
  })

  it('wraps a single image block into an array', () => {
    const block = { type: 'image', attachment: 'ref123' }
    const result = ensureContentArray(block)
    assert.deepStrictEqual(result, [block])
  })

  it('converts a number to a text block', () => {
    const result = ensureContentArray(42)
    assert.deepStrictEqual(result, [{ type: 'text', text: '42' }])
  })

  it('converts a boolean to a text block', () => {
    const result = ensureContentArray(true)
    assert.deepStrictEqual(result, [{ type: 'text', text: 'true' }])
  })

  it('returns the same array reference for valid input (no unnecessary copy)', () => {
    const blocks = [{ type: 'text', text: 'x' }]
    assert.strictEqual(ensureContentArray(blocks), blocks)
  })

  it('handles an empty array as valid', () => {
    const result = ensureContentArray([])
    assert.deepStrictEqual(result, [])
  })
})
