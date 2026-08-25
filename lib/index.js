import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Gateway } from './gateway.js'
import { readBody, writeJson, isTrustedSettingsRequest } from './http.js'
import {
  createMessengerService, dispatchMessenger, httpStatusForError,
  messengerApiSchema, parseMessengerBody,
} from './messenger-api.js'

export const name = 'dsh-messenger-gateway'
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'loader', 'settings', 'webServer', 'attachments']

export const SETTINGS_NAMESPACE = settingsNamespace('dsh-messenger-gateway')

import { Config } from './config.js'
export { Config }

function resolveConfig(raw) {
  const cfg = Config(raw)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  if (!cfg.media.cacheDir) {
    cfg.media = { ...cfg.media, cacheDir: join(home, 'messenger-gateway', 'cache') }
  }
  return cfg
}

function publicConfig(cfg) {
  return {
    enabled: cfg.enabled,
    internalBaseURL: cfg.internalBaseURL,
    telegram: {
      enabled: cfg.telegram.enabled,
      allowedUserIds: cfg.telegram.allowedUserIds,
      pollTimeoutSeconds: cfg.telegram.pollTimeoutSeconds,
      pollIntervalMs: cfg.telegram.pollIntervalMs,
      commands: cfg.telegram.commands,
      textFormat: cfg.telegram.textFormat,
      botTokenConfigured: Boolean(String(cfg.telegram.botToken || '').trim()),
    },
    discord: { enabled: cfg.discord.enabled, botTokenConfigured: Boolean(String(cfg.discord.botToken || '').trim()) },
    media: { maxDocBytes: cfg.media.maxDocBytes, maxTextInjectBytes: cfg.media.maxTextInjectBytes, maxImageBytes: cfg.media.maxImageBytes },
    tts: cfg.tts,
    agent: cfg.agent,
  }
}

function registerMessengerRoute(ctx, getGw, path, action) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      let payload
      try {
        payload = parseMessengerBody((await readBody(req)).toString('utf8'))
      } catch (err) {
        return writeJson(res, httpStatusForError(err), { ok: false, error: err.message })
      }
      try {
        const out = await dispatchMessenger(getGw(), action, payload)
        writeJson(res, 200, out)
      } catch (err) {
        writeJson(res, httpStatusForError(err), { ok: false, error: err.message })
      }
    },
  }), `dsh-messenger-gateway: ${action}`)
}

export function apply(ctx, config) {
  const entry = resolveConfig(structuredClone(config || {}))
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
    settingsApi = ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: config || {} })
    source = () => resolveConfig(settingsApi.get() ?? config ?? {})
    ctx.effect(() => settingsApi.watch(sync), 'dsh-messenger-gateway: settings')
  }

  const getGw = () => gateway

  ctx.effect(() => ctx.provide('messenger', createMessengerService(getGw)), 'dsh-messenger-gateway: messenger service')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      const gw = getGw()
      writeJson(res, 200, {
        ok: true,
        running: Boolean(gw),
        adapters: gw?.messenger.adapters() || [],
        activeChats: gw?.messenger.activeChats() || 0,
        ttsEnabled: Boolean(source().tts?.enabled),
        messengerService: 'messenger',
        config: publicConfig(source()),
      })
    },
  }), 'dsh-messenger-gateway: status')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/messenger',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      writeJson(res, 200, { ok: true, schema: messengerApiSchema })
    },
  }), 'dsh-messenger-gateway: messenger schema')

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
        await settingsApi.replace(Config({ ...source(), ...payload }))
        sync()
        writeJson(res, 200, { ok: true, config: publicConfig(source()) })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: config')

  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/send', 'send')
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/progress', 'progress')
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/ask', 'ask')

  ctx.on('dispose', () => { if (gateway) gateway.stop() })
  sync()
}
