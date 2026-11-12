import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

function createFakeContext(cfg = {}) {
  const registeredListeners = new Map()
  let dispatched = []
  let logged = { debug: [], warn: [], info: [] }

  const mockGw = {
    messenger: {
      home: (name) => {
        if (cfg._missingHome) return null
        return { chatId: 123456789, threadId: 0 }
      },
    },
    isMuted: (chatId) => Boolean(cfg._muted),
    messengerSend: async (target, payload) => {
      if (cfg._deliveryFail) {
        throw new Error('Telegram network error 500')
      }
      dispatched.push({ target, payload })
      return { ok: true }
    },
  }

  const fakeCtx = {
    on: (eventName, listener) => {
      if (!registeredListeners.has(eventName)) {
        registeredListeners.set(eventName, [])
      }
      registeredListeners.get(eventName).push(listener)
      return () => {
        const arr = registeredListeners.get(eventName) || []
        const idx = arr.indexOf(listener)
        if (idx >= 0) arr.splice(idx, 1)
      }
    },
    effect: (fn) => fn(),
    provide: () => {},
    inject: () => ({}),
    get: (key) => {
      if (key === 'messenger-gateway') return mockGw
      return null
    },
    logger: {
      info: (m) => logged.info.push(String(m)),
      warn: (m) => logged.warn.push(String(m)),
      debug: (m) => logged.debug.push(String(m)),
    },
    webServer: { register: () => () => {} },
  }

  const fullConfig = {
    enabled: false,
    telegram: {
      enabled: false,
      notifyBridge: {
        enabled: true,
        home: 'main',
        events: cfg.events || ['task_done', 'error', 'approval', 'blocked', 'max_tokens'],
        excludeSessionPrefixes: ['msgw-'],
      },
    },
  }

  apply(fakeCtx, fullConfig)

  const trigger = (event, session = { id: 'web-session-123' }) => {
    const sessionListeners = registeredListeners.get('session/event') || []
    for (const l of sessionListeners) l(session, event)
  }

  return {
    fakeCtx,
    dispatched,
    logged,
    trigger,
  }
}

test('notify-bridge: approval/asked triggers notification card (#187)', async () => {
  const env = createFakeContext()
  env.trigger({
    type: 'approval/asked',
    data: { id: 'appr-99', toolName: 'bash', reason: 'rm -rf /var/cache' },
  })

  await new Promise((r) => setTimeout(r, 20))

  assert.equal(env.dispatched.length, 1)
  const text = env.dispatched[0].payload.text
  assert.match(text, /【Action approval required】/)
  assert.match(text, /tool: bash/)
  assert.match(text, /reason: rm -rf \/var\/cache/)
  assert.match(text, /id: appr-99/)
})

test('notify-bridge: turn/end outcomes (completed, error, blocked, max-tokens) (#187)', async () => {
  const env = createFakeContext()

  // 1. Completed
  env.trigger({
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 1)
  assert.match(env.dispatched[0].payload.text, /【Task completed】/)

  // 2. Blocked
  env.trigger({
    type: 'turn/end',
    data: { turn: 2, reason: { kind: 'blocked', reason: 'security policy denied execution' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 2)
  assert.match(env.dispatched[1].payload.text, /【Agent blocked】/)
  assert.match(env.dispatched[1].payload.text, /reason: security policy denied execution/)

  // 3. Max-tokens
  env.trigger({
    type: 'turn/end',
    data: { turn: 3, reason: { kind: 'max-tokens' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 3)
  assert.match(env.dispatched[2].payload.text, /【Max tokens reached】/)

  // 4. Error
  env.trigger({
    type: 'turn/end',
    data: { turn: 4, reason: { kind: 'error', error: { message: 'upstream timeout' } } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 4)
  assert.match(env.dispatched[3].payload.text, /【Agent error】/)
  assert.match(env.dispatched[3].payload.text, /error: upstream timeout/)
})

test('notify-bridge: excludes messenger sessions (msgw-*) (#187)', async () => {
  const env = createFakeContext()
  env.trigger(
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { id: 'msgw-tg-12345' }
  )
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 0, 'Must not dispatch notification for msgw-* session')
})

test('notify-bridge: replay prevention skips duplicate events (#187)', async () => {
  const env = createFakeContext()
  const event = {
    type: 'approval/asked',
    data: { id: 'appr-single', toolName: 'write_file' },
  }
  // Fire twice
  env.trigger(event)
  env.trigger(event)
  await new Promise((r) => setTimeout(r, 20))

  assert.equal(env.dispatched.length, 1, 'Duplicate approval event must be filtered out by replay guard')
})

test('notify-bridge: missing recipient does not throw and skips gracefully (#187)', async () => {
  const env = createFakeContext({ _missingHome: true })
  env.trigger({
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 0)
  assert.ok(env.logged.debug.some((m) => m.includes('recipient home "main" not found')))
})

test('notify-bridge: delivery failure logs warning without crashing (#187)', async () => {
  const env = createFakeContext({ _deliveryFail: true })
  env.trigger({
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(env.logged.warn.some((m) => m.includes('notify bridge delivery failed: Telegram network error 500')))
})

test('notify-bridge: preserves default behavior when only task_done/error configured (#187)', async () => {
  const env = createFakeContext({ events: ['task_done', 'error'] })
  env.trigger({
    type: 'approval/asked',
    data: { id: 'appr-ignored', toolName: 'bash' },
  })
  env.trigger({
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'blocked' } },
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(env.dispatched.length, 0, 'Unconfigured approval and blocked events must be filtered out')
})
