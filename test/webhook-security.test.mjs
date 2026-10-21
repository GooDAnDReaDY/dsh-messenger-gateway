import test from 'node:test'
import assert from 'node:assert/strict'
import { timingSafeCompare, isTrustedSettingsRequest, readBody, isLoopback, isAuthorizedMessengerRequest, isPrivateAddress, isLoopbackOrLan } from '../lib/http.js'
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

test('Issue #103: readBody enforces maxBytes limits and rejects oversized payloads with 413', async () => {
  // 1. Content-Length header exceeding limit rejects immediately
  const reqWithBigCl = {
    headers: { 'content-length': '2000000' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('chunk')
    },
  }
  await assert.rejects(
    async () => readBody(reqWithBigCl, 1000),
    (err) => err.statusCode === 413 && err.message.includes('exceeds')
  )

  // 2. Stream chunk bytes exceeding limit rejects with 413
  const reqStreamingTooMuch = {
    headers: {},
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.alloc(600)
      yield Buffer.alloc(600)
    },
  }
  await assert.rejects(
    async () => readBody(reqStreamingTooMuch, 1000),
    (err) => err.statusCode === 413 && err.message.includes('exceeded 1000 bytes')
  )

  // 3. Normal stream within limit succeeds
  const reqNormal = {
    headers: { 'content-length': '11' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('hello ')
      yield Buffer.from('world')
    },
  }
  const buf = await readBody(reqNormal, 1000)
  assert.equal(buf.toString('utf8'), 'hello world')
})

test('Issue #103: POST /events rejects unauthenticated requests before body buffering', async () => {
  let bodyReadCalled = false
  const unauthenticatedReq = {
    method: 'POST',
    headers: { 'x-webhook-secret': 'wrong-secret' },
    [Symbol.asyncIterator]: async function* () {
      bodyReadCalled = true
      yield Buffer.from('some large payload')
    },
  }

  async function simulateEventsHandler(req, webhooksConfig) {
    if (webhooksConfig?.enabled === false) return { status: 404 }
    const expectedSecret = String(webhooksConfig?.secret || '').trim()
    if (!expectedSecret) return { status: 403 }

    const authHeader = req.headers?.authorization || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const tokenHeader = req.headers?.['x-webhook-secret'] || ''
    const headerProvided = bearer || tokenHeader

    if (headerProvided) {
      if (!timingSafeCompare(headerProvided, expectedSecret)) {
        return { status: 401 }
      }
    }

    await readBody(req, 1_048_576)
    return { status: 200 }
  }

  const res = await simulateEventsHandler(unauthenticatedReq, { secret: 'correct-secret' })
  assert.equal(res.status, 401)
  assert.equal(bodyReadCalled, false, 'body must NOT be read when header auth fails')
})

test('Issue #102: isLoopback correctly detects loopback addresses and rejects remote IPs', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('127.0.1.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback('[::1]'), true)

  assert.equal(isLoopback('192.168.1.50'), false)
  assert.equal(isLoopback('10.0.0.1'), false)
  assert.equal(isLoopback('8.8.8.8'), false)
  assert.equal(isLoopback(''), false)
  assert.equal(isLoopback(undefined), false)
})

test('Issue #102: isTrustedSettingsRequest enforces remote address and rejects remote forgeable headers', () => {
  // 1. Cross-site request rejected even if remoteAddress is loopback
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: 'localhost:3080', 'sec-fetch-site': 'cross-site', origin: 'http://evil.com' },
      socket: { remoteAddress: '127.0.0.1' }
    }),
    false
  )

  // 2. Remote address attempting to forge sec-fetch-site: same-origin rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: 'localhost:3080', 'sec-fetch-site': 'same-origin' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 3. Remote address with no origin/referer rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: 'localhost:3080' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 4. Loopback request without browser headers (CLI/curl) accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: 'localhost:3080' },
      socket: { remoteAddress: '127.0.0.1' }
    }),
    true
  )
})

test('Issue #102: isAuthorizedMessengerRequest forms fail-closed boundary for internal write routes', () => {
  const cfg = { secret: 'secret-token-42' }

  // 1. Cross-site request rejected
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { host: 'localhost:3080', 'sec-fetch-site': 'cross-site' }, socket: { remoteAddress: '127.0.0.1' } },
      cfg
    ),
    false
  )

  // 2. Unauthenticated remote request rejected
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { host: 'localhost:3080' }, socket: { remoteAddress: '192.168.1.50' } },
      cfg
    ),
    false
  )

  // 3. Loopback request (internal plugins / local CLI) accepted
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { host: 'localhost:3080' }, socket: { remoteAddress: '127.0.0.1' } },
      cfg
    ),
    true
  )

  // 4. Same-origin browser request accepted
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { host: 'localhost:3080', origin: 'http://localhost:3080' } },
      cfg
    ),
    true
  )

  // 5. Remote request with valid webhook secret Bearer token accepted
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { authorization: 'Bearer secret-token-42' }, socket: { remoteAddress: '192.168.1.50' } },
      cfg
    ),
    true
  )

  // 6. Remote request with valid x-webhook-secret header accepted
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { 'x-webhook-secret': 'secret-token-42' }, socket: { remoteAddress: '192.168.1.50' } },
      cfg
    ),
    true
  )

  // 7. Remote request with invalid webhook secret rejected
  assert.equal(
    isAuthorizedMessengerRequest(
      { headers: { 'x-webhook-secret': 'wrong-token' }, socket: { remoteAddress: '192.168.1.50' } },
      cfg
    ),
    false
  )
})

test('Issue #143: isPrivateAddress and isLoopbackOrLan recognize RFC 1918, link-local, IPv6 ULA, and reject public WAN IPs', () => {
  // Loopback IPv4 and IPv6
  assert.equal(isPrivateAddress('127.0.0.1'), true)
  assert.equal(isPrivateAddress('127.10.20.30'), true)
  assert.equal(isPrivateAddress('::1'), true)
  assert.equal(isPrivateAddress('localhost'), true)
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true)

  // RFC 1918 Class A (10.0.0.0/8)
  assert.equal(isPrivateAddress('10.0.0.1'), true)
  assert.equal(isPrivateAddress('10.255.255.254'), true)
  assert.equal(isPrivateAddress('::ffff:10.1.2.3'), true)

  // RFC 1918 Class B (172.16.0.0/12)
  assert.equal(isPrivateAddress('172.16.0.1'), true)
  assert.equal(isPrivateAddress('172.24.1.1'), true)
  assert.equal(isPrivateAddress('172.31.255.255'), true)
  assert.equal(isPrivateAddress('172.15.255.255'), false)
  assert.equal(isPrivateAddress('172.32.0.1'), false)

  // RFC 1918 Class C (192.168.0.0/16)
  assert.equal(isPrivateAddress('192.168.0.1'), true)
  assert.equal(isPrivateAddress('192.168.1.50'), true)
  assert.equal(isPrivateAddress('192.168.254.254'), true)
  assert.equal(isPrivateAddress('::ffff:192.168.1.50'), true)

  // Link-Local IPv4 (169.254.0.0/16)
  assert.equal(isPrivateAddress('169.254.1.1'), true)
  assert.equal(isPrivateAddress('169.254.254.254'), true)

  // IPv6 ULA (fc00::/7) and Link-Local (fe80::/10)
  assert.equal(isPrivateAddress('fc00::1'), true)
  assert.equal(isPrivateAddress('fd00::1'), true)
  assert.equal(isPrivateAddress('fd12:3456:789a::1'), true)
  assert.equal(isPrivateAddress('fe80::1'), true)
  assert.equal(isPrivateAddress('fe80::1234:5678:9abc:def0'), true)

  // Public WAN addresses
  assert.equal(isPrivateAddress('8.8.8.8'), false)
  assert.equal(isPrivateAddress('1.1.1.1'), false)
  assert.equal(isPrivateAddress('93.184.216.34'), false)
  assert.equal(isPrivateAddress('203.0.113.50'), false)
  assert.equal(isPrivateAddress('2001:db8::1'), false)
  assert.equal(isPrivateAddress('2606:4700::1'), false)
  assert.equal(isPrivateAddress(''), false)
  assert.equal(isPrivateAddress(null), false)
  assert.equal(isPrivateAddress(undefined), false)

  // Alias verification
  assert.equal(isLoopbackOrLan, isPrivateAddress)
})

test('Issue #143 & #157: isTrustedSettingsRequest rejects unauthenticated LAN requests and allows DSH sessions or secrets', () => {
  // 1. LAN browser without secret and without DSH connection session -> rejected (Fixes #157: LAN is not authentication)
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 2. LAN browser with Referer without secret/session -> rejected (#157)
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', referer: 'http://192.168.1.111:3000/settings' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 3. LAN browser with sec-fetch-site: same-origin without secret/session -> rejected (#157)
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', referer: 'http://192.168.1.111:3000/settings', 'sec-fetch-site': 'same-origin' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 4. LAN browser with DSH Connection Service session admission -> accepted (#157)
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' },
      connectionService: { requestRejection: () => undefined },
    }),
    true
  )

  // 5. LAN browser with DSH Connection Service rejecting session -> rejected (#157)
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' },
      connectionService: { requestRejection: () => 401 },
    }),
    false
  )

  // 6. LAN browser with DSH Connection via Cordis ctx -> accepted (#157)
  const mockCtx = {
    connection: { requestRejection: () => undefined }
  }
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' },
    }, undefined, mockCtx),
    true
  )

  // 7. LAN browser with valid Bearer secret -> accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000', authorization: 'Bearer lan-secret' },
      socket: { remoteAddress: '192.168.1.50' }
    }, 'lan-secret'),
    true
  )

  // 8. External WAN client with forged Origin matching Host without secret -> rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '203.0.113.50' }
    }),
    false
  )

  // 9. External WAN client with valid Bearer secret -> accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000', authorization: 'Bearer wan-secret' },
      socket: { remoteAddress: '203.0.113.50' }
    }, 'wan-secret'),
    true
  )

  // 10. External WAN client with valid x-webhook-secret -> accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000', 'x-webhook-secret': 'wan-secret' },
      socket: { remoteAddress: '203.0.113.50' }
    }, 'wan-secret'),
    true
  )

  // 11. LAN client with cross-site Origin (CSRF attempt) -> rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://evil.com' },
      socket: { remoteAddress: '192.168.1.50' },
      connectionService: { requestRejection: () => undefined },
    }),
    false
  )

  // 12. LAN client with sec-fetch-site: cross-site -> rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000', 'sec-fetch-site': 'cross-site' },
      socket: { remoteAddress: '192.168.1.50' },
      connectionService: { requestRejection: () => undefined },
    }),
    false
  )

  // 13. LAN headless client without Origin/Referer/Secret -> rejected
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' }
    }),
    false
  )

  // 14. Loopback client with Origin matching Host -> accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: 'localhost:3080', origin: 'http://localhost:3080' },
      socket: { remoteAddress: '127.0.0.1' }
    }),
    true
  )

  // 15. Loopback headless client without headers -> accepted
  assert.equal(
    isTrustedSettingsRequest({
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' }
    }),
    true
  )

  // 12. LAN client attacking messenger API with forged Origin -> rejected in isAuthorizedMessengerRequest
  assert.equal(
    isAuthorizedMessengerRequest({
      headers: { host: '192.168.1.111:3000', origin: 'http://192.168.1.111:3000' },
      socket: { remoteAddress: '192.168.1.50' }
    }, { secret: 'secret-token-42' }),
    false
  )

  // 13. Messenger API with valid secret -> accepted
  assert.equal(
    isAuthorizedMessengerRequest({
      headers: { host: '192.168.1.111:3000', authorization: 'Bearer secret-token-42' },
      socket: { remoteAddress: '192.168.1.50' }
    }, { secret: 'secret-token-42' }),
    true
  )
})



