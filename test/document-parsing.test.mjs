import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import {
  extractPdfText,
  formatInboundDocument,
  parseDocument,
} from '../lib/documents.js'

test('extractPdfText extracts strings from PDF streams', () => {
  const fakePdf = Buffer.from(`
%PDF-1.4
1 0 obj
<< /Length 50 >>
stream
BT
/F1 12 Tf
(Hello World from PDF) Tj
ET
endstream
endobj
  `)
  const text = extractPdfText(fakePdf)
  assert.ok(text.includes('Hello World from PDF'))
})

test('parseDocument reads markdown and injects into formatInboundDocument', async () => {
  const filePath = join(tmpdir(), `test-doc-${randomUUID()}.md`)
  await writeFile(filePath, '# Document Title\n\nContent inside document.', 'utf8')

  const parsed = await parseDocument(filePath, { maxBytes: 1000 })
  assert.equal(parsed.parsed, true)
  assert.equal(parsed.type, 'md')
  assert.ok(parsed.text.includes('# Document Title'))

  const formatted = formatInboundDocument({ kind: 'document', name: 'test.md', path: filePath }, parsed)
  assert.ok(formatted.includes('[Документ test.md]'))
  assert.ok(formatted.includes('[Распознанный текст из файла]'))
  assert.ok(formatted.includes('Content inside document.'))
})

test('parseDocument truncates when text exceeds maxBytes', async () => {
  const filePath = join(tmpdir(), `test-long-${randomUUID()}.txt`)
  const longText = 'A'.repeat(500)
  await writeFile(filePath, longText, 'utf8')

  const parsed = await parseDocument(filePath, { maxBytes: 100 })
  assert.equal(parsed.parsed, true)
  assert.equal(parsed.truncated, true)
  assert.equal(parsed.text.length, 100)

  const formatted = formatInboundDocument({ kind: 'document', path: filePath }, parsed)
  assert.ok(formatted.includes('(содержимое усечено)'))
})
