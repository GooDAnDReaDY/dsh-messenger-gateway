// Proxy engine tests: URL parsing, HTTP CONNECT and SOCKS5 tunnels, adapter
// integration. Mock servers live in test/mocks.mjs and never touch the network.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import tls from 'node:tls'

import { startHttpConnectProxy, startMockTelegram, startSocks5Proxy } from './mocks.mjs'
import { cert } from './fixtures/tls.mjs'
import { TelegramAdapter } from '../lib/adapters/telegram.js'
import {
  createProxiedFetch, describeProxy, maskProxyUrl, normalizeProxyUrl, parseProxySpec,
  resolveProxySetting, shouldBypassProxy,
} from '../lib/proxy.js'

// Trust the throwaway test certificate for the tunnel tests. On runtimes without
// tls.setDefaultCACertificates the helper falls back to disabling verification
// for this test process only.
if (typeof tls.setDefaultCACertificates === 'function') {
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), cert])
} else {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const logger = { info() {}, warn() {}, error() {}, debug() {} }

let tg
let connectProxy
let authProxy
let slowProxy
let socks
let socksAuth

before(async () => {
  tg = await startMockTelegram()
  connectProxy = await startHttpConnectProxy()
  authProxy = await startHttpConnectProxy({ username: 'user', password: 'p@ss' })
  slowProxy = await startHttpConnectProxy({ delayMs: 1500 })
  socks = await startSocks5Proxy()
  socksAuth = await startSocks5Proxy({ username: 'suser', password: 'spass' })
})

after(async () => {
  const closeQuietly = (server) => Promise.race([
    Promise.resolve(server?.close()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ])
  for (const server of [tg, connectProxy, authProxy, slowProxy, socks, socksAuth]) {
    await closeQuietly(server)
  }
})

async function expectReject(promise, pattern, message) {
  try {
    await promise
  } catch (err) {
    if (pattern && !pattern.test(String(err?.message || err))) {
      throw new Error(`${message}: /${pattern}/ did not match "${err?.message || err}"`)
    }
    return err
  }
  throw new Error(`${message}: expected rejection`)
}

// ---------------------------------------------------------------- URL handling

test('parseProxySpec handles schemes, credentials and default ports', () => {
  const spec = parseProxySpec('socks5://user:p%40ss@127.0.0.1:1080')
  assert.equal(spec.kind, 'socks5')
  assert.equal(spec.password, 'p@ss')
  assert.equal(spec.port, 1080)
  assert.equal(maskProxyUrl(spec), 'socks5://user:***@127.0.0.1:1080')
  assert.equal(parseProxySpec('http://proxy.local').port, 80)
  assert.equal(parseProxySpec('proxy.local:3128').kind, 'http')
  assert.equal(parseProxySpec(''), null)
  assert.equal(parseProxySpec('off'), null)
  assert.equal(normalizeProxyUrl('socks5://user:p%40ss@127.0.0.1:1080'), 'socks5://user:p%40ss@127.0.0.1:1080')
  assert.equal(normalizeProxyUrl(''), '')
})

test('invalid proxy URLs raise a clear error', () => {
  assert.throws(() => parseProxySpec('ftp://host:21'), /unsupported proxy protocol/)
})

test('resolveProxySetting prefers settings, then environment; off wins', () => {
  const env = { TELEGRAM_PROXY: 'socks5://env:1080' }
  assert.equal(resolveProxySetting('http://settings:8080', env), 'http://settings:8080')
  assert.equal(resolveProxySetting('', env), 'socks5://env:1080')
  assert.equal(resolveProxySetting('off', env), '')
  assert.equal(resolveProxySetting('', {}), '')
})

test('shouldBypassProxy honours NO_PROXY rules', () => {
  assert.equal(shouldBypassProxy('api.telegram.org', { NO_PROXY: 'telegram.org' }), true)
  assert.equal(shouldBypassProxy('api.telegram.org', { NO_PROXY: '*' }), true)
  assert.equal(shouldBypassProxy('api.telegram.org', { NO_PROXY: 'example.com' }), false)
})

test('describeProxy reports state for the settings UI', () => {
  const info = describeProxy('socks5://u:p@h:1080')
  assert.equal(info.active, true)
  assert.equal(info.source, 'settings')
  assert.equal(info.label, 'socks5://u:***@h:1080')
  const bad = describeProxy('ftp://h:1')
  assert.equal(bad.active, false)
  assert.match(bad.error, /unsupported proxy protocol/)
})

// ------------------------------------------------------- HTTP CONNECT tunnels

test('GET through an HTTP CONNECT proxy reaches the HTTPS target', async () => {
  const before = connectProxy.connections.length
  const apiFetch = createProxiedFetch(connectProxy.url, { logger })
  const res = await apiFetch(`${tg.url}/file/botTOKEN/docs/file.txt`)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'hello-from-telegram')
  assert.equal(connectProxy.connections.length, before + 1)
  assert.equal(connectProxy.connections.at(-1).host, 'localhost')
})

test('JSON POST through an HTTP CONNECT proxy', async () => {
  const apiFetch = createProxiedFetch(connectProxy.url, { logger })
  const res = await apiFetch(`${tg.url}/botTOKEN/getMe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert.equal((await res.json()).result.username, 'mock_bot')
})

test('multipart FormData upload through a proxy keeps the payload intact', async () => {
  const apiFetch = createProxiedFetch(connectProxy.url, { logger })
  const form = new FormData()
  form.append('chat_id', '1')
  form.append('document', new Blob([Buffer.from('MARKER-42')]), 'note.txt')
  const res = await apiFetch(`${tg.url}/botTOKEN/sendDocument`, { method: 'POST', body: form })
  const data = await res.json()
  assert.equal(data.result.multipart, true)
  assert.equal(data.result.filename, 'note.txt')
  assert.equal(data.result.payload_contains_marker, true)
})

test('proxy authentication is sent and enforced (407)', async () => {
  const authorized = createProxiedFetch(authProxy.url, { logger })
  const ok = await authorized(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' })
  assert.equal(ok.status, 200)

  const anonymous = createProxiedFetch(`http://127.0.0.1:${authProxy.port}`, { logger, timeoutMs: 5000 })
  await expectReject(
    anonymous(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' }),
    /407/,
    'missing proxy credentials',
  )
})

// --------------------------------------------------------------- SOCKS5 tunnels

test('GET through a SOCKS5 proxy', async () => {
  const apiFetch = createProxiedFetch(socks.url, { logger })
  const res = await apiFetch(`${tg.url}/file/botTOKEN/docs/file.txt`)
  assert.equal(await res.text(), 'hello-from-telegram')
})

test('SOCKS5 with username/password', async () => {
  const apiFetch = createProxiedFetch(socksAuth.url, { logger })
  const res = await apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' })
  assert.equal((await res.json()).result.id, 777)
})

test('SOCKS5 rejects wrong credentials', async () => {
  const apiFetch = createProxiedFetch(`socks5://suser:wrong@127.0.0.1:${socksAuth.port}`, { logger })
  await expectReject(
    apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' }),
    /username\/password/,
    'auth failure',
  )
})

test('unreachable SOCKS5 port fails fast', async () => {
  const apiFetch = createProxiedFetch('socks5://127.0.0.1:1', { logger, timeoutMs: 2000 })
  await expectReject(
    apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' }),
    /ECONNREFUSED|connect/i,
    'connection refused',
  )
})

// ------------------------------------------------- environment, bypass, aborts

test('proxy can come from the environment', async () => {
  const apiFetch = createProxiedFetch('', { logger, env: { ...process.env, TELEGRAM_PROXY: socks.url } })
  const res = await apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' })
  assert.equal(res.status, 200)
})

test('NO_PROXY bypasses the tunnel', async () => {
  const before = connectProxy.connections.length
  const apiFetch = createProxiedFetch(connectProxy.url, { logger, env: { ...process.env, NO_PROXY: 'localhost' } })
  const res = await apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}' })
  assert.equal(res.status, 200)
  assert.equal(connectProxy.connections.length, before)
})

test('abort during tunnel establishment rejects instead of hanging', async () => {
  const apiFetch = createProxiedFetch(slowProxy.url, { logger, timeoutMs: 5000 })
  await expectReject(
    apiFetch(`${tg.url}/botTOKEN/getMe`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(100) }),
    /timeout|abort/i,
    'abort while establishing the tunnel',
  )
})

// ------------------------------------------------------------ TelegramAdapter

test('adapter.call() goes through the proxy', async () => {
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', apiRoot: tg.url, proxyUrl: connectProxy.url, logger })
  const me = await adapter.call('getMe')
  assert.equal(me.username, 'mock_bot')
  assert.equal(adapter.proxy.active, true)
  assert.notEqual(adapter.apiFetch, fetch)
})

test('adapter.probeHealth() reports the proxy label', async () => {
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', apiRoot: tg.url, proxyUrl: socks.url, logger })
  const health = await adapter.probeHealth(5000)
  assert.equal(health.ok, true)
  assert.match(health.proxy, /^socks5:\/\//)
})

test('adapter downloads files through the proxy', async () => {
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', apiRoot: tg.url, proxyUrl: connectProxy.url, logger })
  const file = await adapter.getFile('F1')
  assert.equal(file.file_path, 'docs/file.txt')
  const bytes = await adapter.downloadFile(file.file_path)
  assert.equal(Buffer.from(bytes).toString('utf8'), 'hello-from-telegram')
})

test('adapter multipart send through the proxy', async () => {
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', apiRoot: tg.url, proxyUrl: connectProxy.url, logger })
  const result = await adapter.sendMedia(1, {
    bytes: Buffer.from('MARKER-42'), kind: 'document', name: 'note.txt', mime: 'text/plain',
  })
  assert.equal(result.multipart, true)
  assert.equal(result.payload_contains_marker, true)
})

test('a broken proxy URL keeps the adapter usable and logs the error', () => {
  const errors = []
  const adapter = new TelegramAdapter({
    botToken: 'TOKEN', apiRoot: tg.url, proxyUrl: 'ftp://nope:21',
    logger: { ...logger, error: (message) => errors.push(String(message)) },
  })
  assert.equal(adapter.proxy.active, false)
  assert.equal(adapter.apiFetch, fetch)
  assert.ok(errors.some((message) => /proxy is invalid/.test(message)))
})
