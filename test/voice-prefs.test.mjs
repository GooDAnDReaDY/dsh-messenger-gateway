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
