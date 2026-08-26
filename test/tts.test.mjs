import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  stripMarkdownForSpeech, prepareTtsText, voiceReplyFile, voiceFileNameForMime,
  isOggOpusMime, toTelegramVoiceFile, convertToOggOpus,
} from '../lib/tts.js'

test('stripMarkdownForSpeech removes code and links', () => {
  const out = stripMarkdownForSpeech('see `x` and [a](http://t) ```\ncode\n```')
  assert.ok(!out.includes('```'))
  assert.ok(!out.includes('http'))
})

test('prepareTtsText truncates and skips empty', () => {
  assert.equal(prepareTtsText('  '), '')
  assert.equal(prepareTtsText('hello world').length > 0, true)
  assert.equal(prepareTtsText('a'.repeat(100), 10), 'a'.repeat(10))
})

test('voiceReplyFile picks extension from mime', () => {
  assert.equal(voiceFileNameForMime('audio/ogg'), 'reply.ogg')
  assert.equal(voiceReplyFile({ audio: Buffer.from([1]), mime: 'audio/mpeg' }).kind, 'voice')
})

test('isOggOpusMime', () => {
  assert.equal(isOggOpusMime('audio/ogg; codecs=opus'), true)
  assert.equal(isOggOpusMime('audio/mpeg'), false)
})

test('toTelegramVoiceFile keeps ogg as voice', async () => {
  const out = await toTelegramVoiceFile({ audio: Buffer.from([1, 2, 3]), mime: 'audio/ogg' })
  assert.equal(out.kind, 'voice')
  assert.equal(out.name, 'reply.ogg')
})

test('convertToOggOpus via ffmpeg when available', async (t) => {
  const has = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  if (has.status !== 0) {
    t.skip('ffmpeg not installed')
    return
  }
  // tiny silent mp3-ish wav is easier: generate wav with ffmpeg then convert path through our helper
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'msgw-ff-'))
  try {
    const wav = join(dir, 'a.wav')
    const gen = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=f=440:d=0.3', '-ac', '1', wav], { encoding: 'utf8' })
    assert.equal(gen.status, 0, gen.stderr)
    const bytes = await readFile(wav)
    const ogg = await convertToOggOpus(bytes, 'audio/wav')
    assert.ok(ogg.length > 50)
    const asVoice = await toTelegramVoiceFile({ audio: bytes, mime: 'audio/wav' })
    assert.equal(asVoice.kind, 'voice')
    assert.equal(asVoice.mime, 'audio/ogg')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
