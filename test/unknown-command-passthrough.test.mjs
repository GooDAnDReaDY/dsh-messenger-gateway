import test from 'node:test'
import assert from 'node:assert/strict'
import { handleGatewayCommand } from '../lib/gateway-commands.js'
import { Gateway } from '../lib/gateway.js'

test('Issue #162 (GitHub #8): handleGatewayCommand returns forwardToAgent: true for unknown slash commands', async () => {
  const replies = []
  const fakeGw = {
    resolveLocale: () => 'en',
    adapters: new Map(),
    config: {},
  }
  const input = {
    platform: 'telegram',
    chatId: '12345',
    userId: 'u1',
    reply: async (msg) => { replies.push(msg) },
  }

  // Known command (/help) is handled internally
  const helpRes = await handleGatewayCommand(fakeGw, 'telegram:12345', '/help', input)
  assert.equal(replies.length, 1)
  assert.notEqual(helpRes?.forwardToAgent, true)

  // Unknown command (/compact) returns forwardToAgent: true without sending unknown_command error
  replies.length = 0
  const compactRes = await handleGatewayCommand(fakeGw, 'telegram:12345', '/compact', input)
  assert.equal(compactRes?.forwardToAgent, true)
  assert.equal(replies.length, 0, 'Should not reply with unknown command error')

  // Unknown command with args (/goal fix bug)
  const goalRes = await handleGatewayCommand(fakeGw, 'telegram:12345', '/goal fix bug', input)
  assert.equal(goalRes?.forwardToAgent, true)
  assert.equal(replies.length, 0)
})

test('Issue #162 (GitHub #8): Gateway.handleMessage forwards unrecognized slash commands to agent turn', async () => {
  const turns = []
  const fakeCtx = {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: () => null,
  }
  const config = {
    telegram: { enabled: true },
    agent: { photoOnlyMode: 'prompt', sessionScope: 'user' }
  }
  const gw = new Gateway(fakeCtx, config)

  // Mock getOrCreateChat
  const fakeChat = {
    turnActive: false,
    busy: Promise.resolve(),
    agent: { session: { id: 'sess-1' } },
  }
  gw.getOrCreateChat = async () => fakeChat
  gw.runTurn = async (chat, turnInput, signal) => {
    turns.push(turnInput)
    return Promise.resolve()
  }

  // 1. Send /compact
  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/compact',
    reply: async () => {},
  })

  // Wait a microtask tick for background turn promise to dispatch
  await new Promise(r => setTimeout(r, 10))
  assert.equal(turns.length, 1)
  assert.equal(turns[0].text, '/compact')

  // 2. Send /goal@MyBot with argument (bot tag in group should be stripped)
  fakeChat.turnActive = false
  fakeChat.busy = Promise.resolve()
  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/goal@MyBot solve regression',
    reply: async () => {},
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(turns.length, 2)
  assert.equal(turns[1].text, '/goal solve regression')
})
