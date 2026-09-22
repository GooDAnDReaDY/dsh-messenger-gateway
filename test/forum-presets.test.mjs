import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createPersonaStore } from '../lib/personas.js'

test('forum-presets: per-topic persona binding isolates forum threads', () => {
  const file = join(tmpdir(), `persona-store-${randomUUID()}.json`)
  const store = createPersonaStore(file)

  const chatId = 100200300
  const mainThread = 0
  const topicDev = 42
  const topicQA = 99

  // Default initially
  assert.equal(store.getPersonaForChat(chatId, mainThread), 'default')
  assert.equal(store.getPersonaForChat(chatId, topicDev), 'default')

  // Set coder on topicDev
  store.set(chatId, 'coder', topicDev)
  assert.equal(store.getPersonaForChat(chatId, topicDev), 'coder')
  assert.equal(store.getPersonaForChat(chatId, mainThread), 'default')
  assert.equal(store.getPersonaForChat(chatId, topicQA), 'default')

  // Set analyst on topicQA
  store.set(chatId, 'analyst', topicQA)
  assert.equal(store.getPersonaForChat(chatId, topicQA), 'analyst')
  assert.equal(store.getPersonaForChat(chatId, topicDev), 'coder')
})

test('forum-presets: setPreset and getPreset bind presets to threads', () => {
  const file = join(tmpdir(), `preset-store-${randomUUID()}.json`)
  const store = createPersonaStore(file)

  const chatId = -100987654321
  const threadId = 555

  assert.equal(store.getPreset(chatId, threadId), null)

  store.setPreset(chatId, threadId, 'coding-agent-v2')
  assert.equal(store.getPreset(chatId, threadId), 'coding-agent-v2')

  // Other topic unaffected
  assert.equal(store.getPreset(chatId, 777), null)

  // Clear preset
  store.setPreset(chatId, threadId, null)
  assert.equal(store.getPreset(chatId, threadId), null)
})
