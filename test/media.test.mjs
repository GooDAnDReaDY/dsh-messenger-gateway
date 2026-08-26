import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDocument, extOf } from '../lib/media.js'

test('classifyDocument detects pdf', () => {
  assert.equal(classifyDocument('.pdf', 'application/pdf'), 'doc')
})

test('extOf keeps extension', () => {
  assert.equal(extOf('file.md', ''), '.md')
})
