import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCallbackData, parseCallbackData, buildInlineKeyboard,
  targetMatchesAsk, TELEGRAM_CALLBACK_DATA_MAX,
  normalizeAskOptions,
} from '../lib/ask.js'

test('buildCallbackData enforces Telegram 64-byte limit', () => {
  assert.equal(buildCallbackData('tok', 'yes').length <= TELEGRAM_CALLBACK_DATA_MAX, true)
  assert.throws(() => buildCallbackData('x'.repeat(50), 'y'.repeat(20)), /too long/)
})

test('parseCallbackData splits token and button id', () => {
  assert.deepEqual(parseCallbackData('abc123:confirm'), { token: 'abc123', buttonId: 'confirm' })
})

test('buildInlineKeyboard maps buttons to callback_data', () => {
  const { replyMarkup, callbackKeys } = buildInlineKeyboard('t1', [[{ id: 'yes', text: 'Yes' }]])
  assert.equal(replyMarkup.inline_keyboard[0][0].callback_data, 't1:yes')
  assert.deepEqual(callbackKeys, ['t1:yes'])
})

test('targetMatchesAsk checks chat and thread', () => {
  const pending = { target: { platform: 'telegram', chatId: 42, threadId: 7 } }
  assert.equal(targetMatchesAsk(pending, { platform: 'telegram', chatId: 42, threadId: 7 }), true)
  assert.equal(targetMatchesAsk(pending, { platform: 'telegram', chatId: 42, threadId: 8 }), false)
})

test('Issue #122: normalizeAskOptions avoids unbounded argument spread and handles large arrays', () => {
  // Test nested options flattening
  const nested = [['Option A', 'Option B'], ['Option C']]
  const res = normalizeAskOptions(nested)
  assert.equal(res.length, 3)
  assert.equal(res[0].text, 'Option A')
  assert.equal(res[2].text, 'Option C')

  // Array exceeding maximum call stack size (>65536 elements)
  const largeArray = new Array(70000).fill('opt')
  const largeRes = normalizeAskOptions(largeArray)
  assert.equal(largeRes.length, 70000)
  assert.equal(largeRes[0].text, 'opt')
})

