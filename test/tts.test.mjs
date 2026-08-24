import test from 'node:test'
import assert from 'node:assert/strict'
import {
  stripMarkdownForSpeech, prepareTtsText, voiceReplyFile, voiceFileNameForMime,
} from '../lib/tts.js'

test('stripMarkdownForSpeech removes code and links', () => {
  const s = stripMarkdownForSpeech('see `code` and [link](https://x.test) **bold**')
  assert.match(s, /link/)
  assert.doesNotMatch(s, /https?:/)
  assert.doesNotMatch(s, /`/)
})

test('prepareTtsText truncates and skips empty', () => {
  assert.equal(prepareTtsText(''), '')
  assert.equal(prepareTtsText('ok', 1), 'o')
})

test('voiceReplyFile picks extension from mime', () => {
  const f = voiceReplyFile({ audio: Buffer.from([1]), mime: 'audio/ogg', provider: 'edge' })
  assert.equal(f.kind, 'voice')
  assert.equal(f.name, 'reply.ogg')
  assert.equal(voiceFileNameForMime('audio/mpeg'), 'reply.mp3')
})
