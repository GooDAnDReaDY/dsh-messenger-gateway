import test from 'node:test'
import assert from 'node:assert/strict'
import { listHomes, resolveNamedHome, upsertHome, normalizeHomeName } from '../lib/homes.js'

test('normalizeHomeName', () => {
  assert.equal(normalizeHomeName(' Work Chat '), 'work-chat')
})

test('legacy home becomes default', () => {
  const list = listHomes({ homeChatId: 1, homeThreadId: 9 })
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'default')
  assert.equal(list[0].threadId, 9)
})

test('upsert and resolve', () => {
  let tg = { homeChatId: 1, homeThreadId: 0 }
  tg = upsertHome(tg, { name: 'alerts', chatId: 2, threadId: 5 })
  assert.equal(resolveNamedHome(tg, 'alerts').chatId, 2)
  assert.equal(resolveNamedHome(tg, 'default').chatId, 1)
})
