import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveMemoryConfig,
  parseMemoryListText,
  cleanRecalledMemories,
  formatMemoryContext,
  extractConversationalPreferences,
  callMemoryMcp,
  listUserMemories,
  recallUserMemories,
  rememberUserFact,
  forgetUserMemory,
  recordTurnMemory,
} from '../lib/memory-brain.js'
import { handleGatewayCommand } from '../lib/gateway-commands.js'

test('resolveMemoryConfig handles defaults and overrides', () => {
  const cfg1 = resolveMemoryConfig({})
  assert.equal(cfg1.enabled, true)
  assert.equal(cfg1.baseUrl, 'http://127.0.0.1:28080')
  assert.equal(cfg1.tokenEnv, 'MEMORY_BRAIN_TOKEN')
  assert.equal(cfg1.timeoutMs, 3500)
  assert.equal(cfg1.budget, 2000)

  const cfg2 = resolveMemoryConfig({
    enabled: false,
    baseUrl: 'https://memory.internal:8080/',
    token: 'custom_token',
    budget: 4000,
    timeoutMs: 5000,
  })
  assert.equal(cfg2.enabled, false)
  assert.equal(cfg2.baseUrl, 'https://memory.internal:8080')
  assert.equal(cfg2.token, 'custom_token')
  assert.equal(cfg2.budget, 4000)
  assert.equal(cfg2.timeoutMs, 5000)
})

test('parseMemoryListText extracts ids and content accurately', () => {
  const raw = `[protocol memory-verbs/v1 verb=list count=2 offset=0 limit=20]
- [id:95b82eb8-ae00-4e7a-a4bb-842cc5f36b3b] 2026-10-29 user:42/general — User prefers Python
- [id:a1b2c3d4-0000-0000-0000-000000000000] user:42/preference — Dark mode enabled`

  const items = parseMemoryListText(raw)
  assert.equal(items.length, 2)
  assert.equal(items[0].id, '95b82eb8-ae00-4e7a-a4bb-842cc5f36b3b')
  assert.equal(items[0].content, 'User prefers Python')
  assert.equal(items[1].id, 'a1b2c3d4-0000-0000-0000-000000000000')
  assert.equal(items[1].content, 'Dark mode enabled')

  assert.deepEqual(parseMemoryListText(''), [])
  assert.deepEqual(parseMemoryListText(null), [])
})

test('cleanRecalledMemories strips headers and formats bullets', () => {
  const raw = `[protocol memory-verbs/v1 verb=recall intent=query coverage=partial k=10 total_returned=2 ready=0 pending=1]
Index not fully ready: 1 memories await embedding.
- [id:95b82eb8-ae00-4e7a-a4bb-842cc5f36b3b] User prefers concise answers — written by agent on Mon Oct 19. found via BM25 (score 0.50).
- [id:11111111-2222-3333-4444-555555555555] Always write unit tests for PRs.`

  const clean = cleanRecalledMemories(raw)
  assert.ok(clean.includes('- User prefers concise answers'))
  assert.ok(clean.includes('- Always write unit tests for PRs.'))
  assert.ok(!clean.includes('[protocol'))
  assert.ok(!clean.includes('Index not fully ready'))
  assert.ok(!clean.includes('score 0.50'))

  const formatted = formatMemoryContext(raw, 42)
  assert.ok(formatted.includes('[User Memory Profile (userId: 42)]:'))
  assert.ok(formatted.includes('- User prefers concise answers'))
})

test('extractConversationalPreferences detects preferences in RU and EN', () => {
  assert.equal(extractConversationalPreferences('Запомни: я люблю лаконичный код'), 'я люблю лаконичный код')
  assert.equal(extractConversationalPreferences('i prefer dark mode and typescript'), 'dark mode and typescript')
  assert.equal(extractConversationalPreferences('Всегда используй ESM модули'), 'ESM модули')
  assert.equal(extractConversationalPreferences('My name is Alice'), 'Alice')
  assert.equal(extractConversationalPreferences('Меня зовут Вадим'), 'Вадим')
  assert.equal(extractConversationalPreferences('Какая погода сегодня?'), null)
  assert.equal(extractConversationalPreferences('/memory add test'), null)
})

test('callMemoryMcp, listUserMemories, recallUserMemories and rememberUserFact execute with mock fetch', async () => {
  const originalFetch = globalThis.fetch
  const calls = []

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    const { name, arguments: args } = JSON.parse(options.body).params

    if (name === 'brain_list') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [
              {
                type: 'text',
                text: `- [id:12345678-abcd-ef01-2345-6789abcdef01] user:${args.scope} — Test fact 1\n- [id:87654321-abcd-ef01-2345-6789abcdef01] user:${args.scope} — Test fact 2`,
              },
            ],
          },
        }),
      }
    }

    if (name === 'brain_recall') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 2,
          result: {
            content: [
              {
                type: 'text',
                text: `- [id:12345678-abcd-ef01-2345-6789abcdef01] Relevant fact for ${args.query}`,
              },
            ],
          },
        }),
      }
    }

    if (name === 'brain_remember') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 3,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ memoryId: 'new-fact-uuid-123', ok: true }),
              },
            ],
          },
        }),
      }
    }

    if (name === 'brain_forget') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 4,
          result: {
            content: [
              {
                type: 'text',
                text: `Soft-deleted memory ${args.memory_id}`,
              },
            ],
          },
        }),
      }
    }

    return { ok: false, status: 500 }
  }

  try {
    const config = { enabled: true, baseUrl: 'http://mock-mb:28080', token: 'mock-tok' }

    // 1. List
    const listRes = await listUserMemories({ config, userId: 1001 })
    assert.equal(listRes.ok, true)
    assert.equal(listRes.items.length, 2)
    assert.equal(calls[0].body.params.arguments.scope, 'user:1001')

    // 2. Recall
    const recalled = await recallUserMemories({ config, userId: 1001, query: 'TypeScript rules' })
    assert.ok(recalled.includes('Relevant fact for TypeScript rules'))

    // 3. Remember
    const remRes = await rememberUserFact({ config, userId: 1001, content: 'Always run linter' })
    assert.equal(remRes.ok, true)
    assert.equal(remRes.memoryId, 'new-fact-uuid-123')

    // 4. Forget single by prefix
    const forgetRes = await forgetUserMemory({ config, userId: 1001, memoryId: '12345678' })
    assert.equal(forgetRes.ok, true)

    // 5. Forget all
    const forgetAllRes = await forgetUserMemory({ config, userId: 1001, memoryId: 'all' })
    assert.equal(forgetAllRes.ok, true)
    assert.equal(forgetAllRes.count, 2)

    // 6. Record turn memory
    const turnRes = await recordTurnMemory({
      config,
      userId: 1001,
      userText: 'Я предпочитаю русский язык в интерфейсе',
      assistantText: 'Понял!',
    })
    assert.equal(turnRes.ok, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('handleGatewayCommand /memory and /forget manage user profile', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    const { name, arguments: args } = JSON.parse(options.body).params
    if (name === 'brain_list') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: '- [id:aabbccdd-1234-5678-90ab-cdef12345678] User prefers tabs over spaces' }],
          },
        }),
      }
    }
    if (name === 'brain_remember') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 2,
          result: { content: [{ type: 'text', text: JSON.stringify({ memoryId: 'uuid-stored' }) }] },
        }),
      }
    }
    if (name === 'brain_forget') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 3,
          result: { content: [{ type: 'text', text: 'Soft-deleted' }] },
        }),
      }
    }
    return { ok: false, status: 500 }
  }

  try {
    const replies = []
    const gw = {
      config: {
        memory: { enabled: true, baseUrl: 'http://test:28080', token: 'tok' },
        defaultLocale: 'en',
      },
      resolveLocale: () => 'en',
      chats: new Map(),
    }

    const input = {
      chatId: 100,
      userId: 42,
      threadId: 0,
      reply: (msg) => replies.push(msg),
    }

    // List memories
    await handleGatewayCommand(gw, 'test-key', '/memory', input)
    assert.ok(replies[replies.length - 1].includes('User Memory Profile'))
    assert.ok(replies[replies.length - 1].includes('User prefers tabs over spaces'))

    // Add memory
    await handleGatewayCommand(gw, 'test-key', '/memory add Use pnpm for all packages', input)
    assert.ok(replies[replies.length - 1].includes('Memory remembered'))
    assert.ok(replies[replies.length - 1].includes('Use pnpm for all packages'))

    // Forget memory
    await handleGatewayCommand(gw, 'test-key', '/forget aabbccdd', input)
    assert.ok(replies[replies.length - 1].includes('Forgotten memory'))
  } finally {
    globalThis.fetch = originalFetch
  }
})
