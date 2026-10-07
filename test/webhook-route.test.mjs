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
