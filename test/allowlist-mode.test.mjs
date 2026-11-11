import test from 'node:test'
import assert from 'node:assert/strict'
import { TelegramAdapter } from '../lib/adapters/telegram.js'
import { Gateway } from '../lib/gateway.js'

test('TelegramAdapter: open mode admits everyone when allowlist is empty', () => {
  const adapter = new TelegramAdapter({
    botToken: '12345:dummy',
    allowedUserIds: [],
    allowlistMode: 'open',
  })
  assert.equal(adapter.allowed(111), true)
  assert.equal(adapter.allowed(222), true)
})

test('TelegramAdapter: open mode restricts to allowlist when non-empty', () => {
  const adapter = new TelegramAdapter({
    botToken: '12345:dummy',
    allowedUserIds: [111, 222],
    allowlistMode: 'open',
  })
  assert.equal(adapter.allowed(111), true)
  assert.equal(adapter.allowed(222), true)
  assert.equal(adapter.allowed(333), false)
})

test('TelegramAdapter: closed mode refuses everyone when allowlist is empty (fail-closed)', () => {
  const adapter = new TelegramAdapter({
    botToken: '12345:dummy',
    allowedUserIds: [],
    allowlistMode: 'closed',
  })
  assert.equal(adapter.allowed(111), false)
  assert.equal(adapter.allowed(222), false)
})

test('TelegramAdapter: closed mode admits only allowlist members when non-empty', () => {
  const adapter = new TelegramAdapter({
    botToken: '12345:dummy',
    allowedUserIds: [111],
    allowlistMode: 'closed',
  })
  assert.equal(adapter.allowed(111), true)
  assert.equal(adapter.allowed(999), false)
})

test('Gateway: isUserAllowed respects allowlistMode open vs closed', () => {
  const mockCtx = {
    logger: { debug: () => {}, warn: () => {}, info: () => {} },
  }

  // Case 1: Open mode with empty allowlist -> allowed
  const gwOpen = new Gateway(mockCtx, {
    telegram: { allowlistMode: 'open', allowedUserIds: [] },
  })
  assert.equal(gwOpen.isUserAllowed(42), true)

  // Case 2: Closed mode with empty allowlist -> refused
  const gwClosed = new Gateway(mockCtx, {
    telegram: { allowlistMode: 'closed', allowedUserIds: [] },
  })
  assert.equal(gwClosed.isUserAllowed(42), false)

  // Case 3: Closed mode with allowed user -> admitted
  const gwClosedWithUsers = new Gateway(mockCtx, {
    telegram: { allowlistMode: 'closed', allowedUserIds: [42] },
  })
  assert.equal(gwClosedWithUsers.isUserAllowed(42), true)
  assert.equal(gwClosedWithUsers.isUserAllowed(99), false)
})

test('Gateway: logs warning on startup when allowlistMode is open and list is empty', async () => {
  const warnings = []
  const mockCtx = {
    logger: {
      debug: () => {},
      warn: (msg) => warnings.push(msg),
      info: () => {},
    },
    on: () => {},
  }
  const gw = new Gateway(mockCtx, {
    enabled: true,
    telegram: { enabled: false, allowlistMode: 'open', allowedUserIds: [] },
  })
  await gw.start()
  const warnFound = warnings.some((w) => w.includes('telegram allowlist is empty in "open" mode'))
  assert.equal(warnFound, true)
})
