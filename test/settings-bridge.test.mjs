import test from 'node:test'
import assert from 'node:assert/strict'
import { setupSettings } from '../lib/settings-bridge.js'

const mockConfig = (c) => ({ ...c })

test('Issue #101: setupSettings supports legacy settings.register', async () => {
  let registeredNamespace = null
  let watchCalled = false
  const fakeRegisterScope = {
    get: () => ({ enabled: true, telegram: { botToken: 'test-token' } }),
    replace: async (next) => next,
    watch: (cb) => { watchCalled = true },
  }
  const fakeCtx = {
    settings: {
      register: (ns, cfgFn, opts) => {
        registeredNamespace = ns
        return fakeRegisterScope
      },
    },
    effect: (fn) => fn(),
  }

  let syncCount = 0
  const bridge = setupSettings(fakeCtx, {
    namespace: 'dsh-messenger-gateway',
    Config: mockConfig,
    resolveConfig: (c) => c,
    baseConfig: {},
    sync: () => { syncCount++ },
  })

  assert.equal(registeredNamespace, 'dsh-messenger-gateway')
  assert.equal(watchCalled, true)
  assert.equal(bridge.getSettingsApi()?.get()?.telegram?.botToken, 'test-token')
})

test('Issue #101: setupSettings supports DSH 0.1.7 configure, describe, replace contract', async () => {
  let configuredAuto = null
  let replacedNs = null
  let replacedValue = null
  let replacedRev = null
  let syncCount = 0

  const storedValue = {
    enabled: true,
    telegram: { botToken: 'dsh-0.1.7-token' },
  }

  let docUpdatedHandler = null

  const fakeCtx = {
    fiber: { id: 'fiber-1' },
    settings: {
      configure: (opts, fiber) => {
        configuredAuto = opts.auto
      },
      describe: () => [
        { ns: 'dsh-messenger-gateway', revision: 'rev-42', value: storedValue },
      ],
      replace: async (ns, val, rev) => {
        replacedNs = ns
        replacedValue = val
        replacedRev = rev
      },
    },
    on: (evt, handler) => {
      if (evt === 'settings/document-updated') {
        docUpdatedHandler = handler
      }
    },
    effect: (fn) => fn(),
  }

  const bridge = setupSettings(fakeCtx, {
    namespace: 'dsh-messenger-gateway',
    Config: mockConfig,
    resolveConfig: (c) => c,
    baseConfig: {},
    sync: () => { syncCount++ },
  })

  assert.equal(configuredAuto, false)
  const api = bridge.getSettingsApi()
  assert.ok(api, 'settingsApi must be provided')
  assert.equal(api.get()?.telegram?.botToken, 'dsh-0.1.7-token')

  // Test persistence via replace
  await api.replace({
    ...storedValue,
    telegram: { botToken: 'updated-token' },
  })

  assert.equal(replacedNs, 'dsh-messenger-gateway')
  assert.equal(replacedRev, 'rev-42')
  assert.equal(replacedValue.telegram?.botToken, 'updated-token')
  assert.equal(api.get()?.telegram?.botToken, 'updated-token')
  assert.equal(syncCount, 1)

  // Test document update event from DSH core
  storedValue.telegram.botToken = 'core-updated-token'
  docUpdatedHandler?.('dsh-messenger-gateway')
  assert.equal(api.get()?.telegram?.botToken, 'core-updated-token')
  assert.equal(syncCount, 2)
})

test('Issue #106: setupSettings subscribes to volatile and internal config update events', () => {
  const events = new Map()
  let syncCount = 0
  let watchedValue = null

  const liveConfig = { enabled: true, internalBaseURL: 'http://127.0.0.1:3080' }
  const fakeCtx = {
    fiber: { config: liveConfig },
    on: (evt, handler) => {
      events.set(evt, handler)
      return () => events.delete(evt)
    },
    effect: (fn) => fn(),
  }

  const bridge = setupSettings(fakeCtx, {
    namespace: 'dsh-messenger-gateway',
    Config: mockConfig,
    resolveConfig: (c) => ({ ...c }),
    baseConfig: liveConfig,
    sync: () => { syncCount++ },
  })

  const api = bridge.getSettingsApi()
  // Subscribe watcher
  bridge.getSettingsApi?.()?.watch?.((c) => { watchedValue = c })

  assert.ok(events.has('loader/volatile-update'), 'must listen for loader/volatile-update')
  assert.ok(events.has('internal/update'), 'must listen for internal/update')
  assert.ok(events.has('app-boot/config-reload'), 'must listen for app-boot/config-reload')

  // Trigger loader/volatile-update
  liveConfig.enabled = false
  events.get('loader/volatile-update')()
  assert.equal(bridge.getSource().enabled, false)
  assert.equal(syncCount, 1)

  // Trigger internal/update with next config
  events.get('internal/update')({ enabled: true, internalBaseURL: 'http://127.0.0.1:9999' })
  assert.equal(bridge.getSource().enabled, true)
  assert.equal(bridge.getSource().internalBaseURL, 'http://127.0.0.1:9999')
  assert.equal(syncCount, 2)
})

test('Issue #111: persist unwraps Volatile boxes before passing payload to settings service', async () => {
  let replacedPayload = null
  const fakeService = {
    describe: () => [{ ns: 'dsh-messenger-gateway', revision: '1', value: { enabled: true } }],
    replace: async (ns, payload, rev) => {
      replacedPayload = payload
    },
  }
  const fakeCtx = {
    settings: fakeService,
  }

  // Simulate a resolveConfig that unwraps volatile boxes (object with get() function)
  const resolveConfigWithUnwrap = (raw) => {
    const unwrap = (val) => {
      if (val && typeof val.get === 'function') return val.get()
      return val
    }
    return {
      enabled: unwrap(raw.enabled),
      internalBaseURL: unwrap(raw.internalBaseURL),
    }
  }

  const bridge = setupSettings(fakeCtx, {
    namespace: 'dsh-messenger-gateway',
    Config: (c) => c,
    resolveConfig: resolveConfigWithUnwrap,
    baseConfig: { enabled: true, internalBaseURL: 'http://127.0.0.1:3080' },
    sync: () => {},
  })

  // Next config contains volatile boxes
  const volatileBox = { get: () => false }
  await bridge.getSettingsApi().replace({
    enabled: volatileBox,
    internalBaseURL: 'http://127.0.0.1:3080',
  })

  assert.equal(typeof replacedPayload.enabled, 'boolean', 'persisted enabled must be unwrapped boolean, not box object')
  assert.equal(replacedPayload.enabled, false)
})

