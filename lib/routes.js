import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readBody, writeJson, isTrustedSettingsRequest, timingSafeCompare, isAuthorizedMessengerRequest } from './http.js'
import {
  messengerApiSchema, dispatchMessenger, httpStatusForError, parseMessengerBody,
} from './messenger-api.js'
import { Config } from './config.js'
import { maskProxyUrl } from './proxy.js'
import { publicConfig } from './config-projection.js'
import { createWebAppHandler } from './webapp.js'
import { registerPluginUpdater } from './updater.js'

// HTTP surface of the plugin (#233): status/smoke/schema/events/config/
// pairing routes, the messenger API routes, the Mini App dashboard and the
// plugin updater. Behavior is unchanged — the entry point only wires
// lifecycle and passes the live accessors in.

export async function readJsonSafe(req, res, maxBytes = 1_048_576) {
  try {
    const raw = await readBody(req, maxBytes)
    const text = raw.toString('utf8').trim()
    return { ok: true, data: text ? JSON.parse(text) : {} }
  } catch (err) {
    if (err.statusCode === 413 || err.status === 413) {
      writeJson(res, 413, { ok: false, error: 'payload too large' })
      return { ok: false }
    }
    writeJson(res, 400, { ok: false, error: 'invalid json' })
    return { ok: false }
  }
}

export function registerMessengerRoute(ctx, getGw, path, action, source) {
  ctx.effect(() => {
    // Guarded registration (#230): no webServer in the profile — skip loudly.
    const ws = ctx.get?.('webServer') || ctx.webServer
    if (!ws?.register) {
      ctx.logger?.warn?.('dsh-messenger-gateway: webServer service unavailable — HTTP routes are skipped')
      return () => {}
    }
    return ws.register({
    kind: 'exact', path,
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      // The global switch takes precedence (#206): with webhooks disabled the
      // messenger write routes disappear entirely (404, like unknown paths).
      if (source?.()?.webhooks?.enabled === false) {
        return writeJson(res, 404, { ok: false, error: 'webhooks disabled' })
      }
      if (!isAuthorizedMessengerRequest(req, source?.()?.webhooks, ctx, { trustProxy: source?.()?.security?.trustProxy === true })) {
        return writeJson(res, 403, { ok: false, error: 'forbidden' })
      }
      let payload
      try {
        payload = parseMessengerBody((await readBody(req, 1_048_576)).toString('utf8'))
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
    })
  }, `dsh-messenger-gateway: ${action}`)
}

/**
 * Register the whole admin/HTTP surface.
 * @param {any} ctx plugin context
 * @param {{ registerRoute: (r: any) => any, getGw: () => any, getSource: () => any,
 *           settingsApi: any, sync: () => void, getWebServer: () => any }} deps
 */
export function setupHttpRoutes(ctx, { registerRoute, getGw, getSource, settingsApi, sync, getWebServer }) {
  const source = getSource

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      const botInfo = gw?.getBotInfo?.() || {}
      const uptimeSec = gw?.stats?.startedAt ? Math.max(0, Math.round((Date.now() - gw.stats.startedAt) / 1000)) : 0
      const scheduledCount = gw?.scheduler?.list ? (await gw.scheduler.list())?.length || 0 : 0
      writeJson(res, 200, {
        ok: true,
        running: Boolean(gw),
        allowlistMode: source().telegram?.allowlistMode || 'closed',
        allowlistCount: (source().telegram?.allowedUserIds || []).length,
        adapters: gw?.messenger.adapters() || [],
        sendOnlyAdapters: gw?.messenger.sendOnlyAdapters?.() || [],
        activeChats: gw?.messenger.activeChats() || 0,
        ttsEnabled: Boolean(source().tts?.enabled),
        messengerService: 'messenger',
        home: gw?.messenger.home?.() || null,
        homes: gw?.messenger.homes?.() || [],
        pairingPending: gw?.messenger.pairingPending?.()?.length || 0,
        botId: botInfo.botId || 0,
        botUsername: botInfo.botUsername || '',
        pollingConflict: Boolean(botInfo.pollingConflict),
        uptimeSec,
        stats: {
          sent: gw?.stats?.sent || 0,
          errors: gw?.stats?.errors || 0,
          startedAt: gw?.stats?.startedAt || 0,
          scheduledCount,
        },
        apiHealth: {
          degraded: (gw?.consecutiveApiFailures || 0) >= 3,
          consecutiveFailures: gw?.consecutiveApiFailures || 0,
          lastError: gw?.lastApiError || null,
        },
        config: publicConfig(source(), gw, ctx),
      })
    },
  }), 'dsh-messenger-gateway: status')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/smoke',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      const parsed = await readJsonSafe(req, res, 65536)
      if (!parsed.ok) return
      const timeoutMs = Number(parsed.data?.timeoutMs) || 10000
      const result = await gw.probeTelegram(timeoutMs)
      writeJson(res, result.ok ? 200 : 502, result)
    },
  }), 'dsh-messenger-gateway: smoke test')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/messenger',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      writeJson(res, 200, { ok: true, schema: messengerApiSchema })
    },
  }), 'dsh-messenger-gateway: messenger schema')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/events',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not ready' })

      if (source().webhooks?.enabled === false) {
        return writeJson(res, 404, { ok: false, error: 'webhooks disabled' })
      }
      const expectedSecret = String(source().webhooks?.secret || '').trim()
      if (!expectedSecret) {
        return writeJson(res, 403, { ok: false, error: 'webhook secret not configured' })
      }

      // Check header authentication BEFORE reading the body to avoid unbounded buffering
      const authHeader = req.headers?.authorization || ''
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
      const tokenHeader = req.headers?.['x-webhook-secret'] || ''
      const headerProvided = bearer || tokenHeader

      if (headerProvided) {
        if (!timingSafeCompare(headerProvided, expectedSecret)) {
          return writeJson(res, 401, { ok: false, error: 'unauthorized' })
        }
      }

      const parsed = await readJsonSafe(req, res, 1_048_576)
      if (!parsed.ok) return
      const payload = parsed.data

      if (!headerProvided) {
        const bodySecret = String(payload.secret || '').trim()
        if (!timingSafeCompare(bodySecret, expectedSecret)) {
          return writeJson(res, 401, { ok: false, error: 'unauthorized' })
        }
      }

      const { target, text, home, chatId, threadId, platform = 'telegram', files } = payload
      if (!text && (!files || !files.length)) {
        return writeJson(res, 400, { ok: false, error: 'text or files required' })
      }

      const dest = target || { platform, chatId, threadId, home }
      try {
        const result = await gw.messengerSend(dest, { text, files, replyMarkup: payload.replyMarkup })
        writeJson(res, 200, { ok: true, sent: result })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: webhook events')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/config',
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'PUT') return writeJson(res, 405, { ok: false, error: 'GET or PUT' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      if (req.method === 'GET') return writeJson(res, 200, { ok: true, config: publicConfig(source(), getGw(), ctx) })
      if (!settingsApi?.isReady?.()) return writeJson(res, 503, { ok: false, error: 'settings not ready' })
      const parsedConfig = await readJsonSafe(req, res, 1_048_576)
      if (!parsedConfig.ok) return
      let payload = parsedConfig.data
      if (payload && typeof payload.config === 'object') payload = payload.config
      try {
        // Serialized through the settings write mutex (#221): concurrent PUT
        // /config and chat-command persists no longer lose updates.
        await settingsApi.writeExclusive(async (api) => {
          const cur = source()
          const nextTg = { ...cur.telegram, ...(payload.telegram || {}) }
          if (payload.telegram && !String(payload.telegram.botToken || '').trim()) nextTg.botToken = cur.telegram.botToken
          // proxyUrl is a secret: empty value or an echoed mask means "keep the
          // stored proxy" (#200)
          if (payload.telegram && Object.prototype.hasOwnProperty.call(payload.telegram, 'proxyUrl')) {
            const incoming = String(payload.telegram.proxyUrl || '').trim()
            if (!incoming || incoming.includes(':***@') || incoming === maskProxyUrl(cur.telegram.proxyUrl || '')) {
              nextTg.proxyUrl = cur.telegram.proxyUrl
            }
          }
          if (payload.telegram && Object.prototype.hasOwnProperty.call(payload.telegram, 'webhookSecret') && !String(payload.telegram.webhookSecret || '').trim()) {
            nextTg.webhookSecret = cur.telegram.webhookSecret
          }
          if (payload.telegram?.notifyBridge) {
            nextTg.notifyBridge = { ...cur.telegram.notifyBridge, ...payload.telegram.notifyBridge }
          }
          const nextDiscord = { ...(cur.discord || {}), ...(payload.discord || {}) }
          if (payload.discord && !String(payload.discord.botToken || '').trim()) nextDiscord.botToken = cur.discord?.botToken
          const nextSlack = { ...(cur.slack || {}), ...(payload.slack || {}) }
          if (payload.slack && !String(payload.slack.botToken || '').trim()) nextSlack.botToken = cur.slack?.botToken
          // memory.token is a secret: a payload without it must keep the
          // stored value, so the section merges like every other (#237).
          const nextMemory = { ...(cur.memory || {}), ...(payload.memory || {}) }
          if (payload.memory && !String(payload.memory.token || '').trim()) nextMemory.token = cur.memory?.token
          await api.replace(Config({
            ...cur,
            ...payload,
            telegram: nextTg,
            discord: nextDiscord,
            slack: nextSlack,
            tts: { ...cur.tts, ...(payload.tts || {}) },
            agent: { ...cur.agent, ...(payload.agent || {}) },
            media: { ...cur.media, ...(payload.media || {}) },
            memory: nextMemory,
          }))
        })
        sync()
        writeJson(res, 200, { ok: true, config: publicConfig(source(), getGw(), ctx) })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: err.message })
      }
    },
  }), 'dsh-messenger-gateway: config')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing',
    handler: async (req, res) => {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      writeJson(res, 200, {
        ok: true,
        pending: gw.messenger.pairingPending(),
        approved: gw.messenger.pairingApproved(),
      })
    },
  }), 'dsh-messenger-gateway: pairing list')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing/approve',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      const parsed = await readJsonSafe(req, res, 65536)
      if (!parsed.ok) return
      const resu = await gw.approvePairingCode(parsed.data.code)
      writeJson(res, resu.ok ? 200 : 400, resu)
    },
  }), 'dsh-messenger-gateway: pairing approve')

  ctx.effect(() => registerRoute({
    kind: 'exact', path: '/dsh-messenger-gateway/pairing/reject',
    handler: async (req, res) => {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      if (!isTrustedSettingsRequest(req, source().webhooks?.secret, ctx, { trustProxy: source().security?.trustProxy === true })) return writeJson(res, 403, { ok: false, error: 'forbidden' })
      const gw = getGw()
      if (!gw) return writeJson(res, 503, { ok: false, error: 'gateway not running' })
      const parsed = await readJsonSafe(req, res, 65536)
      if (!parsed.ok) return
      const resu = gw.rejectPairingCode(parsed.data.code)
      writeJson(res, resu.ok ? 200 : 400, resu)
    },
  }), 'dsh-messenger-gateway: pairing reject')

  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/send', 'send', source)
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/progress', 'progress', source)
  registerMessengerRoute(ctx, getGw, '/dsh-messenger-gateway/messenger/ask', 'ask', source)

  const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json')
  ctx.effect(() => {
    const ws = getWebServer()
    if (!ws?.register) return
    const webappHandler = createWebAppHandler({
      getGateway: getGw,
      getConfig: source,
      ctx,
    })
    return ws.register({
      kind: 'prefix',
      path: '/dsh-messenger-gateway/webapp',
      handler: async (req, res) => {
        // webAppEnabled=false must take the whole Mini App surface down —
        // HTML dashboard and every /api/* endpoint answer 404 (#207).
        if (source().telegram?.webAppEnabled === false) {
          return writeJson(res, 404, { ok: false, error: 'webapp disabled' })
        }
        return webappHandler(req, res)
      },
    })
  }, 'dsh-messenger-gateway: webapp dashboard')

  ctx.effect(() => registerPluginUpdater(ctx, {
    manifestPath,
    packageName: '@goodandready/dsh-messenger-gateway',
    endpoint: '/dsh-messenger-gateway/update',
    // Read endpoints answer version/profile data: gate them like other
    // admin reads (#206).
    isTrustedRequest: (req) => isTrustedSettingsRequest(
      req,
      source().webhooks?.secret,
      ctx,
      { trustProxy: source().security?.trustProxy === true },
    ),
  }), 'dsh-messenger-gateway: plugin updater')
}
