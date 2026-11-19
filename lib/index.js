import { Gateway } from './gateway.js'
import { readJsonSafe, registerMessengerRoute, setupHttpRoutes } from './routes.js'
import { writeJson, timingSafeCompare } from './http.js'
import { createMessengerService } from './messenger-api.js'
import { Config, plainConfig, transportSignatureOf } from './config.js'
import { resolveConfig, publicConfig } from './config-projection.js'
import { setupNotifyBridge } from './notify-bridge.js'
import { readSecrets, restoreSecrets } from './secret-guard.js'
import { setupSettings } from './settings-bridge.js'
import { createPersistHooks } from './persist-hooks.js'
import { registerMessengerAskTool } from './tools.js'
export { plainConfig } from './config.js'
export { Config, resolveConfig, publicConfig }
export { registerMessengerRoute }


export const name = '@goodandready/dsh-messenger-gateway'
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'loader', 'settings', 'webServer', 'attachments', 'tools']

export const SETTINGS_NAMESPACE = 'dsh-messenger-gateway'

export function apply(ctx, config) {
  const entry = resolveConfig(structuredClone(plainConfig(config || {})))
  let gateway
  let source = () => entry
  let settingsApi
  const getWebServer = () => ctx.get?.('webServer') || ctx.webServer

  // Single guarded route registration (#230): a profile without a webServer
  // must not crash plugin load — routes are skipped with a warning instead.
  const registerRoute = (registration) => {
    const ws = getWebServer()
    if (!ws?.register) {
      ctx.logger?.warn?.('dsh-messenger-gateway: webServer service unavailable — HTTP routes are skipped')
      return () => {}
    }
    return ws.register(registration)
  }

  // Secrets (botToken etc.) are never sent to the browser, while the settings
  // card saves whole sections — without this guard every save (e.g. a proxy
  // change) would wipe the token with an empty value. See lib/secret-guard.js.
  let knownSecrets
  const guardSecrets = async (cfg) => {
    const current = readSecrets(cfg)
    if (knownSecrets === undefined) {
      knownSecrets = current
      return
    }
    const { config: fixed, restored } = restoreSecrets(knownSecrets, cfg)
    if (!restored.length) {
      knownSecrets = current
      return
    }
    knownSecrets = readSecrets(fixed)
    ctx.logger?.warn?.(`dsh-messenger-gateway: settings write cleared secret fields (${restored.join(', ')}); restoring the previous values`)
    try {
      await settingsApi.replace(Config(fixed))
    } catch (err) {
      ctx.logger?.warn?.(`dsh-messenger-gateway: could not restore secret fields: ${err?.message || err}`)
    }
  }

  let webhookRouteDispose = null
  let currentWebhookPath = ''

  const webhookPath = () => {
    const p = String(source().telegram?.webhookPath || '').trim()
    return p || '/dsh-messenger-gateway/telegram/webhook'
  }

  const syncWebhookRoute = () => {
    const targetPath = webhookPath()
    if (targetPath === currentWebhookPath && webhookRouteDispose) return
    if (typeof webhookRouteDispose === 'function') {
      try { webhookRouteDispose() } catch (e) { /* ignore */ }
      webhookRouteDispose = null
    }
    currentWebhookPath = targetPath
    const ws = getWebServer()
    if (!ws?.register) return
    webhookRouteDispose = ws.register({
      kind: 'exact',
      path: targetPath,
      handler: async (req, res) => {
        if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
        const cfg = source().telegram || {}
        if (cfg.transport !== 'webhook') return writeJson(res, 404, { ok: false, error: 'webhook transport disabled' })
        const secret = String(cfg.webhookSecret || '').trim()
        if (!secret) {
          return writeJson(res, 403, { ok: false, error: 'webhook secret not configured' })
        }
        const hdr = String(req.headers['x-telegram-bot-api-secret-token'] || '')
        if (!timingSafeCompare(hdr, secret)) {
          return writeJson(res, 403, { ok: false, error: 'bad secret' })
        }
        const gw = getGw()
        const adapter = gw?.getAdapter?.('telegram')
        if (!adapter?.handleWebhookUpdate) return writeJson(res, 503, { ok: false, error: 'telegram adapter unavailable' })
        const parsed = await readJsonSafe(req, res, 2_097_152)
        if (!parsed.ok) return
        const update = parsed.data
        try {
          await adapter.handleWebhookUpdate(update)
          writeJson(res, 200, { ok: true })
        } catch (err) {
          writeJson(res, 500, { ok: false, error: err.message })
        }
      },
    })
  }

  // Gateway hooks are static: they read the CURRENT config at execution time
  // through the settings writer mutex, so they can be created once (#224).
  const gatewayHooks = createPersistHooks({ getSource: () => source(), settingsApi })
  let lastSyncSignature
  let lastTransportSignature
  let syncChain = Promise.resolve()
  const startGateway = (cfg) => {
    gateway = new Gateway(ctx, cfg, gatewayHooks)
    gateway.start().catch((err) => ctx.logger?.warn?.(`dsh-messenger-gateway: ${err.message}`))
  }
  const sync = () => {
    syncWebhookRoute()
    const effective = source()
    // DSH sends several events for one settings write; skip identical repeats.
    let signature
    try { signature = JSON.stringify(effective) } catch { signature = undefined }
    if (gateway && signature !== undefined && signature === lastSyncSignature) return
    lastSyncSignature = signature
    guardSecrets(effective).catch((err) => ctx.logger?.warn?.(`dsh-messenger-gateway: secret guard failed: ${err?.message || err}`))
    // Granular apply (#224): when the transport-critical slice is unchanged,
    // swap the config on the LIVE gateway instead of tearing it down.
    const transportSig = transportSignatureOf(effective)
    if (gateway && transportSig === lastTransportSignature) {
      gateway.applyConfig(effective)
      return
    }
    lastTransportSignature = transportSig
    if (effective.enabled === false) {
      // Serialize even the shutdown path so it cannot interleave with a
      // queued restart (#224).
      const run = syncChain.then(async () => {
        if (gateway) { await gateway.stop(); gateway = undefined }
      })
      syncChain = run.catch((err) => { ctx.logger?.debug?.('dsh-messenger-gateway: sync stop error:', err?.message || err) })
      return
    }
    // Serialize gateway recreation: concurrent sync events queue their
    // stop()/start() cycles instead of racing (#224). The queued run reads
    // source() at execution time, so the last config always wins.
    const run = syncChain.then(async () => {
      const cfg = source()
      if (gateway) { await gateway.stop(); gateway = undefined }
      startGateway(cfg)
    })
    syncChain = run.catch((err) => { ctx.logger?.debug?.('dsh-messenger-gateway: sync restart error:', err?.message || err) })
    return run
  }

  const settingsBridge = setupSettings(ctx, {
    namespace: SETTINGS_NAMESPACE,
    Config,
    resolveConfig,
    baseConfig: config,
    sync,
    logger: ctx.logger,
  })
  source = () => settingsBridge.getSource()
  settingsApi = {
    get: () => settingsBridge.getSettingsApi()?.get(),
    replace: (next) => {
      const api = settingsBridge.getSettingsApi()
      if (!api) throw new Error('settings not ready')
      return api.replace(next)
    },
    update: (patch) => {
      const api = settingsBridge.getSettingsApi()
      if (!api) throw new Error('settings not ready')
      return api.update(patch)
    },
    writeExclusive: (fn) => {
      const api = settingsBridge.getSettingsApi()
      if (!api) throw new Error('settings not ready')
      return api.writeExclusive(fn)
    },
    isReady: () => Boolean(settingsBridge.getSettingsApi()),
  }

  // getGw resolves the LIVE gateway for route handlers and the notify bridge.
  // The ctx.get fallback never fires in production (no service registers that
  // name — the plugin provides `messenger`); it exists as an explicit
  // integration seam for embedding hosts and tests. After dispose the closure
  // variable is cleared (#230), and the fallback returns nothing in a real
  // host, so a stopped gateway is never handed out.
  const getGw = () => gateway || ctx.get?.('messenger-gateway')

  ctx.effect(() => ctx.provide('messenger', createMessengerService(getGw)), 'dsh-messenger-gateway: messenger service')

  // Agent tool: inline buttons in the telegram chat bound to this msgw session (#233).
  registerMessengerAskTool(ctx, { getGw })

  // Dynamic skills sync
  ctx.effect(() => {
    const onSkillsChange = () => {
      const gw = getGw()
      if (gw) gw.syncTelegramCommands().catch((err) => ctx.logger?.debug?.(`sync telegram commands on skills change: ${err?.message || err}`))
    }
    const unbinds = [
      ctx.on('tools/change', onSkillsChange),
      ctx.on('tools/update', onSkillsChange),
      ctx.on('tools/updated', onSkillsChange),
      ctx.on('skills/change', onSkillsChange),
      ctx.on('skills/updated', onSkillsChange),
      ctx.on('skills/update', onSkillsChange),
    ]
    return () => {
      for (const un of unbinds) {
        if (typeof un === 'function') un()
      }
    }
  }, 'dsh-messenger-gateway: dynamic skills sync')

  // Notify -> Telegram home bridge for non-messenger sessions (#187):
  // handler extracted to lib/notify-bridge.js (#233).
  setupNotifyBridge(ctx, { getSource: () => source(), getGw })

  // HTTP surface: admin routes, messenger API, webapp dashboard and the
  // plugin updater extracted to lib/routes.js (#233).
  setupHttpRoutes(ctx, { registerRoute, getGw, getSource: () => source(), settingsApi, sync, getWebServer })

  ctx.effect(() => () => {
    if (typeof webhookRouteDispose === 'function') {
      try { webhookRouteDispose() } catch (e) { void e }
      webhookRouteDispose = null
    }
  }, 'dsh-messenger-gateway: telegram webhook')

  // Registering the teardown as an effect makes the old gateway stop when the
  // plugin is reloaded or disposed (#230).
  ctx.effect(() => () => {
    try {
      if (gateway) gateway.stop()
    } catch (err) {
      ctx.logger?.warn?.(`[dsh-messenger-gateway] gateway stop on dispose failed: ${err?.message || err}`)
    } finally {
      // getGw() must not hand out a stopped gateway after dispose (#230).
      gateway = undefined
    }
    if (typeof webhookRouteDispose === 'function') webhookRouteDispose()
  }, 'dsh-messenger-gateway: stop gateway')
  sync()
}
