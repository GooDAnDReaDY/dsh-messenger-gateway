import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDocument, extOf, TELEGRAM_MAX_DOC_BYTES } from '../lib/media.js'
import * as mediaModule from '../lib/media.js'

test('classifyDocument detects pdf', () => {
  assert.equal(classifyDocument('.pdf', 'application/pdf'), 'doc')
})

test('extOf keeps extension', () => {
  assert.equal(extOf('file.md', ''), '.md')
})

test('Issue #77: TELEGRAM_MAX_DOC_BYTES is single source of truth and dead mediaKindOf is removed', () => {
  assert.equal(TELEGRAM_MAX_DOC_BYTES, 20 * 1024 * 1024)
  assert.equal('mediaKindOf' in mediaModule, false, 'mediaKindOf must not be exported')
})

