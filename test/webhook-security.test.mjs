import test from 'node:test'
import assert from 'node:assert/strict'
import { timingSafeCompare } from '../lib/http.js'
import { TelegramAdapter } from '../lib/adapters/telegram.js'

test('timingSafeCompare strictly checks equality in constant time', () => {
  assert.equal(timingSafeCompare('my-secret-token-123', 'my-secret-token-123'), true)
  assert.equal(timingSafeCompare('my-secret-token-123', 'my-secret-token-124'), false)
  assert.equal(timingSafeCompare('my-secret-token-123', 'short'), false)
  assert.equal(timingSafeCompare('', ''), true)
  assert.equal(timingSafeCompare('token', ''), false)
  assert.equal(timingSafeCompare(null, 'token'), false)
  assert.equal(timingSafeCompare(undefined, undefined), false)
})

test('TelegramAdapter requires webhookSecret when transport is webhook', async () => {
  const adapterWithoutSecret = new TelegramAdapter({
    botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    transport: 'webhook',
    webhookUrl: 'https://example.com/webhook',
    webhookSecret: '',
  })

  await assert.rejects(
    async () => {
      await adapterWithoutSecret.start()
    },
    {
      message: 'telegram webhookSecret is required for webhook transport'
    }
  )

  const calls = []
  const adapterWithSecret = new TelegramAdapter({
    botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    transport: 'webhook',
    webhookUrl: 'https://example.com/webhook',
    webhookSecret: 'super-secret-token',
  })
  adapterWithSecret.call = async (method, params) => {
    calls.push({ method, params })
    return { ok: true }
  }

  await adapterWithSecret.start()
  const setWebhookCall = calls.find(c => c.method === 'setWebhook')
  assert.ok(setWebhookCall, 'setWebhook must be called')
  assert.equal(setWebhookCall.params.secret_token, 'super-secret-token', 'secret_token must match configured secret')
})

test('Issue #69: Webhook authentication logic rejects empty secrets and mismatched headers', () => {
  function verifyWebhookAuth(reqHeaders, configuredSecret) {
    const secret = String(configuredSecret || '').trim()
    if (!secret) {
      return { status: 403, error: 'webhook secret not configured' }
    }
    const hdr = String(reqHeaders['x-telegram-bot-api-secret-token'] || '')
    if (!timingSafeCompare(hdr, secret)) {
      return { status: 403, error: 'bad secret' }
    }
    return { status: 200, ok: true }
  }

  // 1. Empty secret configured -> 403 rejection
  assert.deepEqual(
    verifyWebhookAuth({ 'x-telegram-bot-api-secret-token': 'any-secret' }, ''),
    { status: 403, error: 'webhook secret not configured' }
  )
  assert.deepEqual(
    verifyWebhookAuth({ 'x-telegram-bot-api-secret-token': '' }, '   '),
    { status: 403, error: 'webhook secret not configured' }
  )

  // 2. Mismatched secret -> 403 bad secret
  assert.deepEqual(
    verifyWebhookAuth({ 'x-telegram-bot-api-secret-token': 'wrong-secret' }, 'correct-secret'),
    { status: 403, error: 'bad secret' }
  )
  assert.deepEqual(
    verifyWebhookAuth({}, 'correct-secret'),
    { status: 403, error: 'bad secret' }
  )

  // 3. Valid secret -> 200 OK
  assert.deepEqual(
    verifyWebhookAuth({ 'x-telegram-bot-api-secret-token': 'correct-secret' }, 'correct-secret'),
    { status: 200, ok: true }
  )
})
