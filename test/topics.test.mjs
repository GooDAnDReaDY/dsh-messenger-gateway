import test from 'node:test'
import assert from 'node:assert/strict'
import { chatKey, sessionKey, normalizeThreadId, telegramThreadParams } from '../lib/topics.js'

test('chatKey isolates forum topics', () => {
  assert.equal(chatKey('telegram', 1, 0), 'telegram:1:0')
  assert.equal(chatKey('telegram', 1, 42), 'telegram:1:42')
  assert.notEqual(chatKey('telegram', 1, 0), chatKey('telegram', 1, 42))
})

test('sessionKey builds stable keys with user scope in groups', () => {
  const userScope = sessionKey({ platform: 'telegram', chatId: '-100123', threadId: 77, userId: 42, chatType: 'supergroup', scope: 'user' })
  assert.equal(userScope, 'telegram:-100123:77:u:42')
  const chatScope = sessionKey({ platform: 'telegram', chatId: '-100123', threadId: 77, userId: 42, chatType: 'supergroup', scope: 'chat' })
  assert.equal(chatScope, 'telegram:-100123:77')
})

test('normalizeThreadId treats invalid as main chat', () => {
  assert.equal(normalizeThreadId(undefined), 0)
  assert.equal(normalizeThreadId(-1), 0)
})

test('telegramThreadParams omits zero thread', () => {
  assert.deepEqual(telegramThreadParams(0), {})
  assert.deepEqual(telegramThreadParams(5), { message_thread_id: 5 })
})
