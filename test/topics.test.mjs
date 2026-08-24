import test from 'node:test'
import assert from 'node:assert/strict'
import { chatKey, parseChatKey, normalizeThreadId, telegramThreadParams } from '../lib/topics.js'

test('chatKey isolates forum topics', () => {
  assert.equal(chatKey('telegram', 1, 0), 'telegram:1:0')
  assert.equal(chatKey('telegram', 1, 42), 'telegram:1:42')
  assert.notEqual(chatKey('telegram', 1, 0), chatKey('telegram', 1, 42))
})

test('parseChatKey roundtrip', () => {
  const key = chatKey('telegram', '-100123', 77)
  assert.deepEqual(parseChatKey(key), { platform: 'telegram', chatId: '-100123', threadId: 77 })
})

test('normalizeThreadId treats invalid as main chat', () => {
  assert.equal(normalizeThreadId(undefined), 0)
  assert.equal(normalizeThreadId(-1), 0)
})

test('telegramThreadParams omits zero thread', () => {
  assert.deepEqual(telegramThreadParams(0), {})
  assert.deepEqual(telegramThreadParams(5), { message_thread_id: 5 })
})
