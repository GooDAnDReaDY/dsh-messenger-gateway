import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractImageUrls, stripImageUrls, collectImagesDeep, dedupeAttachmentRefs,
  buildOutboundFiles, fileNameForRef,
} from '../lib/outbound.js'

test('extractImageUrls finds plugin image paths', () => {
  const urls = extractImageUrls('see /dsh-image-gen/image?id=abc123 here')
  assert.deepEqual(urls, ['/dsh-image-gen/image?id=abc123'])
})

test('stripImageUrls removes plugin URLs', () => {
  const s = stripImageUrls('done\n/dsh-fal-image-gen/image?id=x\nthanks')
  assert.equal(s, 'done\n\nthanks')
})

test('collectImagesDeep walks nested content', () => {
  const refs = collectImagesDeep([
    { type: 'text', text: 'hi' },
    { type: 'tool-result', content: [{ type: 'image', attachment: { attachmentId: 'a1' } }] },
  ])
  assert.equal(refs.length, 1)
  assert.equal(refs[0].attachmentId, 'a1')
})

test('dedupeAttachmentRefs by attachmentId', () => {
  const r = { attachmentId: 'x' }
  assert.equal(dedupeAttachmentRefs([r, r]).length, 1)
})

test('fileNameForRef uses ref name', () => {
  assert.equal(fileNameForRef({ name: 'cat.png', mediaType: 'image/png' }), 'cat.png')
})

test('buildOutboundFiles reads attachments and fetches URLs', async () => {
  const bytes = new Uint8Array([1, 2, 3])
  const ctx = {
    attachments: {
      readImage: async () => ({ data: bytes, ref: { mediaType: 'image/png' } }),
    },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => bytes.buffer,
  })
  try {
    const files = await buildOutboundFiles(ctx, 'http://127.0.0.1:3080', {
      images: [{ attachmentId: '1', mediaType: 'image/png' }],
      parts: ['x /dsh-image-gen/image?id=abc'],
    })
    assert.equal(files.length, 2)
    assert.equal(files[0].bytes.length, 3)
    assert.equal(files[1].kind, 'photo')
  } finally {
    globalThis.fetch = originalFetch
  }
})
