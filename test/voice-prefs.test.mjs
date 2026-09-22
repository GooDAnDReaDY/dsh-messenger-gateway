import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVoicePrefs, shouldSpeakReply } from '../lib/voice-prefs.js'

test('voice prefs persist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msgw-voice-'))
  const store = createVoicePrefs(join(dir, 'v.json'))
  assert.equal(store.get(1), null)
  store.set(1, true)
  assert.equal(createVoicePrefs(join(dir, 'v.json')).get(1), true)
})

test('shouldSpeakReply mirror', () => {
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'mirror', inboundWasVoice: true, userPref: null }), true)
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'mirror', inboundWasVoice: false, userPref: null }), false)
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'off', inboundWasVoice: true, userPref: null }), false)
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'off', inboundWasVoice: true, userPref: true }), true)
})

test('shouldSpeakReply per-chat tts pref overrides', () => {
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'mirror', inboundWasVoice: false, userPref: null, chatPref: true }), true)
  assert.equal(shouldSpeakReply({ globalTts: false, voiceMode: 'always', inboundWasVoice: true, userPref: true, chatPref: false }), false)
  assert.equal(shouldSpeakReply({ globalTts: true, voiceMode: 'always', inboundWasVoice: true, userPref: true, chatPref: false }), false)
})
