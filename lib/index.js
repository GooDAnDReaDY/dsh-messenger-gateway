import { homedir } from 'node:os'
import { join } from 'node:path'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Gateway } from './gateway.js'
import { readBody, writeJson, isTrustedSettingsRequest } from './http.js'
import {
  createMessengerService, dispatchMessenger, httpStatusForError,
  messengerApiSchema, parseMessengerBody,
} from './messenger-api.js'
import { listHomes } from './homes.js'
import { Config } from './config.js'

export const name = 'dsh-messenger-gateway'
export const inject = ['agentDefaultModel', 'agents', 'sessions', 'loader', 'settings', 'webServer', 'attachments', 'tools']

export const SETTINGS_NAMESPACE = settingsNamespace('dsh-messenger-gateway')
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
      homeChatId: cfg.telegram.homeChatId,
      homeThreadId: cfg.telegram.homeThreadId,
      homes: listHomes(cfg.telegram),
      pairingEnabled: cfg.telegram.pairingEnabled,
      streaming: cfg.telegram.streaming,
      progressEnabled: cfg.telegram.progressEnabled,
      approvalsEnabled: cfg.telegram.approvalsEnabled,
      groupsEnabled: cfg.telegram.groupsEnabled,
      groupRequireMention: cfg.telegram.groupRequireMention,
      reactionsEnabled: cfg.telegram.reactionsEnabled,
      transport: cfg.telegram.transport,
      webhookUrl: cfg.telegram.webhookUrl,
      webhookPath: cfg.telegram.webhookPath,
      webhookSecretConfigured: Boolean(String(cfg.telegram.webhookSecret || '').trim()),
      botTokenConfigured: Boolean(String(cfg.telegram.botToken || '').trim()),
      voiceMode: cfg.telegram.voiceMode,
      notifyBridge: {
        enabled: Boolean(cfg.telegram.notifyBridge?.enabled),
        events: cfg.telegram.notifyBridge?.events || ['task_done', 'error'],
        home: cfg.telegram.notifyBridge?.home || 'default',
        excludeSessionPrefixes: cfg.telegram.notifyBridge?.excludeSessionPrefixes || ['msgw-'],
      },
    },
    discord: { enabled: cfg.discord.enabled, botTokenConfigured: Boolean(String(cfg.discord.botToken || '').trim()) },
    media: { maxDocBytes: cfg.media.maxDocBytes, maxTextInjectBytes: cfg.media.maxTextInjectBytes, maxImageBytes: cfg.media.maxImageBytes },
    tts: cfg.tts,
    agent: {
      provider: cfg.agent.provider,
      model: cfg.agent.model,
      photoOnlyMode: cfg.agent.photoOnlyMode,
      maxMessageLength: cfg.agent.maxMessageLength,
      turnTimeoutMs: cfg.agent.turnTimeoutMs,
      idleTimeoutMs: cfg.agent.idleTimeoutMs,
      instructionPrefix: cfg.agent.instructionPrefix,
      sessionScope: cfg.agent.sessionScope,
    },
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

function isExcludedSession(sessionId, prefixes) {
  const sid = String(sessionId || '')
  for (const p of prefixes || []) {
    if (typeof p === 'string' && p.length > 0 && sid.startsWith(p)) return true
  }
  return false
}

export function apply(ctx, config) {
  const entry = resolveConfig(structuredClone(config || {}))
  let gateway
  let source = () => entry
  let settingsApi
  const turnStarts = new Map()

  const sync = () => {
    if (gateway) { gateway.stop(); gateway = undefined }
    const effective = source()
    if (effective.enabled === false) return
    gateway = new Gateway(ctx, effective, {
      persistAllowedUserIds: async (ids) => {
        if (!settingsApi) return
        const cur = source()
        await settingsApi.replace(Config({
          ...cur,
          telegram: { ...cur.telegram, allowedUserIds: ids },
        }))
      },
      persistHome: async ({ chatId, threadId }) => {
        if (!settingsApi) throw new Error('settings not ready')
        const cur = source()
        await settingsApi.replace(Config({
          ...cur,
          telegram: { ...cur.telegram, homeChatId: chatId, homeThreadId: threadId || 0 },
        }))
      },
      persistHomes: async (nextTelegram) => {
        if (!settingsApi) throw new Error('settings not ready')
        const cur = source()
        await settingsApi.replace(Config({
          ...cur,
          telegram: { ...cur.telegram, ...nextTelegram },
        }))
      },
      persistAgentModel: async ({ provider, model }) => {
        if (!settingsApi) return
        const cur = source()
        await settingsApi.replace(Config({
          ...cur,
          agent: { ...cur.agent, provider, model },
        }))
      },
    })
    gateway.start().catch((err) => ctx.logger?.warn?.(`dsh-messenger-gateway: ${err.message}`))
  }

  if (ctx.settings?.register) {
    settingsApi = ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: config || {} })
    source = () => resolveConfig(settingsApi.get() ?? config ?? {})
    ctx.effect(() => settingsApi.watch(sync), 'dsh-messenger-gateway: settings')
  }

  const getGw = () => gateway

  ctx.effect(() => ctx.provide('messenger', createMessengerService(getGw)), 'dsh-messenger-gateway: messenger service')

  // Agent tool: inline buttons in the telegram chat bound to this msgw session
  if (ctx.tools?.register) {
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'messenger_ask',
      description:
        'Ask the Telegram user a multiple-choice question with inline buttons and wait for their choice. '
        + 'Use for confirmations and short choices. Only works inside messenger-gateway sessions (msgw-*).',
      parameters: {
        text: { type: 'string', required: true, description: 'Question text shown in Telegram.' },
        buttons: {
          type: 'array',
          required: true,
          description: 'Rows of buttons: [[{ id, text }, ...], ...]',
        },
        timeoutMs: { type: 'number', required: false, description: 'Wait timeout ms (default 300000).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            buttonId: { type: 'string' },
            data: { type: 'string' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value && value.ok
            ? `User chose: ${value.buttonId}`
            : `messenger_ask failed: ${value && value.error ? value.error : 'unknown'}`,
        }],
      },
      execute: async (args, exec) => {
        const gw = getGw()
        if (!gw) return { ok: false, error: 'gateway not running' }
        try {
          const buttons = args.buttons
          const result = await gw.messengerAskFromAgent(exec.agent, {
            text: String(args.text || ''),
            buttons,
          }, Number(args.timeoutMs) || 300_000)
          return { ok: true, buttonId: result?.buttonId, data: result?.data }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    })), 'dsh-messenger-gateway: messenger_ask tool')
  }

  // Notify → Telegram home bridge (non-msgw sessions only)
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const cfg = source().telegram?.notifyBridge
    if (!cfg?.enabled) return
    if (event.type === 'turn/start') {
      turnStarts.set(String(session.id), Date.now())
      return
    }
    if (event.type !== 'turn/end') return
    const prefixes = cfg.excludeSessionPrefixes || ['msgw-']
    if (isExcludedSession(session.id, prefixes)) return
    const reason = event.data?.reason
    const kind = reason?.kind === 'completed' ? 'task_done' : 'error'
    const events = new Set(cfg.events?.length ? cfg.events : ['task_done', 'error'])
    if (!events.has(kind)) return
    const gw = getGw()
    if (!gw) return
    const started = turnStarts.get(String(session.id))
    turnStarts.delete(String(session.id))
    const dur = started ? Math.round((Date.now() - started) / 1000) : null
    const title = kind === 'task_done' ? 'Задача завершена' : 'Ошибка агента'
    const lines = [
      `【${title}】`,
      `session: ${session.id}`,
    ]
    if (dur != null) lines.push(`duration: ${dur}s`)
    if (reason?.kind === 'error') {
      lines.push(`error: ${reason.error?.message || reason.error?.code || 'unknown'}`)
    }
    const homeName = cfg.home || 'default'
    gw.messengerSend({ platform: 'telegram', home: homeName }, { text: lines.join('\n') })
      .catch((e) => ctx.logger?.warn?.(`notify bridge: ${e.message}`))
  }), 'dsh-messenger-gateway: notify bridge')

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
        home: gateway?.messenger.home?.() || null,
        homes: gateway?.messenger.homes?.() || [],
        pairingPending: gw?.messenger.pairingPending?.()?.length || 0,
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
        const cur = source()
        const nextTg = { ...cur.telegram, ...(payload.telegram || {}) }
        if (payload.telegram && !String(payload.telegram.botToken || '').trim()) nextTg.botToken = cur.telegram.botToken
        if (payload.telegram && Object.prototype.hasOwnProperty.call(payload.telegram, 'webhookSecret') && !String(payload.telegram.webhookSecret || '').trim()) {
          nextTg.webhookSecret = cur.telegram.webhookSecret
        }
        if (payload.telegram?.notifyBridge) {
          nextTg.notifyBridge = { ...cur.telegram.notifyBridge, ...payload.telegram.notifyBridge }
        }
        await settingsApi.replace(Config({
          ...cur,
          ...payload,
          telegram: nextTg,
          tts: { ...cur.tts, ...(payload.tts || {}) },
          agent: { ...cur.agent, ...(payload.agent || {}) },
          media: { ...cur.media, ...(payload.media || {}) },
        }))
        sync()
        writeJson(res, 200, { ok: true, config: publicConfig(source()) })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: config')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!isTrustedSettingsRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      writeJson(res, 200, {
        ok: true,
        pending: gw.messenger.pairingPending(),
        approved: gw.messenger.pairingApproved(),
      })
    },
  }), 'dsh-messenger-gateway: pairing list')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing/approve',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!isTrustedSettingsRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      let payload
      try { payload = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { return writeJson(res, 400, { ok: false, error: 'invalid json' }) }
      const resu = await gw.approvePairingCode(payload.code)
      writeJson(res, resu.ok ? 200 : 400, resu)
    },
  }), 'dsh-messenger-gateway: pairing approve')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing/reject',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!isTrustedSettingsRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      let payload
      try { payload = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { return writeJson(res, 400, { ok: false, error: 'invalid json' }) }
      const resu = gw.rejectPairingCode(payload.code)
      writeJson(res, resu.ok ? 200 : 400, resu)
    },
  }), 'dsh-messenger-gateway: pairing reject')

  const webhookPath = () => {
    const p = String(source().telegram?.webhookPath || '').trim()
    return p || '/dsh-messenger-gateway/telegram/webhook'
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: webhookPath(),
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      const cfg = source().telegram || {}
      if (cfg.transport !== 'webhook') return writeJson(res, 404, { ok: false, error: 'webhook transport disabled' })
      const secret = String(cfg.webhookSecret || '').trim()
      if (secret) {
        const hdr = String(req.headers['x-telegram-bot-api-secret-token'] || '')
        if (hdr !== secret) return writeJson(res, 403, { ok: false, error: 'bad secret' })
      }
      const gw = getGw()
      const adapter = gw?.getAdapter?.('telegram')
      if (!adapter?.handleWebhookUpdate) return writeJson(res, 503, { ok: false, error: 'telegram adapter unavailable' })
      let update
      try { update = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch {
        return writeJson(res, 400, { ok: false, error: 'invalid json' })
      }
      try {
        await adapter.handleWebhookUpdate(update)
        writeJson(res, 200, { ok: true })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: telegram webhook')

  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/send', 'send')
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/progress', 'progress')
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/ask', 'ask')

  ctx.on('dispose', () => { if (gateway) gateway.stop() })
  sync()
}
