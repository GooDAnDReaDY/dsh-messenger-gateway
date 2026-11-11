import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGatewayCommand } from '../lib/gateway-commands.js'

function createMockGateway(overrides = {}) {
  const replies = []
  const chats = new Map()
  const recentSessions = new Map()
  const sessionToChat = new Map()
  const sessionToThread = new Map()
  const threadToSession = new Map()

  const defaultMockCtx = {
    logger: { debug: () => {}, warn: () => {}, info: () => {} },
    sessionQuery: {
      listSessions: async () => [
        { header: { id: 'msgw-1', title: 'TG · @alice', cwd: '/projects/repo1', updated_at: 1000 } },
        { header: { id: 'msgw-2', title: '', meta: { cwd: '/home/vadim/dev/bot' }, updated_at: 2000 } },
        { header: { id: 'web-session', title: 'web ui session', updated_at: 3000 } }, // non-msgw
        { header: { id: 'msgw-archived', title: 'archived', archived: true } }, // archived
      ],
      readTitle: async (id) => {
        if (id === 'msgw-2') return { title: 'TG · @bob › topic 42' }
        return null
      },
    },
  }

  const gw = {
    ctx: overrides.ctx || defaultMockCtx,
    logger: { debug: () => {}, warn: () => {}, info: () => {} },
    config: { agent: { sessionList: true } },
    chats,
    recentSessions,
    sessionToChat,
    sessionToThread,
    threadToSession,
    createdChats: [],
    tg: () => ({}),
    resolveLocale: () => 'en',
    createChat: async (key, input, targetSessionId) => {
      gw.createdChats.push({ key, input, targetSessionId })
      const chat = {
        key,
        agent: { session: { id: targetSessionId || 'msgw-new' } },
        turnActive: false,
        pendingMedia: [],
        dispose: async () => {},
      }
      return chat
    },
    ...overrides,
  }
  return { gw, replies }
}

test('handleGatewayCommand: /sessions lists recent msgw sessions excluding archived and non-msgw', async () => {
  const { gw } = createMockGateway()
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  await handleGatewayCommand(gw, 'tg:123', '/sessions', { platform: 'telegram', chatId: 123, reply })

  assert.ok(replyText.includes('Recent Sessions:'))
  assert.ok(replyText.includes('1. <b>TG · @alice</b> (<i>projects/repo1</i>)'))
  assert.ok(replyText.includes('2. <b>TG · @bob › topic 42</b> (<i>dev/bot</i>)'))
  assert.equal(replyText.includes('web-session'), false)
  assert.equal(replyText.includes('msgw-archived'), false)

  // Verify recentSessions cached on gw
  const cached = gw.recentSessions.get('tg:123')
  assert.equal(cached.length, 2)
  assert.equal(cached[0].id, 'msgw-1')
  assert.equal(cached[1].id, 'msgw-2')
})

test('handleGatewayCommand: /sessions respects sessionList config flag', async () => {
  const { gw } = createMockGateway({
    config: { agent: { sessionList: false } },
  })
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  await handleGatewayCommand(gw, 'tg:123', '/sessions', { platform: 'telegram', chatId: 123, reply })
  assert.ok(replyText.includes('disabled by configuration'))
})

test('handleGatewayCommand: /resume switches to selected session by index', async () => {
  const { gw } = createMockGateway()
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  // First call /sessions to populate recent list
  await handleGatewayCommand(gw, 'tg:123', '/sessions', { platform: 'telegram', chatId: 123, reply })

  // Then call /resume 1
  await handleGatewayCommand(gw, 'tg:123', '/resume 1', { platform: 'telegram', chatId: 123, threadId: 0, reply })

  assert.ok(replyText.includes('Resumed session: msgw-1'))
  assert.equal(gw.createdChats.length, 1)
  assert.equal(gw.createdChats[0].targetSessionId, 'msgw-1')
  assert.ok(gw.chats.has('tg:123'))
})

test('handleGatewayCommand: /resume switches to selected session by explicit ID', async () => {
  const { gw } = createMockGateway()
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  await handleGatewayCommand(gw, 'tg:123', '/resume msgw-custom-1234', { platform: 'telegram', chatId: 123, threadId: 0, reply })

  assert.ok(replyText.includes('Resumed session: msgw-custom-1234'))
  assert.equal(gw.createdChats.length, 1)
  assert.equal(gw.createdChats[0].targetSessionId, 'msgw-custom-1234')
})

test('handleGatewayCommand: /resume rejects while turn is active', async () => {
  const { gw } = createMockGateway()
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  gw.chats.set('tg:123', {
    turnActive: true,
    agent: { session: { id: 'msgw-active' } },
  })

  await handleGatewayCommand(gw, 'tg:123', '/resume msgw-target', { platform: 'telegram', chatId: 123, reply })
  assert.ok(replyText.includes('Cannot switch session while a turn is in progress'))
  assert.equal(gw.createdChats.length, 0)
})

test('handleGatewayCommand: /resume detects already connected session', async () => {
  const { gw } = createMockGateway()
  let replyText = ''
  const reply = (msg) => { replyText = typeof msg === 'string' ? msg : msg.text }

  gw.chats.set('tg:123', {
    turnActive: false,
    agent: { session: { id: 'msgw-already-connected' } },
  })

  await handleGatewayCommand(gw, 'tg:123', '/resume msgw-already-connected', { platform: 'telegram', chatId: 123, reply })
  assert.ok(replyText.includes('Already connected to session msgw-already-connected'))
  assert.equal(gw.createdChats.length, 0)
})
