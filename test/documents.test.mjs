import test from 'node:test'
import assert from 'node:assert/strict'
import { formatInboundDocument, documentOnlyHint } from '../lib/documents.js'

test('formatInboundDocument includes absolute path', () => {
  const s = formatInboundDocument({ kind: 'document', path: '/tmp/x.pdf', name: 'x.pdf', mime: 'application/pdf' })
  assert.match(s, /Документ/)
  assert.match(s, /\/tmp\/x\.pdf/)
})

test('formatInboundDocument labels video', () => {
  assert.match(formatInboundDocument({ kind: 'video', path: '/tmp/v.mp4' }), /Видео/)
})

test('documentOnlyHint without caption', () => {
  assert.equal(documentOnlyHint([{ kind: 'document' }], ''), '[Пользователь отправил файл]')
})
