import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQuickActionsKeyboard,
  REMOVE_REPLY_KEYBOARD,
} from '../lib/adapters/telegram.js'

test('buildQuickActionsKeyboard generates persistent 2x2 grid', () => {
  const kb = buildQuickActionsKeyboard()
  assert.equal(kb.resize_keyboard, true)
  assert.equal(kb.is_persistent, true)
  assert.equal(kb.keyboard.length, 2)
  assert.deepEqual(kb.keyboard[0], [{ text: '🔄 /new' }, { text: '🛑 /stop' }])
  assert.deepEqual(kb.keyboard[1], [{ text: '🎙️ /voice' }, { text: '📊 /status' }])
})

test('REMOVE_REPLY_KEYBOARD has remove_keyboard flag', () => {
  assert.deepEqual(REMOVE_REPLY_KEYBOARD, { remove_keyboard: true })
})
