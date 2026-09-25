import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import createAdapters from './adapters/index.js'
import { sessionKey } from './topics.js'
import { resolveNamedHome, listHomes } from './homes.js'
import { assistantText } from './text.js'
import { collectAssistantParts } from './outbound.js'
import { extractTextDelta, extractToolName } from './stream.js'
import { createVoicePrefs } from './voice-prefs.js'
import { executeMessengerAsk, releaseCallbacks, rejectPendingAsk } from './ask.js'
import { createPersonaStore, BUILTIN_PERSONAS } from './personas.js'
import { formatAlertMessage, resolveAlertTarget } from './alerts.js'
import { createScheduler } from './scheduler.js'
import { createPairingStore } from './pairing.js'
import { isTopicGoneError } from './telegram-errors.js'
import { ensureContentArray } from './content-guard.js'
import { ApiHealthTracker } from './api-health.js'
import { t } from './locales/index.js'
import { handleGatewayCommand } from './gateway-commands.js'
import { handleGatewayCallback } from './gateway-callbacks.js'
import { runGatewayTurn, buildUserContent, answerApproval } from './gateway-turn.js'
import {
  collectDynamicSkills, syncTelegramCommands,
  mirrorSessionToForumTopic, relayTurnToForumMirror,
} from './forum-mirror.js'

const PLUGIN = 'dsh-messenger-gateway'

export class Gateway {
  constructor(ctx, config, hooks = {}) {
    this.ctx = ctx
    this.config = config
    this.hooks = hooks
    this.chats = new Map()
    this.sessionToChat = new Map()
    this.sessionToThread = new Map()
    this.threadToSession = new Map()
    this.pending = new Map()
    this.pendingAsks = new Map()
    this.adapters = new Map()
    this.adapterList = []
    this.disposeListener = undefined
    this.idleTimer = undefined
    this.callbackIndex = new Map()
    this.logger = ctx?.logger || console
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    this.pairing = createPairingStore(join(home, 'messenger-gateway', 'pairing.json'), { logger: this.logger })
    this.voicePrefs = createVoicePrefs(join(home, 'messenger-gateway', 'voice-prefs.json'), { logger: this.logger })
    this.chatTts = createVoicePrefs(join(home, 'messenger-gateway', 'chat-tts.json'), { logger: this.logger })
    this.muted = createVoicePrefs(join(home, 'messenger-gateway', 'muted.json'), { logger: this.logger })
    this.personas = createPersonaStore(join(home, 'messenger-gateway', 'personas.json'), { logger: this.logger })
    this.chatLocales = createVoicePrefs(join(home, 'messenger-gateway', 'chat-locales.json'), { logger: this.logger })
    this.scheduler = createScheduler(join(home, 'messenger-gateway', 'scheduled.json'), async (task) => {
      const target = {
        platform: task.platform || 'telegram',
        chatId: task.chatId,
        threadId: task.threadId || 0,
      }
      const locale = this.resolveLocale({ chatId: task.chatId })
      if (task.prompt || task.action === 'prompt') {
        const promptText = task.prompt || task.text
        try {
          await this.dispatchAutonomousPrompt(target, promptText, locale)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          this.ctx.logger?.warn?.(`dsh-messenger-gateway: cron prompt error: ${msg}`)
          await this.sendToMessenger(target, {
            text: `⚠️ <b>[Cron Error]</b>\n${msg}`,
          }).catch((e) => this.recordApiFailure('cron.error_alert', e))
        }
      } else {
        const text = t('remind.prefix', { text: task.text }, locale)
        await this.sendToMessenger(target, { text })
      }
    }, { logger: this.ctx?.logger || console })
    this.stats = { sent: 0, errors: 0, startedAt: Date.now() }
    this.apiHealth = new ApiHealthTracker({ logger: this.logger })
  }

  get consecutiveApiFailures() {
    return this.apiHealth.consecutiveFailures
  }

  get lastApiError() {
    return this.apiHealth.lastError
  }

  recordApiFailure(op, err) {
    this.apiHealth.recordFailure(op, err)
  }

  recordApiSuccess() {
    this.apiHealth.recordSuccess()
  }

  resolveLocale(input) {
    if (input?.locale) return input.locale
    const chatId = input?.chatId
    if (chatId && this.chatLocales?.get(chatId)) return this.chatLocales.get(chatId)
    if (input?.languageCode) {
      const code = String(input.languageCode).toLowerCase()
      if (code.startsWith('zh')) return 'zh'
      if (code.startsWith('en')) return 'en'
    }
    return this.config?.defaultLocale || 'en'
  }

  async dispatchAutonomousPrompt(target, promptText, locale = 'en') {
    const key = this.sessionKeyFor(target)
    const reply = async (payload) => {
      await this.sendToMessenger(target, typeof payload === 'string' ? { text: payload } : payload)
    }
    const input = {
      platform: target.platform || 'telegram',
      chatId: target.chatId,
      threadId: target.threadId || 0,
      text: promptText,
      reply,
      locale,
    }
    const chat = await this.getOrCreateChat(key, input)
    const turnInput = { ...input, attachments: [], inboundWasVoice: false }
    chat.turnActive = true
    try { chat.abort?.abort?.() } catch { /* safe best-effort abort */ }
    chat.abort = new AbortController()
    const run = chat.busy.then(() => this.runTurn(chat, turnInput, chat.abort.signal))
    chat.busy = run.catch(() => {})
    run.catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: cron turn: ${msg}`)
      chat.turnActive = false
      chat.abort = undefined
    })
    return run
  }

  isMuted(chatId) { return this.muted.get(chatId) === true }
  setMuted(chatId, on) { return this.muted.set(chatId, on) }

  baseUrl() {
    const raw = String(this.config.internalBaseURL || '').trim()
    return raw || 'http://127.0.0.1:3080'
  }

  tg() { return this.config.telegram || {} }

  effectiveAllowedIds() {
    const fromConfig = (this.tg().allowedUserIds || []).map(Number).filter(Number.isFinite)
    const fromPairing = this.pairing.listApproved()
    return [...new Set([...fromConfig, ...fromPairing])]
  }

  isUserAllowed(userId) {
    const ids = this.effectiveAllowedIds()
    return ids.length === 0 || ids.includes(Number(userId))
  }

  resolveHomeTarget(platform = 'telegram', name) {
    const tg = this.tg()
    const home = resolveNamedHome(tg, name)
    if (!home) return null
    const out = { platform, chatId: home.chatId, homeName: home.name }
    if (home.threadId > 0) out.threadId = home.threadId
    return out
  }

  async sendAlert(type, payload = {}) {
    try {
      const target = resolveAlertTarget(this)
      if (!target) return
      const allowedEvents = this.config.telegram?.alerts?.events || ['error', 'pairing']
      if (type !== 'status' && !allowedEvents.includes(type)) return

      const text = formatAlertMessage(type, payload)
      await this.sendToMessenger(target, { text })
    } catch (err) {
      this.ctx.logger?.warn?.(`sendAlert (${type}): ${err.message}`)
    }
  }

  async start() {
    this.disposeListener = this.ctx.on('session/event', (session, event) => {
      if (this.config.telegram?.forumMirrorEnabled) {
        if (event.type === 'turn/start' || event.type === 'session/create') {
          this.mirrorSessionToForumTopic(session).catch?.((e) => this.logger?.debug?.('mirror error:', e?.message || e))
        } else if (event.type === 'turn/end') {
          this.relayTurnToForumMirror(session, event).catch?.((e) => this.logger?.debug?.('relay mirror error:', e?.message || e))
        }
      }

      const collector = this.pending.get(session.id)
      if (!collector) return
      if (event.type === 'assistant/message') {
        const msg = event.data.message
        const text = assistantText(msg)
        if (text) collector.lastText = text
        const extra = collectAssistantParts(msg)
        for (const img of extra.images) collector.images.push(img)
      } else if (event.type === 'assistant/chunk') {
        const delta = extractTextDelta(event.data?.chunk)
        if (delta) {
          collector.streamText = (collector.streamText || '') + delta
          collector.onStream?.(collector.streamText, collector.toolName)
        }
      } else if (event.type === 'tool/call') {
        collector.toolName = extractToolName(event.data) || collector.toolName
        collector.onStream?.(collector.streamText || '', collector.toolName)
      } else if (event.type === 'tool/result') {
        collector.toolName = ''
        collector.onStream?.(collector.streamText || '', '')
      } else if (event.type === 'turn/end') {
        collector.reason = event.data.reason
      }
    })
    const adapters = createAdapters({
      config: this.config,
      onMessage: (input) => this.handleMessage(input),
      onCallback: (cb) => this.handleCallback(cb),
      onUnauthorized: (input) => this.handleUnauthorized(input),
      isUserAllowed: (id) => this.isUserAllowed(id),
      logger: this.ctx.logger,
    })
    for (const adapter of adapters) {
      try {
        await adapter.start()
        this.adapterList.push(adapter)
        this.adapters.set(adapter.name, adapter)
        if (adapter.name === 'telegram') this.tgAdapter = adapter
        this.ctx.logger?.info?.(`dsh-messenger-gateway: ${adapter.name} started`)
      } catch (err) {
        this.ctx.logger?.warn?.(`dsh-messenger-gateway: ${adapter.name}: ${err.message}`)
      }
    }
    if (this.adapters.has('telegram')) {
      await this.syncTelegramCommands().catch((err) => {
        this.ctx.logger?.warn?.(`Initial syncTelegramCommands: ${err?.message || err}`)
      })
    }
    const rawIdle = Number(this.config.agent?.idleTimeoutMs)
    const idleMs = Number.isFinite(rawIdle) && rawIdle > 0 ? rawIdle : 86_400_000
    this.idleTimer = setInterval(() => this.reapIdle(), Math.min(idleMs, 60_000))
    this.idleTimer.unref?.()
    this.scheduler.start()
  }

  stop() {
    if (this.scheduler) this.scheduler.stop()
    if (this.disposeListener) this.disposeListener()
    if (this.idleTimer) clearInterval(this.idleTimer)
    for (const a of this.adapterList) { try { a.stop() } catch (e) { this.logger?.debug?.('adapter stop error:', e?.message || e) } }
    this.adapterList = []
    this.adapters.clear()
    for (const chat of this.chats.values()) chat.dispose().catch((e) => this.logger?.debug?.('dispose error:', e?.message || e))
    this.chats.clear()
    this.sessionToChat.clear()
    this.sessionToThread.clear()
    this.threadToSession.clear()
    for (const pending of this.pendingAsks.values()) {
      releaseCallbacks(this.callbackIndex, pending.callbackKeys)
      rejectPendingAsk(pending, new Error('gateway stopped'))
    }
    this.pending.clear()
    this.pendingAsks.clear()
    this.callbackIndex.clear()
  }

  getAdapter(platform) { return this.adapters.get(platform) }

  async messengerSend(target, payload) {
    let resolved = target
    if (!resolved?.chatId && resolved?.platform) {
      const home = this.resolveHomeTarget(resolved.platform, resolved.home || resolved.name)
      if (!home) throw new Error('target.chatId required (or set telegram home channel)')
      resolved = { ...home, ...resolved, chatId: home.chatId, threadId: resolved.threadId ?? home.threadId }
    }
    const adapter = this.getAdapter(resolved.platform)
    if (!adapter?.sendTo) throw new Error(`adapter ${resolved.platform} unavailable`)
    try {
      await adapter.sendTo(resolved.chatId, payload, { threadId: resolved.threadId })
      this.stats.sent++
      this.recordApiSuccess()
    } catch (err) {
      this.stats.errors++
      this.recordApiFailure('messengerSend', err)
      if (isTopicGoneError(err)) {
        this.logger?.warn?.(`messengerSend: topic gone for ${resolved.platform}:${resolved.chatId}:${resolved.threadId} — the chat/topic was deleted; skipping delivery`)
        return
      }
      throw err
    }
  }

  async messengerAsk(target, payload, timeoutMs = 300_000) {
    return executeMessengerAsk(this, target, payload, timeoutMs)
  }


  async messengerProgress(target, payload) {
    await this.messengerSend(target, { text: payload.text })
  }

  async handleUnauthorized(input) {
    const { reply, userId, username } = input
    const locale = this.resolveLocale(input)
    if (!this.tg().pairingEnabled) {
      await reply(t('msg.not_allowed', {}, locale))
      return
    }
    try {
      const { code } = this.pairing.requestCode(userId, { username })
      await reply(t('msg.pairing_requested', { userId, code }, locale))
      this.sendAlert('pairing', { userId, username, code }).catch((e) => this.recordApiFailure('alert.pairing', e))
    } catch (err) {
      if (err.code === 'RATE_LIMIT') await reply(t('msg.pairing_rate_limit', {}, locale))
      else await reply(t('msg.exception', { message: err.message }, locale))
    }
  }

  async handleCallback(cb) {
    return handleGatewayCallback(this, cb)
  }

  sessionKeyFor(input) {
    const scope = this.config.agent?.sessionScope || 'user'
    return sessionKey({
      platform: input.platform,
      chatId: input.chatId,
      threadId: input.threadId || 0,
      userId: input.userId,
      chatType: input.chatType,
      scope,
    })
  }

  isChatBusy(chat) {
    return Boolean(chat?.turnActive)
  }

  async handleMessage(input) {
    const { platform, chatId, threadId = 0, text, reply } = input
    const key = this.sessionKeyFor(input)
    const body = String(text || '').trim()
    let attachments = [...(input.attachments || [])]
    const hasMedia = attachments.length > 0
    if (!body && !hasMedia) return
    if (body.startsWith('/')) { await this.handleCommand(key, body, input); return }
    try {
      const chat = await this.getOrCreateChat(key, input)
      const photoOnlyMode = this.config.agent?.photoOnlyMode ?? 'prompt'
      const incomingPhotoOnly = hasMedia && attachments.every((a) => a.kind === 'photo' || a.kind === 'sticker') && !body
      if (incomingPhotoOnly && photoOnlyMode === 'prompt') {
        chat.pendingMedia = [...(chat.pendingMedia || []), ...attachments]
        const n = chat.pendingMedia.length
        const locale = this.resolveLocale(input)
        const msg = n === 1
          ? t('photo.received_one', {}, locale)
          : t('photo.received_many', { count: n }, locale)
        return reply(msg)
      }
      if (chat.pendingMedia?.length) {
        attachments = [...chat.pendingMedia, ...attachments]
        chat.pendingMedia = []
      }
      const inboundWasVoice = attachments.some((a) => a.kind === 'voice' || a.kind === 'audio')
      let personaOverride
      for (const [pId] of Object.entries(BUILTIN_PERSONAS)) {
        if (pId === 'default') continue
        const tag = `@${pId}`
        if (body.toLowerCase().includes(tag)) {
          personaOverride = pId
          break
        }
      }
      const turnInput = { ...input, text: body, attachments, inboundWasVoice, personaOverride }

      // Hermes-like steer: while a turn is running, inject followup instead of abort+restart
      if (this.isChatBusy(chat)) {
        const steerText = body || (hasMedia ? '(steer: media)' : '')
        const content = await this.buildUserContent({
          ...turnInput,
          text: steerText,
          steer: true,
        }, undefined)
        chat.agent.followup(createUserMessage({
          content: ensureContentArray(content),
          source: { kind: 'user', plugin: PLUGIN, form: 'steer', origin: 'telegram' },
        }))
        chat.lastUsed = Date.now()
        try { await reply(t('msg.steer_added', {}, this.resolveLocale(input))) } catch (err) { this.recordApiFailure('reply.steer_added', err) }
        return
      }

      // Mark busy BEFORE yielding to the poll loop, otherwise steer/stop never see an active turn.
      chat.turnActive = true
      try { chat.abort?.abort?.() } catch { /* safe best-effort abort */ }
      chat.abort = new AbortController()
      const run = chat.busy.then(() => this.runTurn(chat, turnInput, chat.abort.signal))
      chat.busy = run.catch(() => {})
      // Do NOT await: Telegram poll is sequential; awaiting blocked steer and /stop until the turn finished.
      run.catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.ctx.logger?.warn?.(`dsh-messenger-gateway: background turn: ${msg}`)
        this.sendAlert('error', {
          code: err?.code || 'BACKGROUND_ERROR',
          message: msg,
          sessionId: chat.agent?.session?.id,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch((e) => this.recordApiFailure('alert.turn', e))
        chat.turnActive = false
        chat.abort = undefined
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: message: ${msg}`)
      try { await reply(t('msg.exception', { message: msg }, this.resolveLocale(input))) } catch (repErr) { this.recordApiFailure('reply.exception', repErr) }
    }
  }

  async handleCommand(key, text, input) {
    return handleGatewayCommand(this, key, text, input)
  }

  collectDynamicSkills() {
    return collectDynamicSkills(this.ctx)
  }

  async syncTelegramCommands() {
    return syncTelegramCommands(this)
  }

  async mirrorSessionToForumTopic(session) {
    return mirrorSessionToForumTopic(this, session)
  }

  async relayTurnToForumMirror(session, event) {
    return relayTurnToForumMirror(this, session, event)
  }

  async getOrCreateChat(key, input) {
    let chat = this.chats.get(key)
    if (!chat) {
      const threadKey = `${input.chatId}:${input.threadId || 0}`
      const existingSessionId = this.threadToSession.get(threadKey)
      chat = await this.createChat(key, input, existingSessionId)
      this.chats.set(key, chat)
    }
    chat.lastUsed = Date.now()
    chat.target = { platform: input.platform, chatId: input.chatId, threadId: input.threadId || 0 }
    return chat
  }

  resolveAgentModel() {
    const agentCfg = this.config.agent || {}
    let provider = String(agentCfg.provider || '').trim()
    let model = String(agentCfg.model || '').trim()
    if (provider && model) return { provider, model }
    const selection = this.ctx.get('agentDefaultModel')?.currentSelection?.()
    if (!selection?.provider || !selection?.model) {
      throw new Error('Please select a model in Settings -> Models (or set agent.provider/model in profile)')
    }
    return { provider: provider || selection.provider, model: model || selection.model }
  }

  async createChat(key, input, existingSessionId) {
    const { provider, model } = this.resolveAgentModel()
    const agentCfg = this.config.agent || {}
    const cwd = agentCfg.cwd || process.cwd()
    const self = this
    const agents = this.ctx.get?.('agents') || this.ctx.agents
    const targetSessionId = existingSessionId ? SessionId(existingSessionId) : SessionId(`msgw-${randomUUID()}`)
    const handle = await agents.create({
      sessionId: targetSessionId,
      meta: { cwd },
      agentOptions: { provider, model },
      setup: (agentCtx) => {
        installModelSelection(agentCtx, { current: { provider, model }, assembled: undefined })
        if (self.tg().approvalsEnabled !== false) {
          agentCtx.on('approval/request', (req, next) => self.answerApproval(key, req, next))
        }
      },
    })
    await handle.agent.whenIdle()
    const chat = {
      key, agent: handle.agent, dispose: handle.dispose, busy: Promise.resolve(),
      lastUsed: Date.now(), abort: undefined, pendingMedia: [], turnActive: false,
      sessionAllowlist: new Set(),
      target: input ? { platform: input.platform, chatId: input.chatId, threadId: input.threadId || 0 } : undefined,
    }
    this.sessionToChat.set(String(handle.agent.session.id), key)
    if (existingSessionId && input) {
      const threadKey = `${input.chatId}:${input.threadId || 0}`
      this.threadToSession.set(threadKey, existingSessionId)
      this.sessionToThread.set(existingSessionId, { chatId: input.chatId, threadId: input.threadId || 0 })
    }
    return chat
  }

  async answerApproval(chatKeyValue, req, next) {
    return answerApproval(this, chatKeyValue, req, next)
  }

  async buildUserContent(input, signal) {
    return buildUserContent(this, input, signal)
  }

  async runTurn(chat, input, signal) {
    return runGatewayTurn(this, chat, input, signal)
  }

  reapIdle() {
    const rawTimeout = Number(this.config.agent?.idleTimeoutMs)
    const timeout = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 86_400_000
    const now = Date.now()
    for (const [key, chat] of this.chats) {
      if (!chat.turnActive && now - chat.lastUsed > timeout) {
        if (chat.agent?.session?.id) {
          const sid = String(chat.agent.session.id)
          this.sessionToChat.delete(sid)
          const threadInfo = this.sessionToThread.get(sid)
          if (threadInfo) {
            this.threadToSession.delete(`${threadInfo.chatId}:${threadInfo.threadId}`)
            this.sessionToThread.delete(sid)
          }
        }
        this.chats.delete(key)
        chat.dispose().catch((e) => this.logger?.debug?.('reapIdle error:', e?.message || e))
      }
    }
  }

  async approvePairingCode(code, actorUserId = 0) {
    const res = this.pairing.approveCode(code, actorUserId)
    if (!res.ok) return res
    const merged = this.effectiveAllowedIds()
    for (const a of this.adapterList) a.setAllowedUserIds?.(merged)
    try { await this.hooks?.persistAllowedUserIds?.(merged) } catch (e) {
      this.ctx.logger?.warn?.(`persist allowlist: ${e.message}`)
    }
    return { ...res, allowedUserIds: merged }
  }

  rejectPairingCode(code) {
    return this.pairing.rejectCode(code)
  }

  async probeTelegram(timeoutMs = 10000) {
    const adapter = this.getAdapter('telegram')
    if (!adapter) {
      return { ok: false, error: 'Telegram adapter not initialized' }
    }
    if (typeof adapter.probeHealth === 'function') {
      return adapter.probeHealth(timeoutMs)
    }
    return { ok: false, error: 'probeHealth not implemented on adapter' }
  }

  getBotInfo() {
    const adapter = this.getAdapter('telegram')
    return {
      botId: adapter?.botId || 0,
      botUsername: adapter?.botUsername || '',
      pollingConflict: Boolean(adapter?.pollingConflict),
    }
  }

  async messengerAskFromAgent(agent, payload, timeoutMs) {
    const sessionId = String(agent?.session?.id || '')
    const key = this.sessionToChat.get(sessionId)
    const chat = key ? this.chats.get(key) : null
    if (!chat?.target) throw new Error('messenger_ask: no telegram chat for this agent session')
    return this.messengerAsk(chat.target, payload, timeoutMs)
  }

  get messenger() {
    return {
      adapters: () => [...this.adapters.keys()],
      activeChats: () => this.chats.size,
      home: (name) => this.resolveHomeTarget('telegram', name),
      homes: () => listHomes(this.tg()),
      pairingPending: () => this.pairing.listPending(),
      pairingApproved: () => this.pairing.listApproved(),
      send: (target, payload) => this.messengerSend(target, payload),
      ask: (target, payload, timeoutMs) => this.messengerAsk(target, payload, timeoutMs),
      progress: (target, payload) => this.messengerProgress(target, payload),
      probeTelegram: (timeoutMs) => this.probeTelegram(timeoutMs),
      getBotInfo: () => this.getBotInfo(),
    }
  }
}
