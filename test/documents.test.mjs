import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatInboundDocument, documentOnlyHint, parseDocument } from '../lib/documents.js'

test('formatInboundDocument includes absolute path', () => {
  const s = formatInboundDocument({ kind: 'document', path: '/tmp/x.pdf', name: 'x.pdf', mime: 'application/pdf' })
  assert.match(s, /Document/)
  assert.match(s, /\/tmp\/x\.pdf/)
})

test('formatInboundDocument labels video', () => {
  assert.match(formatInboundDocument({ kind: 'video', path: '/tmp/v.mp4' }), /Video/)
})

test('documentOnlyHint without caption', () => {
  assert.equal(documentOnlyHint([{ kind: 'document' }], ''), '[User sent a file]')
})

test('Issue #116: parseDocument reads bounded chunk for text file exceeding maxBytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'doc-test-'))
  const filePath = join(dir, 'large.txt')
  try {
    const fullText = 'A'.repeat(5000)
    await writeFile(filePath, fullText, 'utf8')

    const res = await parseDocument(filePath, { maxBytes: 100 })
    assert.equal(res.parsed, true)
    assert.equal(res.type, 'txt')
    assert.equal(res.text.length, 100)
    assert.equal(res.truncated, true)
    assert.equal(res.originalLength, 5000)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Issue #116: parseDocument handles unsupported file types gracefully', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'doc-test-'))
  const filePath = join(dir, 'unsupported.bin')
  try {
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]))
    const res = await parseDocument(filePath)
    assert.equal(res.parsed, false)
    assert.equal(res.type, 'unsupported')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

