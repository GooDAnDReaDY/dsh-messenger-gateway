import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TelegramAdapter,
  buildQuickActionsKeyboard,
  REMOVE_REPLY_KEYBOARD,
} from '../lib/adapters/telegram.js'

test('buildQuickActionsKeyboard generates non-persistent 2x2 grid', () => {
  const kb = buildQuickActionsKeyboard()
  assert.equal(kb.resize_keyboard, true)
  assert.equal(kb.is_persistent, undefined)
  assert.equal(kb.keyboard.length, 2)
  assert.deepEqual(kb.keyboard[0], [{ text: '🔄 /new' }, { text: '🛑 /stop' }])
  assert.deepEqual(kb.keyboard[1], [{ text: '🎙️ /voice' }, { text: '📊 /status' }])
})

test('REMOVE_REPLY_KEYBOARD has remove_keyboard flag', () => {
  assert.deepEqual(REMOVE_REPLY_KEYBOARD, { remove_keyboard: true })
})

test('Issue #89: TelegramAdapter sendFormattedMessage generates quickActions and remove replyMarkup without ReferenceError', async () => {
  const sent = []
  const adapter = new TelegramAdapter({ botToken: 'mock' })
  adapter.call = async (method, params) => {
    sent.push({ method, params })
    return { ok: true, result: { message_id: 1 } }
  }

  // quickActions: true
  adapter.quickActions = true
  await adapter.sendFormattedMessage(12345, 'hello')
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].params.reply_markup, buildQuickActionsKeyboard())

  // quickActions: false
  adapter.quickActions = false
  await adapter.sendFormattedMessage(12345, 'world')
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1].params.reply_markup, REMOVE_REPLY_KEYBOARD)
})
