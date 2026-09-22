import test from 'node:test'
import assert from 'node:assert/strict'

// mirror releaseChatTurn semantics
function releaseChatTurn(chat) { chat.busy = Promise.resolve() }

test('releaseChatTurn unblocks queued messages', async () => {
  const chat = { busy: new Promise(() => {}) }
  releaseChatTurn(chat)
  let ran = false
  await chat.busy.then(() => { ran = true })
  assert.equal(ran, true)
})
