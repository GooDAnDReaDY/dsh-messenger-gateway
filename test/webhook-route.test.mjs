import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('Issue #129: webhookPath updates dynamically without restarting DSH', () => {
  const registeredRoutes = new Map()

  const fakeWebServer = {
    register: (route) => {
      registeredRoutes.set(route.path, route)
      return () => {
        registeredRoutes.delete(route.path)
      }
    },
  }

  const listeners = new Map()
  let settingsConfig = null
  let settingsSync = null

  const fakeCtx = {
    webServer: fakeWebServer,
    get: (name) => {
      if (name === 'webServer') return fakeWebServer
      if (name === 'settings') {
        return {
          describe: () => {},
          configure: (schema, cb) => {},
          replace: (next) => {},
        }
      }
      return null
    },
    on: (ev, cb) => {
      listeners.set(ev, cb)
      return () => listeners.delete(ev)
    },
    effect: (fn) => {
      const res = fn()
      return typeof res === 'function' ? res : () => {}
    },
    provide: () => {},
    agents: { get: () => null },
    sessions: {},
    tools: { register: () => {} },
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }

  const initialCfg = {
    enabled: true,
    telegram: {
      enabled: true,
      transport: 'webhook',
      webhookPath: '/dsh-messenger-gateway/telegram/webhook',
      webhookSecret: 'secret-1',
    },
  }

  apply(fakeCtx, initialCfg)

  // Initial path should be registered
  assert.ok(registeredRoutes.has('/dsh-messenger-gateway/telegram/webhook'))

  // Simulate updating settings: change webhookPath to /custom/path
  const updateEvent = listeners.get('internal/update')
  assert.ok(typeof updateEvent === 'function', 'update event handler must be registered')

  // Update volatile / live config
  const updatedCfg = {
    ...initialCfg,
    telegram: {
      ...initialCfg.telegram,
      webhookPath: '/custom/path',
    },
  }

  updateEvent(updatedCfg)

  // Old route should be un-registered, new route should be active
  assert.equal(registeredRoutes.has('/dsh-messenger-gateway/telegram/webhook'), false, 'old route must be unregistered')
  assert.ok(registeredRoutes.has('/custom/path'), 'new route must be registered')
})

test('Issue #143: GET /status and GET /config require isTrustedSettingsRequest (WAN rejected with 403, LAN/loopback accepted)', async () => {
  const registeredRoutes = new Map()
  const fakeWebServer = {
    register: (route) => {
      registeredRoutes.set(route.path, route)
      return () => registeredRoutes.delete(route.path)
    },
  }

  const fakeCtx = {
    webServer: fakeWebServer,
    get: (name) => (name === 'webServer' ? fakeWebServer : null),
    on: () => () => {},
    effect: (fn) => {
      const res = fn()
      return typeof res === 'function' ? res : () => {}
    },
    provide: () => {},
    agents: { get: () => null },
    sessions: {},
    tools: { register: () => {} },
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }

  apply(fakeCtx, { enabled: true, telegram: { enabled: false } })

  function createMockRes() {
    let status = 200
    let body = ''
    return {
      get statusCode() { return status },
      set statusCode(val) { status = val },
      setHeader: () => {},
      end: (chunk) => { body = chunk },
      json: () => JSON.parse(body || '{}'),
    }
  }

  const statusRoute = registeredRoutes.get('/dsh-messenger-gateway/status')
  const configRoute = registeredRoutes.get('/dsh-messenger-gateway/config')
  assert.ok(statusRoute, 'status route must be registered')
  assert.ok(configRoute, 'config route must be registered')

  // 1. External WAN client without secret -> 403 forbidden on GET /status
  {
    const res = createMockRes()
    await statusRoute.handler({
      method: 'GET',
      headers: { host: '192.168.1.111:3080' },
      socket: { remoteAddress: '203.0.113.10' },
    }, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.json().error, 'forbidden')
  }

  // 2. External WAN client without secret -> 403 forbidden on GET /config
  {
    const res = createMockRes()
    await configRoute.handler({
      method: 'GET',
      headers: { host: '192.168.1.111:3080' },
      socket: { remoteAddress: '203.0.113.10' },
    }, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.json().error, 'forbidden')
  }

  // 3. LAN browser with matching Origin -> 200 ok on GET /status
  {
    const res = createMockRes()
    await statusRoute.handler({
      method: 'GET',
      headers: { host: '192.168.1.111:3080', origin: 'http://192.168.1.111:3080' },
      socket: { remoteAddress: '192.168.1.50' },
    }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().ok, true)
  }

  // 4. LAN browser with matching Origin -> 200 ok on GET /config
  {
    const res = createMockRes()
    await configRoute.handler({
      method: 'GET',
      headers: { host: '192.168.1.111:3080', origin: 'http://192.168.1.111:3080' },
      socket: { remoteAddress: '192.168.1.50' },
    }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().ok, true)
    assert.ok(res.json().config)
  }

  // 5. Loopback request -> 200 ok on GET /status and GET /config
  {
    const resStatus = createMockRes()
    await statusRoute.handler({
      method: 'GET',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
    }, resStatus)
    assert.equal(resStatus.statusCode, 200)
    assert.equal(resStatus.json().ok, true)

    const resConfig = createMockRes()
    await configRoute.handler({
      method: 'GET',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
    }, resConfig)
    assert.equal(resConfig.statusCode, 200)
    assert.equal(resConfig.json().ok, true)
  }
})
