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

test('Issue #91: forum-mirror functions handle logging and skills without ReferenceError', async () => {
  const { collectDynamicSkills, syncTelegramCommands, mirrorSessionToForumTopic } = await import('../lib/forum-mirror.js')

  // collectDynamicSkills fallback
  const fakeCtx = {
    skills: { list: () => [{ name: 'testSkill', title: 'Test Skill' }] },
    logger: { debug: () => {} },
  }
  const skills = collectDynamicSkills(fakeCtx)
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'testSkill')

  // syncTelegramCommands logging with gw.ctx.logger
  const logs = []
  const fakeGw = {
    adapters: new Map([
      ['telegram', { registerCommands: async () => {} }]
    ]),
    config: { telegram: { commands: [] } },
    ctx: {
      get: () => ({ list: () => [] }),
      logger: { info: (msg) => logs.push(['info', msg]), warn: (msg) => logs.push(['warn', msg]) }
    }
  }
  await syncTelegramCommands(fakeGw)
  assert.ok(logs.some(([lvl, msg]) => lvl === 'info' && msg.includes('Synced')))

  // mirrorSessionToForumTopic logging with gw.ctx.logger
  const fakeGw2 = {
    adapters: new Map([
      ['telegram', {
        createForumTopic: async () => ({ message_thread_id: 123 }),
        sendTo: async () => {}
      }]
    ]),
    sessionToThread: new Map(),
    threadToSession: new Map(),
    config: { telegram: { forumMirrorEnabled: true, forumMirrorChatId: 'chat-99' } },
    ctx: {
      logger: { info: (msg) => logs.push(['info', msg]), warn: (msg) => logs.push(['warn', msg]) }
    }
  }
  await mirrorSessionToForumTopic(fakeGw2, { id: 'sess-abc-123', title: 'Test Session' })
  assert.ok(logs.some(([lvl, msg]) => lvl === 'info' && msg.includes('Mirrored session')))
  assert.equal(fakeGw2.sessionToThread.get('sess-abc-123').threadId, 123)
})

