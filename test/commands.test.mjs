import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TELEGRAM_COMMANDS, normalizeTelegramCommands } from '../lib/commands.js'

test('default commands include model and status', () => {
  const names = DEFAULT_TELEGRAM_COMMANDS.map((c) => c.command)
  assert.ok(names.includes('model'))
  assert.ok(names.includes('status'))
})

test('normalize fills defaults', () => {
  const n = normalizeTelegramCommands([])
  assert.ok(n.some((c) => c.command === 'help'))
})

test('Issue #92: handleGatewayCommand /update executes without ReferenceError', async () => {
  const { handleGatewayCommand } = await import('../lib/gateway-commands.js')
  let replied = null
  const input = {
    reply: (msg) => { replied = msg },
    userId: 12345,
    chatId: 100,
    platform: 'telegram',
  }
  const gw = {
    isUserAllowed: () => true,
    resolveLocale: () => 'en',
  }
  await handleGatewayCommand(gw, 'tg:100', '/update', input)
  assert.ok(replied)
  assert.ok(typeof replied === 'string')
})

test('Issue #92: handleGatewayCommand /fork executes with ensureContentArray without ReferenceError', async () => {
  const { handleGatewayCommand } = await import('../lib/gateway-commands.js')
  let replied = null
  const input = {
    reply: (msg) => { replied = msg },
    userId: 12345,
    chatId: 100,
    platform: 'telegram',
  }
  const oldSession = {
    id: 'old-sess-1',
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi' }] }
    ]
  }
  const newSession = {
    id: 'new-sess-2',
    messages: []
  }
  const gw = {
    resolveLocale: () => 'en',
    chats: new Map([
      ['tg:100', {
        agent: { session: oldSession }
      }]
    ]),
    createChat: async () => ({
      agent: { session: newSession }
    }),
    ctx: {
      get: () => ({ flush: async () => {} }),
    }
  }
  await handleGatewayCommand(gw, 'tg:100', '/fork', input)
  assert.ok(replied)
  assert.ok(replied.includes('Forked session!'))
  assert.equal(newSession.messages.length, 2)
  assert.deepEqual(newSession.messages[0].content, [{ type: 'text', text: 'hello' }])
})

