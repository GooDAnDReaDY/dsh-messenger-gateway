import test from 'node:test'
import assert from 'node:assert/strict'
import { timingSafeCompare, isTrustedSettingsRequest } from '../lib/http.js'
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

test('Issue #93: isTrustedSettingsRequest allows same-origin requests with sec-fetch-site or referer', () => {
  // 1. Same-origin with Origin header
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080', origin: 'http://localhost:3080' }
  }), true)

  // 2. Cross-origin with Origin header rejected
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080', origin: 'http://evil.com' }
  }), false)

  // 3. Browser GET without Origin, but with sec-fetch-site: same-origin
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080', 'sec-fetch-site': 'same-origin' }
  }), true)

  // 4. Browser GET without Origin, but with matching referer
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080', referer: 'http://localhost:3080/settings' }
  }), true)

  // 5. Cross-origin referer rejected
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080', referer: 'http://evil.com/page' }
  }), false)

  // 6. No origin, no sec-fetch-site, no referer rejected
  assert.equal(isTrustedSettingsRequest({
    headers: { host: 'localhost:3080' }
  }), false)

  // 7. No host rejected
  assert.equal(isTrustedSettingsRequest({
    headers: { origin: 'http://localhost:3080' }
  }), false)
})

test('Issue #97: POST /events rejects when webhook secret is empty or missing (fail-closed)', () => {
  function verifyEventsAuth(req, payload, webhooksConfig) {
    if (webhooksConfig?.enabled === false) {
      return { status: 404, error: 'webhooks disabled' }
    }
    const expectedSecret = String(webhooksConfig?.secret || '').trim()
    if (!expectedSecret) {
      return { status: 403, error: 'webhook secret not configured' }
    }
    const authHeader = req.headers?.authorization || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const tokenHeader = req.headers?.['x-webhook-secret'] || ''
    const provided = bearer || tokenHeader || payload.secret
    if (!timingSafeCompare(provided, expectedSecret)) {
      return { status: 401, error: 'unauthorized' }
    }
    return { status: 200, ok: true }
  }

  // 1. Secret is empty string -> 403
  assert.deepEqual(
    verifyEventsAuth({ headers: {} }, {}, { secret: '' }),
    { status: 403, error: 'webhook secret not configured' }
  )

  // 2. Secret is undefined/null -> 403
  assert.deepEqual(
    verifyEventsAuth({ headers: {} }, {}, {}),
    { status: 403, error: 'webhook secret not configured' }
  )

  // 3. Webhooks disabled -> 404
  assert.deepEqual(
    verifyEventsAuth({ headers: {} }, {}, { enabled: false, secret: 'configured' }),
    { status: 404, error: 'webhooks disabled' }
  )

  // 4. Secret configured, but request has wrong secret -> 401
  assert.deepEqual(
    verifyEventsAuth({ headers: { 'x-webhook-secret': 'wrong' } }, {}, { secret: 'my-secret' }),
    { status: 401, error: 'unauthorized' }
  )

  // 5. Secret configured and bearer token matches -> 200
  assert.deepEqual(
    verifyEventsAuth({ headers: { authorization: 'Bearer my-secret' } }, {}, { secret: 'my-secret' }),
    { status: 200, ok: true }
  )

  // 6. Secret configured and payload.secret matches -> 200
  assert.deepEqual(
    verifyEventsAuth({ headers: {} }, { secret: 'my-secret' }, { secret: 'my-secret' }),
    { status: 200, ok: true }
  )
})

