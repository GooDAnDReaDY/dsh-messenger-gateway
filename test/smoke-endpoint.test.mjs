import test from 'node:test'
import assert from 'node:assert/strict'
import { TelegramAdapter } from '../lib/adapters/telegram.js'

test('probeHealth returns error when bot token is empty', async () => {
  const adapter = new TelegramAdapter({ botToken: '' })
  const result = await adapter.probeHealth(1000)
  assert.equal(result.ok, false)
  assert.match(result.error, /token is empty/i)
})

test('probeHealth handles network error gracefully with latency tracking', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Connection refused')
  }
  try {
    const adapter = new TelegramAdapter({ botToken: 'mock-token' })
    const result = await adapter.probeHealth(1000)
    assert.equal(result.ok, false)
    assert.match(result.error, /Connection refused/)
    assert.equal(typeof result.latencyMs, 'number')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('probeHealth succeeds when getMe returns valid bot info', async () => {
  const origFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: {
          id: 123456789,
          is_bot: true,
          first_name: 'TestBot',
          username: 'test_messenger_bot',
        }
      })
    }
  }
  try {
    const adapter = new TelegramAdapter({ botToken: 'valid-token' })
    const result = await adapter.probeHealth(2000)
    assert.equal(result.ok, true)
    assert.equal(result.botId, 123456789)
    assert.equal(result.botUsername, 'test_messenger_bot')
    assert.equal(result.firstName, 'TestBot')
    assert.equal(typeof result.latencyMs, 'number')
  } finally {
    globalThis.fetch = origFetch
  }
})
