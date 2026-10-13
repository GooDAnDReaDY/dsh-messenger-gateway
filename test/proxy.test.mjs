import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProxyUrl, normalizeApiRoot, createTelegramDispatcher } from '../lib/proxy.js'
import { TelegramAdapter } from '../lib/adapters/telegram.js'
import { probeTelegramHealth } from '../lib/adapters/telegram-inbound.js'
import createAdapters from '../lib/adapters/index.js'
import { PluginConfig, plainConfig } from '../lib/config.js'

test('normalizeProxyUrl validates protocols and handles empty input', () => {
  assert.equal(normalizeProxyUrl(''), '')
  assert.equal(normalizeProxyUrl(null), '')
  assert.equal(normalizeProxyUrl(undefined), '')
  assert.equal(normalizeProxyUrl('   '), '')

  assert.equal(normalizeProxyUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080/')
  assert.equal(normalizeProxyUrl('https://proxy.example.com:443'), 'https://proxy.example.com/')
  assert.equal(normalizeProxyUrl('https://proxy.example.com:8443'), 'https://proxy.example.com:8443/')
  assert.equal(normalizeProxyUrl('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080')
  assert.equal(normalizeProxyUrl('socks5h://127.0.0.1:1080'), 'socks5h://127.0.0.1:1080')
  assert.equal(normalizeProxyUrl('socks://127.0.0.1:1080'), 'socks://127.0.0.1:1080')

  assert.throws(() => normalizeProxyUrl('ftp://127.0.0.1:21'), /Unsupported proxy protocol/)
  assert.throws(() => normalizeProxyUrl('not-a-valid-url'), /Invalid proxy URL/)
})

test('normalizeApiRoot strips trailing slashes and validates protocol', () => {
  assert.equal(normalizeApiRoot(''), 'https://api.telegram.org')
  assert.equal(normalizeApiRoot(null), 'https://api.telegram.org')
  assert.equal(normalizeApiRoot(undefined), 'https://api.telegram.org')
  assert.equal(normalizeApiRoot('   '), 'https://api.telegram.org')

  assert.equal(normalizeApiRoot('https://api.telegram.org/'), 'https://api.telegram.org')
  assert.equal(normalizeApiRoot('https://api.telegram.org///'), 'https://api.telegram.org')
  assert.equal(normalizeApiRoot('http://127.0.0.1:8081/'), 'http://127.0.0.1:8081')
  assert.equal(normalizeApiRoot('https://tg-proxy.my-domain.org/bot-api'), 'https://tg-proxy.my-domain.org/bot-api')

  assert.throws(() => normalizeApiRoot('ftp://127.0.0.1:8081'), /Unsupported apiRoot protocol/)
  assert.throws(() => normalizeApiRoot('invalid-url-string'), /Invalid apiRoot URL/)
})

test('createTelegramDispatcher returns null when proxyUrl is empty', () => {
  assert.equal(createTelegramDispatcher(''), null)
  assert.equal(createTelegramDispatcher(null), null)
})

test('createTelegramDispatcher creates ProxyAgent for http and socks5 proxies', () => {
  const httpAgent = createTelegramDispatcher('http://127.0.0.1:8080')
  assert.ok(httpAgent, 'ProxyAgent created for http proxy')
  assert.equal(typeof httpAgent.dispatch, 'function')
  httpAgent.close?.()

  const socksAgent = createTelegramDispatcher('socks5://127.0.0.1:1080')
  assert.ok(socksAgent, 'ProxyAgent created for socks5 proxy')
  assert.equal(typeof socksAgent.dispatch, 'function')
  socksAgent.close?.()
})

test('TelegramAdapter initializes defaults with standard apiRoot and null dispatcher', () => {
  const adapter = new TelegramAdapter({ botToken: 'mock-token' })
  assert.equal(adapter.apiRoot, 'https://api.telegram.org')
  assert.equal(adapter.proxyUrl, '')
  assert.equal(adapter.dispatcher, null)
  assert.equal(adapter.ownDispatcher, null)
  adapter.stop()
})

test('TelegramAdapter initializes with custom apiRoot and proxyUrl dispatcher', () => {
  const adapter = new TelegramAdapter({
    botToken: 'mock-token',
    apiRoot: 'http://127.0.0.1:8081///',
    proxyUrl: 'socks5://127.0.0.1:1080',
  })
  assert.equal(adapter.apiRoot, 'http://127.0.0.1:8081')
  assert.equal(adapter.proxyUrl, 'socks5://127.0.0.1:1080')
  assert.ok(adapter.dispatcher, 'dispatcher initialized')
  assert.ok(adapter.ownDispatcher, 'ownDispatcher tracked for cleanup')
  adapter.stop()
})

test('TelegramAdapter accepts explicit external dispatcher without ownDispatcher cleanup', () => {
  const mockDispatcher = { dispatch: () => {} }
  const adapter = new TelegramAdapter({
    botToken: 'mock-token',
    dispatcher: mockDispatcher,
  })
  assert.equal(adapter.dispatcher, mockDispatcher)
  assert.equal(adapter.ownDispatcher, null)
  adapter.stop()
})

test('TelegramAdapter.call routes through custom apiRoot and includes dispatcher in fetch', async () => {
  const origFetch = globalThis.fetch
  const mockCalls = []
  globalThis.fetch = async (url, opts) => {
    mockCalls.push({ url, opts })
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    }
  }

  try {
    const mockDispatcher = { dispatch: () => {} }
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      apiRoot: 'http://127.0.0.1:8081',
      dispatcher: mockDispatcher,
    })

    const res = await adapter.call('sendMessage', { chat_id: 123, text: 'hello' })
    assert.deepEqual(res, { message_id: 42 })
    assert.equal(mockCalls.length, 1)
    assert.equal(mockCalls[0].url, 'http://127.0.0.1:8081/bottest-token/sendMessage')
    assert.equal(mockCalls[0].opts.dispatcher, mockDispatcher)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('TelegramAdapter.callMultipart routes through custom apiRoot and includes dispatcher in fetch', async () => {
  const origFetch = globalThis.fetch
  const mockCalls = []
  globalThis.fetch = async (url, opts) => {
    mockCalls.push({ url, opts })
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 99 } }),
    }
  }

  try {
    const mockDispatcher = { dispatch: () => {} }
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      apiRoot: 'https://custom-tg.internal',
      dispatcher: mockDispatcher,
    })

    const form = new FormData()
    form.append('chat_id', '123')
    const res = await adapter.callMultipart('sendDocument', form)
    assert.deepEqual(res, { message_id: 99 })
    assert.equal(mockCalls.length, 1)
    assert.equal(mockCalls[0].url, 'https://custom-tg.internal/bottest-token/sendDocument')
    assert.equal(mockCalls[0].opts.dispatcher, mockDispatcher)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('TelegramAdapter.downloadFile routes through custom apiRoot and includes dispatcher in fetch', async () => {
  const origFetch = globalThis.fetch
  const mockCalls = []
  globalThis.fetch = async (url, opts) => {
    mockCalls.push({ url, opts })
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }
  }

  try {
    const mockDispatcher = { dispatch: () => {} }
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      apiRoot: 'http://127.0.0.1:8081',
      dispatcher: mockDispatcher,
    })

    const bytes = await adapter.downloadFile('photos/file_0.jpg')
    assert.deepEqual(Array.from(bytes), [1, 2, 3])
    assert.equal(mockCalls.length, 1)
    assert.equal(mockCalls[0].url, 'http://127.0.0.1:8081/file/bottest-token/photos/file_0.jpg')
    assert.equal(mockCalls[0].opts.dispatcher, mockDispatcher)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('probeTelegramHealth routes through custom apiRoot and includes dispatcher in fetch', async () => {
  const origFetch = globalThis.fetch
  const mockCalls = []
  globalThis.fetch = async (url, opts) => {
    mockCalls.push({ url, opts })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { id: 777, username: 'proxied_bot', first_name: 'Proxied' },
      }),
    }
  }

  try {
    const mockDispatcher = { dispatch: () => {} }
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      apiRoot: 'https://custom-tg.example.com',
      dispatcher: mockDispatcher,
    })

    const health = await probeTelegramHealth(adapter, 5000)
    assert.equal(health.ok, true)
    assert.equal(health.botId, 777)
    assert.equal(health.botUsername, 'proxied_bot')
    assert.equal(mockCalls.length, 1)
    assert.equal(mockCalls[0].url, 'https://custom-tg.example.com/bottest-token/getMe')
    assert.equal(mockCalls[0].opts.dispatcher, mockDispatcher)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('createAdapters forwards proxyUrl and apiRoot from config to TelegramAdapter', () => {
  const config = {
    enabled: true,
    telegram: {
      enabled: true,
      botToken: 'adapter-token',
      proxyUrl: 'socks5://127.0.0.1:1080',
      apiRoot: 'http://127.0.0.1:8081',
    },
  }

  const adapters = createAdapters({
    config,
    onMessage: () => {},
    onCallback: () => {},
    onUnauthorized: () => {},
    isUserAllowed: () => true,
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  })

  assert.equal(adapters.length, 1)
  const tg = adapters[0]
  assert.equal(tg.name, 'telegram')
  assert.equal(tg.proxyUrl, 'socks5://127.0.0.1:1080')
  assert.equal(tg.apiRoot, 'http://127.0.0.1:8081')
  assert.ok(tg.dispatcher, 'dispatcher initialized')
  tg.stop()
})

test('PluginConfig parses proxyUrl and apiRoot schema defaults', () => {
  const defaults = plainConfig(PluginConfig({}))
  assert.equal(defaults.telegram.proxyUrl, '')
  assert.equal(defaults.telegram.apiRoot, '')

  const custom = plainConfig(PluginConfig({
    telegram: {
      proxyUrl: 'socks5://127.0.0.1:1080',
      apiRoot: 'http://127.0.0.1:8081',
    },
  }))
  assert.equal(custom.telegram.proxyUrl, 'socks5://127.0.0.1:1080')
  assert.equal(custom.telegram.apiRoot, 'http://127.0.0.1:8081')
})
