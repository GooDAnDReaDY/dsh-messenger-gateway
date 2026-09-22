import test from 'node:test'
import assert from 'node:assert/strict'

function shouldPromptPhotoOnly(attachments, text, mode = 'prompt') {
  const body = String(text || '').trim()
  const hasMedia = attachments.length > 0
  const incomingPhotoOnly = hasMedia && attachments.every((a) => a.kind === 'photo') && !body
  return incomingPhotoOnly && mode === 'prompt'
}

test('photo-only without caption prompts in prompt mode', () => {
  assert.equal(shouldPromptPhotoOnly([{ kind: 'photo' }], ''), true)
  assert.equal(shouldPromptPhotoOnly([{ kind: 'photo' }], 'что тут?'), false)
  assert.equal(shouldPromptPhotoOnly([{ kind: 'photo' }], '', 'run'), false)
})
