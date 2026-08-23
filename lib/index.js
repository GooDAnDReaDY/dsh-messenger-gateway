import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Gateway } from './gateway.js'
import { readBody, writeJson, isTrustedSettingsRequest } from './http.js'

export const name = 'dsh-messenger-gateway'
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'loader', 'settings', 'webServer']
export const SETTINGS_NAMESPACE = settingsNamespace('dsh-messenger-gateway')

export const Config = z.object({
  enabled: z.boolean().default(true),
  telegram: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().role('secret').default(''),
    allowedUserIds: z.array(z.number()).default([]),
    pollTimeoutSeconds: z.number().default(50),
  }),
  agent: z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
    cwd: z.string().default(''),
    instructionPrefix: z.string().default(''),
    maxMessageLength: z.number().default(4000),
    idleTimeoutMs: z.number().default(3_600_000),
  }),
})

function publicConfig(cfg) {
  return {
    enabled: cfg.enabled,
    telegram: {
      enabled: cfg.telegram.enabled,
      allowedUserIds: cfg.telegram.allowedUserIds,
      pollTimeoutSeconds: cfg.telegram.pollTimeoutSeconds,
      botTokenConfigured: Boolean(String(cfg.telegram.botToken || '').trim()),
    },
    agent: { ...cfg.agent },
  }
}

export function apply(ctx, config) {
  const entry = Config(structuredClone(config || {}))
  let gateway
  let source = () => entry
  let settingsApi

  const sync = () => {
    if (gateway) { gateway.stop(); gateway = undefined }
    const effective = source()
    if (effective.enabled === false) return
    gateway = new Gateway(ctx, effective)
    gateway.start().catch((err) => ctx.logger?.warn?.(`dsh-messenger-gateway: ${err.message}`))
  }

  if (ctx.settings?.register) {
    settingsApi = ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: entry })
    source = () => Config(settingsApi.get() ?? entry)
    ctx.effect(() => settingsApi.watch(sync), 'dsh-messenger-gateway: settings')
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      writeJson(res, 200, { ok: true, running: Boolean(gateway), adapters: gateway?.messenger.adapters() || [], activeChats: gateway?.messenger.activeChats() || 0, config: publicConfig(source()) })
    },
  }), 'dsh-messenger-gateway: status')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/config',
    handler: async (req, res) => {
      if (req.method === 'GET') return writeJson(res, 200, { ok: true, config: publicConfig(source()) })
      if (req.method !== 'PUT') return writeJson(res, 405, { ok: false, error: 'GET or PUT' })
      if (!isTrustedSettingsRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      if (!settingsApi) return writeJson(res, 503, { ok: false, error: 'settings not ready' })
      let payload
      try { payload = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { return writeJson(res, 400, { ok: false, error: 'invalid json' }) }
      if (payload && typeof payload.config === 'object') payload = payload.config
      try {
        const parsed = Config({ ...source(), ...payload })
        await settingsApi.replace(parsed)
        sync()
        writeJson(res, 200, { ok: true, config: publicConfig(source()) })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: config')

  ctx.on('dispose', () => { if (gateway) gateway.stop() })
  sync()
}
