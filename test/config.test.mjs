import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginConfig, plainConfig, resolveInternalBaseUrl } from '../lib/config.js'
import { Gateway } from '../lib/gateway.js'

test('Issue #124: PluginConfig schema defines defaultLocale with fallback to en', () => {
  const defaults = PluginConfig({})
  assert.equal(defaults.defaultLocale, 'en')

  const customZh = PluginConfig({ defaultLocale: 'zh' })
  assert.equal(customZh.defaultLocale, 'zh')

  const unwrapped = plainConfig(customZh)
  assert.equal(unwrapped.defaultLocale, 'zh')
})

test('Issue #137: internalBaseURL defaults to empty in schema to enable dynamic resolution', () => {
  const defaults = plainConfig(PluginConfig({}))
  assert.equal(defaults.internalBaseURL, '')

  const explicit = plainConfig(PluginConfig({ internalBaseURL: 'http://custom-host:9999' }))
  assert.equal(explicit.internalBaseURL, 'http://custom-host:9999')

  // resolveInternalBaseUrl also safely unwraps volatile boxes directly
  const volatileBoxCfg = PluginConfig({})
  assert.equal(resolveInternalBaseUrl(volatileBoxCfg, { webServer: { port: 52000 } }), 'http://127.0.0.1:52000')
})

test('Issue #137: resolveInternalBaseUrl dynamically discovers webServer port in Desktop mode', () => {
  // Case 1: webServer.port (integer)
  const ctxDirectPort = { webServer: { port: 54321 } }
  assert.equal(resolveInternalBaseUrl({}, ctxDirectPort), 'http://127.0.0.1:54321')

  // Case 2: webServer.address().port
  const ctxAddressPort = { webServer: { address: () => ({ port: 49152 }) } }
  assert.equal(resolveInternalBaseUrl({}, ctxAddressPort), 'http://127.0.0.1:49152')

  // Case 3: ctx.get('webServer') service
  const ctxGetService = { get: (name) => (name === 'webServer' ? { port: 51234 } : null) }
  assert.equal(resolveInternalBaseUrl({}, ctxGetService), 'http://127.0.0.1:51234')

  // Case 4: explicit internalBaseURL takes precedence
  const explicitCfg = { internalBaseURL: 'http://proxy.local:8080' }
  assert.equal(resolveInternalBaseUrl(explicitCfg, ctxDirectPort), 'http://proxy.local:8080')

  // Case 5: fallback to 3080 when webServer has no valid port
  assert.equal(resolveInternalBaseUrl({}, null), 'http://127.0.0.1:3080')
  assert.equal(resolveInternalBaseUrl({}, {}), 'http://127.0.0.1:3080')
  assert.equal(resolveInternalBaseUrl({}, { webServer: { port: 0 } }), 'http://127.0.0.1:3080')
})

test('Issue #137: Gateway.prototype.baseUrl resolves dynamic webServer port in Desktop mode', () => {
  const mockCtxDesktop = {
    webServer: { port: 58888 },
    logger: { debug: () => {}, warn: () => {}, info: () => {} },
  }
  const gwDesktop = new Gateway(mockCtxDesktop, { internalBaseURL: '' })
  assert.equal(gwDesktop.baseUrl(), 'http://127.0.0.1:58888')

  const mockCtxDefault = {
    logger: { debug: () => {}, warn: () => {}, info: () => {} },
  }
  const gwDefault = new Gateway(mockCtxDefault, { internalBaseURL: '' })
  assert.equal(gwDefault.baseUrl(), 'http://127.0.0.1:3080')
})

