import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionKey, chatKey } from '../lib/topics.js'

test('private ignores user scope', () => {
  const a = sessionKey({ platform: 'telegram', chatId: 1, userId: 9, chatType: 'private', scope: 'user' })
  const b = sessionKey({ platform: 'telegram', chatId: 1, userId: 8, chatType: 'private', scope: 'user' })
  assert.equal(a, b)
  assert.equal(a, chatKey('telegram', 1, 0))
})

test('group user scope isolates users', () => {
  const a = sessionKey({ platform: 'telegram', chatId: 1, threadId: 2, userId: 9, chatType: 'supergroup', scope: 'user' })
  const b = sessionKey({ platform: 'telegram', chatId: 1, threadId: 2, userId: 8, chatType: 'supergroup', scope: 'user' })
  assert.notEqual(a, b)
  assert.match(a, /:u:9$/)
})

test('group chat scope shared', () => {
  const a = sessionKey({ platform: 'telegram', chatId: 1, userId: 9, chatType: 'group', scope: 'chat' })
  const b = sessionKey({ platform: 'telegram', chatId: 1, userId: 8, chatType: 'group', scope: 'chat' })
  assert.equal(a, b)
})
