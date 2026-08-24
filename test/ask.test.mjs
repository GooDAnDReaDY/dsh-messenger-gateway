import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCallbackData, parseCallbackData, buildInlineKeyboard,
  targetMatchesAsk, TELEGRAM_CALLBACK_DATA_MAX,
} from '../lib/ask.js'

test('buildCallbackData enforces Telegram 64-byte limit', () => {
  assert.equal(buildCallbackData('tok', 'yes').length <= TELEGRAM_CALLBACK_DATA_MAX, true)
  assert.throws(() => buildCallbackData('x'.repeat(50), 'y'.repeat(20)), /too long/)
})

test('parseCallbackData splits token and button id', () => {
  assert.deepEqual(parseCallbackData('abc123:confirm'), { token: 'abc123', buttonId: 'confirm' })
  assert.deepEqual(parseCallbackData('legacy'), { token: undefined, buttonId: 'legacy' })
})

test('buildInlineKeyboard maps buttons to callback_data', () => {
  const { replyMarkup, callbackKeys } = buildInlineKeyboard('t1', [[{ id: 'yes', text: 'Yes' }]])
  assert.equal(replyMarkup.inline_keyboard[0][0].callback_data, 't1:yes')
  assert.deepEqual(callbackKeys, ['t1:yes'])
})

test('targetMatchesAsk checks chat', () => {
  const pending = { target: { platform: 'telegram', chatId: 42 } }
  assert.equal(targetMatchesAsk(pending, { platform: 'telegram', chatId: 42 }), true)
  assert.equal(targetMatchesAsk(pending, { platform: 'telegram', chatId: 99 }), false)
})
