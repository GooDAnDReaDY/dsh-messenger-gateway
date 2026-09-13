import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import createAdapters from './adapters/index.js'
import { transcribeVoice, speakText } from './integrations.js'
import { attachInboundPhoto, photoOnlyHint } from './photos.js'
import { formatInboundDocument, documentOnlyHint, parseDocument } from './documents.js'
import { listFiles, getFileForDownload, formatFileSize } from './file-manager.js'
import { collectAssistantParts, buildOutboundFiles, stripImageUrls } from './outbound.js'
import { assistantText, splitText, stripReasoningPreamble, MESSENGER_RELAY_INSTRUCTION } from './text.js'
import { chatKey, sessionKey } from './topics.js'
import { listHomes, resolveNamedHome, upsertHome, normalizeHomeName } from './homes.js'
import { createVoicePrefs, shouldSpeakReply } from './voice-prefs.js'
import { prepareTtsText, toTelegramVoiceFile } from './tts.js'
import {
  makeAskToken, buildInlineKeyboard, buildMultiSelectKeyboard, indexCallbacks, releaseCallbacks,
  parseCallbackData, parseAskCallback, targetMatchesAsk, rejectPendingAsk, REMOVE_KEYBOARD,
} from './ask.js'
import { processDiagramsAndTables } from './artifacts.js'
import { createPersonaStore, getPersona, listPersonas, BUILTIN_PERSONAS } from './personas.js'
import { exportSessionToMarkdown, rewindSession } from './session-ops.js'
import { formatAlertMessage, resolveAlertTarget } from './alerts.js'
import { createScheduler, parseRelativeTime, formatRemaining } from './scheduler.js'
import { listModelCatalog, buildProvidersKeyboard, buildModelsKeyboard, getStoredModelSelection } from './models.js'
import { buildQuickActionsKeyboard, REMOVE_REPLY_KEYBOARD } from './adapters/telegram.js'
import { createPairingStore } from './pairing.js'
import {
  extractTextDelta, extractToolName, buildStreamPreview, formatProgressLine,
  createEditScheduler, startTypingHeartbeat,
} from './stream.js'
import { isTopicGoneError } from './telegram-errors.js'
import { ensureContentArray } from './content-guard.js'
import { mergeDynamicCommands } from './commands.js'
import { t } from './locales/index.js'


function whenIdleWithTimeout(agent, timeoutMs, signal) {
  const idle = agent.whenIdle()
  if (!timeoutMs || timeoutMs <= 0) return idle
  return Promise.race([
    idle,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`turn timeout (${timeoutMs}ms)`)), timeoutMs)
      timer.unref?.()
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }),
  ])
}

function releaseChatTurn(chat) {
  chat.busy = Promise.resolve()
}

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
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    this.pairing = createPairingStore(join(home, 'messenger-gateway', 'pairing.json'))
    this.voicePrefs = createVoicePrefs(join(home, 'messenger-gateway', 'voice-prefs.json'))
    this.chatTts = createVoicePrefs(join(home, 'messenger-gateway', 'chat-tts.json'))
    this.muted = createVoicePrefs(join(home, 'messenger-gateway', 'muted.json'))
    this.personas = createPersonaStore(join(home, 'messenger-gateway', 'personas.json'))
    this.chatLocales = createVoicePrefs(join(home, 'messenger-gateway', 'chat-locales.json'))
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
          }).catch(() => {})
        }
      } else {
        const text = t('remind.prefix', { text: task.text }, locale)
        await this.sendToMessenger(target, { text })
      }
    })
    this.stats = { sent: 0, errors: 0, startedAt: Date.now() }
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
    try { chat.abort?.abort?.() } catch {}
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
          this.mirrorSessionToForumTopic(session).catch?.(() => {})
        } else if (event.type === 'turn/end') {
          this.relayTurnToForumMirror(session, event).catch?.(() => {})
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
    for (const a of this.adapterList) { try { a.stop() } catch {} }
    this.adapterList = []
    this.adapters.clear()
    for (const chat of this.chats.values()) chat.dispose().catch(() => {})
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
    } catch (err) {
      this.stats.errors++
      if (isTopicGoneError(err)) {
        this.logger?.warn?.(`messengerSend: topic gone for ${resolved.platform}:${resolved.chatId}:${resolved.threadId} — the chat/topic was deleted; skipping delivery`)
        return
      }
      throw err
    }
  }

  async messengerAsk(target, payload, timeoutMs = 300_000) {
    const adapter = this.getAdapter(target.platform)
    if (!adapter) throw new Error(`adapter ${target.platform} unavailable`)
    const token = makeAskToken()
    const isMulti = payload.mode === 'multi' || (Array.isArray(payload.options) && payload.options.length > 0)
    let replyMarkup
    let callbackKeys
    let selectedSet
    let page = 0
    const pageSize = Number(payload.pageSize) || 6

    if (isMulti) {
      selectedSet = new Set(Array.isArray(payload.selected) ? payload.selected : [])
      const kb = buildMultiSelectKeyboard(token, payload.options || payload.buttons, selectedSet, page, pageSize, payload)
      replyMarkup = kb.replyMarkup
      callbackKeys = kb.callbackKeys
    } else {
      const kb = buildInlineKeyboard(token, payload.buttons || [])
      replyMarkup = kb.replyMarkup
      callbackKeys = kb.callbackKeys
    }

    indexCallbacks(this.callbackIndex, callbackKeys, token)
    try {
      await adapter.sendTo(target.chatId, { text: payload.text, replyMarkup }, { threadId: target.threadId })
    } catch (err) {
      // Never leave stale callback keys pointing at an unresolvable ask.
      releaseCallbacks(this.callbackIndex, callbackKeys)
      if (isTopicGoneError(err)) {
        this.logger?.warn?.(`messengerAsk: topic gone for ${target.platform}:${target.chatId}:${target.threadId} — ask aborted (chat/topic deleted)`)
        throw new Error('messenger.ask: chat or topic was deleted')
      }
      throw err
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAsks.delete(token)
        releaseCallbacks(this.callbackIndex, callbackKeys)
        reject(new Error('messenger.ask timed out'))
      }, timeoutMs)
      timer.unref?.()
      this.pendingAsks.set(token, {
        resolve, reject, timer, target, callbackKeys, isMulti,
        options: payload.options || payload.buttons,
        selected: selectedSet,
        page, pageSize, payload,
      })
    })
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
      this.sendAlert('pairing', { userId, username, code }).catch(() => {})
    } catch (err) {
      if (err.code === 'RATE_LIMIT') await reply(t('msg.pairing_rate_limit', {}, locale))
      else await reply(t('msg.exception', { message: err.message }, locale))
    }
  }

  async handleCallback(cb) {
    if (cb.userId && !this.isUserAllowed(cb.userId)) {
      try { await cb.answer(t('msg.not_allowed', {}, 'en')) } catch {}
      return
    }
    const indexed = this.callbackIndex.get(cb.data)
    const { token, buttonId } = parseCallbackData(cb.data)
    const askToken = indexed || token
    if (askToken && this.pendingAsks.has(askToken)) {
      const pending = this.pendingAsks.get(askToken)
      if (!targetMatchesAsk(pending, cb)) {
        await cb.answer(t('ask.other_chat', {}, 'en'))
        return
      }
      const action = parseAskCallback(cb.data)
      if (pending.isMulti) {
        if (action.kind === 'toggle') {
          if (pending.selected.has(action.id)) pending.selected.delete(action.id)
          else pending.selected.add(action.id)
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          const nextKb = buildMultiSelectKeyboard(askToken, pending.options, pending.selected, pending.page, pending.pageSize, pending.payload)
          pending.callbackKeys = nextKb.callbackKeys
          indexCallbacks(this.callbackIndex, nextKb.callbackKeys, askToken)
          try {
            if (cb.editReplyMarkup) await cb.editReplyMarkup(nextKb.replyMarkup)
            else await cb.editMessage(cb.message?.text || 'Selection', nextKb.replyMarkup)
          } catch {}
          await cb.answer(pending.selected.has(action.id) ? 'Selected' : 'Deselected')
          return
        }
        if (action.kind === 'page') {
          pending.page = action.page
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          const nextKb = buildMultiSelectKeyboard(askToken, pending.options, pending.selected, pending.page, pending.pageSize, pending.payload)
          pending.callbackKeys = nextKb.callbackKeys
          indexCallbacks(this.callbackIndex, nextKb.callbackKeys, askToken)
          try {
            if (cb.editReplyMarkup) await cb.editReplyMarkup(nextKb.replyMarkup)
            else await cb.editMessage(cb.message?.text || 'Selection', nextKb.replyMarkup)
          } catch {}
          await cb.answer()
          return
        }
        if (action.kind === 'done') {
          this.pendingAsks.delete(askToken)
          clearTimeout(pending.timer)
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          await cb.answer('OK')
          try { await cb.editMessage(cb.message?.text || 'Done', REMOVE_KEYBOARD) } catch {}
          pending.resolve({ buttonId: 'done', selected: Array.from(pending.selected), data: cb.data })
          return
        }
        if (action.kind === 'cancel') {
          this.pendingAsks.delete(askToken)
          clearTimeout(pending.timer)
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          await cb.answer('Cancelled')
          try { await cb.editMessage(cb.message?.text || 'Cancelled', REMOVE_KEYBOARD) } catch {}
          pending.resolve({ buttonId: 'cancel', selected: [], data: cb.data })
          return
        }
      }
      this.pendingAsks.delete(askToken)
      clearTimeout(pending.timer)
      releaseCallbacks(this.callbackIndex, pending.callbackKeys)
      await cb.answer('OK')
      try { await cb.editMessage(cb.message?.text || 'Done', REMOVE_KEYBOARD) } catch {}
      pending.resolve({ buttonId: action.id || buttonId, data: cb.data })
      return
    }

    // Model picker interactive flow
    if (cb.data?.startsWith('mdl:')) {
      const parts = cb.data.split(':')
      const sub = parts[1]
      // Step 2: Selected provider -> show its models (10 per page)
      if (sub === 'p') {
        const providerId = parts.slice(2).join(':')
        const current = this.resolveAgentModel()
        const catalog = await listModelCatalog(this.ctx, current)
        const models = catalog.modelsByProvider.get(providerId) || []
        if (!models.length) {
          await cb.answer(t('model.no_models', {}, 'en'))
          return
        }
        const kb = buildModelsKeyboard(providerId, models, current.model, 0)
        await cb.answer()
        const text = [
          `🤖 <b>Provider:</b> <code>${providerId}</code>`,
          `Select model (page ${kb.page + 1}/${kb.totalPages}):`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch {}
        return
      }
      // Pagination for models
      if (sub === 'pg') {
        const page = parseInt(parts[parts.length - 1], 10) || 0
        const providerId = parts.slice(2, -1).join(':')
        const current = this.resolveAgentModel()
        const catalog = await listModelCatalog(this.ctx, current)
        const models = catalog.modelsByProvider.get(providerId) || []
        const kb = buildModelsKeyboard(providerId, models, current.model, page)
        await cb.answer()
        const text = [
          `🤖 <b>Provider:</b> <code>${providerId}</code>`,
          `Select model (page ${kb.page + 1}/${kb.totalPages}):`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch {}
        return
      }
      // Back to providers
      if (sub === 'back') {
        const current = this.resolveAgentModel()
        const catalog = await listModelCatalog(this.ctx, current)
        const kb = buildProvidersKeyboard(catalog.providers, current)
        await cb.answer()
        const text = [
          '🤖 <b>Choose Provider:</b>',
          `Current: <code>${current.provider}/${current.model}</code>`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch {}
        return
      }
      // Select model
      if (sub === 's') {
        const key = parts[2]
        const stored = getStoredModelSelection(key)
        if (!stored) {
          await cb.answer(t('ask.expired', {}, 'en'))
          return
        }
        const { provider, model } = stored
        try {
          const adm = this.ctx.get('agentDefaultModel')
          if (adm?.saveSelection) {
            await adm.saveSelection({ provider, model })
          }
          this.config.agent = { ...this.config.agent, provider, model }
          try {
            await this.hooks?.persistAgentModel?.({ provider, model })
          } catch (e) {
            this.ctx.logger?.warn?.(`persist agent model: ${e.message}`)
          }
          await cb.answer(t('ask.chose', { choice: model }, 'en'))
          try {
            if (cb.editMessage) await cb.editMessage(t('model.switched', { provider, model }, 'en'), REMOVE_KEYBOARD)
          } catch {}
        } catch (err) {
          await cb.answer(`Error: ${err.message}`)
        }
        return
      }
      if (sub === 'cur') {
        await cb.answer()
        return
      }
    }

    await cb.answer()
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
        try { await reply(t('msg.steer_added', {}, this.resolveLocale(input))) } catch {}
        return
      }

      // Mark busy BEFORE yielding to the poll loop, otherwise steer/stop never see an active turn.
      chat.turnActive = true
      try { chat.abort?.abort?.() } catch {}
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
        }).catch(() => {})
        chat.turnActive = false
        chat.abort = undefined
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: message: ${msg}`)
      try { await reply(t('msg.exception', { message: msg }, this.resolveLocale(input))) } catch {}
    }
  }

  async handleCommand(key, text, input) {
    const parts = text.split(/\s+/)
    const cmd = parts[0].toLowerCase().split('@')[0]
    const { reply, userId, chatId, threadId = 0, platform } = input
    const locale = this.resolveLocale(input)

    if (cmd === '/start') {
      return reply(t('msg.start', {}, locale), { replyMarkup: REMOVE_REPLY_KEYBOARD })
    }

    if (cmd === '/help') {
      return reply([
        '📖 <b>Messenger Gateway Help:</b>',
        '',
        '💬 <b>Session & Chat:</b>',
        '• /help — show this command reference',
        '• /new — start fresh session',
        '• /stop — interrupt current response',
        '• /model — interactive model selector (/model list)',
        '• /role [name] — switch persona or role (/role list)',
        '• /bind [role] — bind persona to topic / chat',
        '• /preset [name] — bind preset to topic / chat',
        '• /lang [en|zh] — switch user language',
        '• /rewind [N] — rewind last N turns',
        '• /fork — fork session into new branch',
        '• /export — export history to Markdown',
        '',
        '🛠️ <b>Tools, Files & Cron:</b>',
        '• /skills / /tools — list active tools & skills',
        '• /files [dir] — workspace file explorer',
        '• /get <path> — download file from workspace',
        '• /remind <time> <text> — set reminder (/remind 10m check deploy)',
        '• /cron <interval> <prompt> — recurring autonomous task',
        '',
        '⚙️ <b>Settings & Stats:</b>',
        '• /status — gateway and active model status',
        '• /top — system resource usage (RAM, uptime)',
        '• /keyboard on|off — quick action keyboard',
        '• /voice on|off|status — voice replies preference',
        '• /tts on|off|status — speech synthesis in this chat',
        '• /mute / /unmute — mute notifications in this chat',
        '',
        '🔒 <b>Access & Channels:</b>',
        '• /whoami — your messenger user ID',
        '• /pair CODE — approve pairing code',
        '• /sethome [name] — set home notification channel',
        '• /setalert — set alert channel',
      ].join('\n'))
    }

    if (cmd === '/lang' || cmd === '/language') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'en' || sub === 'zh') {
        this.chatLocales.set(chatId, sub)
        return reply(sub === 'zh' ? '语言已切换为中文 (zh)' : 'Language switched to English (en)')
      }
      const cur = this.chatLocales.get(chatId) || this.config?.defaultLocale || 'en'
      return reply(`Current language: <b>${cur}</b>\nSwitch: <code>/lang en</code> or <code>/lang zh</code>`)
    }

    if (cmd === '/bind') {
      const targetRole = parts[1]?.toLowerCase()
      if (!targetRole || targetRole === 'list') {
        const cur = this.personas.getPersonaForChat(chatId, threadId)
        return reply(`${t('persona.title', {}, locale)}\nCurrent bound role: <b>${cur}</b>\nUsage: <code>/bind &lt;role&gt;</code> (or /bind reset)`)
      }
      if (targetRole === 'reset' || targetRole === 'default') {
        this.personas.set(chatId, 'default', threadId)
        return reply(t('persona.reset', {}, locale))
      }
      const persona = getPersona(targetRole)
      if (!persona) return reply(t('persona.unknown', { target: targetRole }, locale))
      this.personas.set(chatId, targetRole, threadId)
      return reply(t('persona.bound_topic', { kind: 'role', name: `${persona.icon} ${persona.name}` }, locale))
    }

    if (cmd === '/preset') {
      const presetName = parts[1]
      if (!presetName || presetName === 'list') {
        const cur = this.personas.getPreset(chatId, threadId) || '(none)'
        return reply(`🎭 <b>Presets:</b>\nCurrent topic preset: <code>${cur}</code>\nUsage: <code>/preset &lt;name&gt;</code> or <code>/preset reset</code>`)
      }
      if (presetName === 'reset' || presetName === 'clear') {
        this.personas.setPreset(chatId, threadId, null)
        return reply('Preset cleared for this topic.')
      }
      this.personas.setPreset(chatId, threadId, presetName)
      return reply(t('persona.bound_topic', { kind: 'preset', name: presetName }, locale))
    }

    if (cmd === '/cron') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'list') {
        const list = await this.scheduler.listRecurring(chatId)
        if (!list.length) return reply(t('cron.none', {}, locale))
        const lines = [t('cron.list_title', {}, locale)]
        for (const task of list) {
          const left = formatRemaining(task.dueAt - Date.now(), locale)
          lines.push(`• <code>${task.id}</code> (every ${formatRemaining(task.intervalMs, locale)}, next in ${left}): ${task.prompt || task.text}`)
        }
        lines.push('\nCancel: <code>/cron cancel ID</code>')
        return reply(lines.join('\n'))
      }
      if (sub === 'cancel') {
        const targetId = parts[2]
        if (!targetId) return reply('Specify cron task ID: <code>/cron cancel ID</code>')
        const ok = await this.scheduler.cancel(targetId, chatId)
        return reply(ok ? t('cron.cancelled', { id: targetId }, locale) : `Task not found: <code>${targetId}</code>`)
      }
      const specArg = parts[1]
      const promptArg = parts.slice(2).join(' ')
      const ms = parseRelativeTime(specArg)
      if (!ms || !promptArg) {
        return reply('⏱️ <b>Autonomous Cron Tasks:</b>\nCreate: <code>/cron &lt;interval&gt; &lt;prompt&gt;</code>\nExample: <code>/cron 1h check server logs</code>\nList: <code>/cron list</code>\nCancel: <code>/cron cancel ID</code>')
      }
      const task = await this.scheduler.schedule({
        platform,
        chatId,
        threadId,
        userId,
        text: promptArg,
        prompt: promptArg,
        dueAt: Date.now() + ms,
        recurring: true,
        intervalMs: ms,
      })
      return reply(t('cron.scheduled', { id: task.id, schedule: specArg, prompt: promptArg }, locale))
    }

    if (cmd === '/role' || cmd === '/persona') {
      const targetRole = parts[1]?.toLowerCase()
      if (!targetRole || targetRole === 'list') {
        const currentId = this.personas.getPersonaForChat(chatId, threadId)
        const lines = [
          t('persona.title', {}, locale),
          '',
          ...listPersonas().map((p) => {
            const isCurrent = p.id === currentId ? ' (active)' : ''
            return `${p.icon} <b>${p.id}</b> — ${p.name}: ${p.description}${isCurrent}`
          }),
          '',
          t('persona.usage', {}, locale),
        ]
        return reply(lines.join('\n'))
      }
      if (targetRole === 'reset' || targetRole === 'default') {
        this.personas.set(chatId, 'default', threadId)
        return reply(t('persona.reset', {}, locale))
      }
      const persona = getPersona(targetRole)
      if (!persona) {
        return reply(t('persona.unknown', { target: targetRole }, locale))
      }
      this.personas.set(chatId, persona.id, threadId)
      return reply(t('persona.switched', { icon: persona.icon, name: persona.name, description: persona.description }, locale))
    }

    if (cmd === '/skills' || cmd === '/tools') {
      const tools = this.ctx.get?.('tools') || this.ctx.tools
      const toolsList = []
      if (tools?.tools) {
        for (const [name, tDef] of tools.tools.entries()) {
          toolsList.push(`• <b>${name}</b>: ${tDef.description || '(no description)'}`)
        }
      }
      if (!toolsList.length) {
        return reply('🛠️ <b>Agent Tools:</b>\n(no tools registered)')
      }
      return reply([
        '🛠️ <b>Active Tools & Skills:</b>',
        '',
        ...toolsList,
      ].join('\n'))
    }

    if (cmd === '/export') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      try {
        const { filename, buffer, messagesCount } = exportSessionToMarkdown(chat.agent.session)
        if (!messagesCount) {
          return reply(t('export.empty', {}, locale))
        }
        const file = {
          name: filename,
          mime: 'text/markdown',
          kind: 'document',
          bytes: buffer,
        }
        return reply({ text: t('export.title', { count: messagesCount }, locale), files: [file] })
      } catch (err) {
        return reply(`Export error: ${err.message}`)
      }
    }

    if (cmd === '/rewind') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      const count = Number(parts[1]) || 1
      const res = rewindSession(chat.agent.session, count)
      if (!res.removed) {
        return reply('No turns to rewind in session history.')
      }
      const sessions = this.ctx.get?.('sessions') || this.ctx.sessions
      try { await sessions?.flush(chat.agent.session) } catch {}
      return reply(`⏪ Rewound ${res.removed} messages. Remaining in context: ${res.remaining}.`)
    }

    if (cmd === '/fork') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      try {
        const oldSession = chat.agent.session
        const oldMessages = Array.isArray(oldSession.messages)
          ? oldSession.messages.map(m => ({ ...m, content: ensureContentArray(m.content) }))
          : []
        const newChat = await this.createChat(key, input)
        if (newChat.agent?.session && oldMessages.length) {
          newChat.agent.session.messages = oldMessages
          const sessions = this.ctx.get?.('sessions') || this.ctx.sessions
          try { await sessions?.flush(newChat.agent.session) } catch {}
        }
        this.chats.set(key, newChat)
        return reply(`🔀 Forked session!\nOld session: ${oldSession.id}\nNew session: ${newChat.agent.session.id}\nContext preserved (${oldMessages.length} messages).`)
      } catch (err) {
        return reply(`Fork error: ${err.message}`)
      }
    }

    if (cmd === '/files') {
      const subPath = parts.slice(1).join(' ').trim() || '.'
      const agentCwd = this.config.agent?.cwd || process.cwd()
      const res = await listFiles(agentCwd, subPath)
      if (!res.ok) return reply(`❌ ${res.error}`)
      return reply(res.formattedText)
    }

    if (cmd === '/get') {
      const targetRel = parts.slice(1).join(' ').trim()
      if (!targetRel) {
        return reply('Specify file path to download: <code>/get &lt;path&gt;</code>\nBrowse: <code>/files</code>')
      }
      const agentCwd = this.config.agent?.cwd || process.cwd()
      const maxDocBytes = Number(this.config.media?.maxDocBytes) || 50 * 1024 * 1024
      const res = await getFileForDownload(agentCwd, targetRel, maxDocBytes)
      if (!res.ok) return reply(`❌ ${res.error}`)
      const file = {
        name: res.name,
        mime: res.mime,
        kind: 'document',
        bytes: res.bytes,
        dataBase64: res.bytes.toString('base64'),
      }
      return reply({ text: `📄 File: <b>${res.name}</b> (${formatFileSize(res.size)})`, files: [file] })
    }

    if (cmd === '/new') {
      const chat = this.chats.get(key)
      if (chat) {
        if (chat.abort) chat.abort.abort()
        chat.pendingMedia = []
        this.sessionToChat.delete(String(chat.agent.session.id))
        this.chats.delete(key)
        await chat.dispose()
        return reply('Session reset.')
      }
      return reply(t('msg.no_active_session', {}, locale))
    }

    if (cmd === '/whoami') {
      const lines = [`User ID: ${userId}`]
      if (chatId) lines.push(`chatId: ${chatId}`)
      if (threadId) lines.push(`threadId: ${threadId}`)
      return reply(lines.join('\n'))
    }

    if (cmd === '/stop') {
      const chat = this.chats.get(key)
      if (chat?.turnActive || chat?.abort) {
        try { chat.abort?.abort() } catch {}
        releaseChatTurn(chat)
        chat.turnActive = false
        return reply(t('msg.turn_stopped', {}, locale))
      }
      return reply('Nothing to stop.')
    }

    if (cmd === '/status') {
      let modelLine = 'model: (not set)'
      try {
        const sel = this.resolveAgentModel()
        modelLine = `model: ${sel.provider}/${sel.model}`
      } catch (e) {
        modelLine = `model: ${e.message}`
      }
      const home = this.resolveHomeTarget(platform || 'telegram')
      const homeLine = home
        ? `home: chat ${home.chatId}${home.threadId ? ` topic ${home.threadId}` : ''}`
        : 'home: (not set)'
      const pending = this.pairing.listPending().length
      const up = Math.max(0, Math.round((Date.now() - this.stats.startedAt) / 1000))
      const hh = String(Math.floor(up / 3600)).padStart(2, '0')
      const mm = String(Math.floor((up % 3600) / 60)).padStart(2, '0')
      const ss = String(up % 60).padStart(2, '0')
      return reply([
        'Messenger gateway',
        `adapters: ${[...this.adapters.keys()].join(', ') || '(none)'}`,
        `active chats: ${this.chats.size}`,
        modelLine,
        homeLine,
        `pairing pending: ${pending}`,
        `transport: ${this.tg().transport || 'poll'}`,
        `sessionScope: ${this.config.agent?.sessionScope || 'user'}`,
        `delivered: ${this.stats.sent}`,
        `errors: ${this.stats.errors}`,
        `polling conflict: ${this.tgAdapter?.pollingConflict ? 'yes' : 'no'}`,
        `uptime: ${hh}:${mm}:${ss}`,
      ].join('\n'))
    }

    if (cmd === '/model') {
      if (parts.length >= 3) {
        if (!this.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
        const provider = parts[1]
        const model = parts.slice(2).join(' ')
        try {
          const adm = this.ctx.get('agentDefaultModel')
          if (adm?.saveSelection) {
            await adm.saveSelection({ provider, model })
          }
          this.config.agent = { ...this.config.agent, provider, model }
          try {
            await this.hooks?.persistAgentModel?.({ provider, model })
          } catch (e) {
            this.ctx.logger?.warn?.(`persist agent model: ${e.message}`)
          }
          return reply(t('model.switched', { provider, model }, locale))
        } catch (e) {
          return reply(`Failed to switch model: ${e.message}`)
        }
      }
      try {
        const current = this.resolveAgentModel()
        const catalog = await listModelCatalog(this.ctx, current)
        if (!catalog.providers.length) {
          return reply(`Current model: <code>${current.provider}/${current.model}</code>\nSwitch: <code>/model &lt;provider&gt; &lt;model&gt;</code>`)
        }
        const kb = buildProvidersKeyboard(catalog.providers, current)
        return reply([
          t('model.title', {}, locale),
          t('model.current', { current: `${current.provider}/${current.model}` }, locale),
        ].join('\n'), {
          replyMarkup: kb,
        })
      } catch (e) {
        return reply(e.message)
      }
    }

    if (cmd === '/pair') {
      if (!this.isUserAllowed(userId)) return reply('Only users in allowlist can approve /pair.')
      const code = parts[1]
      if (!code) return reply('Usage: /pair CODE')
      const res = this.pairing.approveCode(code, userId)
      if (!res.ok) return reply(`Failed: ${res.error}`)
      const merged = this.effectiveAllowedIds()
      for (const a of this.adapterList) a.setAllowedUserIds?.(merged)
      try { await this.hooks?.persistAllowedUserIds?.(merged) } catch (e) {
        this.ctx.logger?.warn?.(`persist allowlist: ${e.message}`)
      }
      return reply(`Approved user ID ${res.userId}${res.username ? ` (@${res.username})` : ''}.`)
    }

    if (cmd === '/sethome') {
      if (!this.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
      const name = normalizeHomeName(parts[1] || 'default') || 'default'
      try {
        const nextTg = upsertHome(this.tg(), { name, chatId, threadId })
        await this.hooks?.persistHomes?.(nextTg)
        this.config.telegram = nextTg
        return reply(`Home "${name}": chat ${chatId}${threadId ? ` topic ${threadId}` : ''}`)
      } catch (e) {
        return reply(`Failed to save home: ${e.message}`)
      }
    }

    if (cmd === '/home') {
      const homes = listHomes(this.tg())
      if (!homes.length) return reply('Home is not set. /sethome or /sethome <name>')
      return reply(['Homes:', ...homes.map((h) => `• ${h.name}: chat ${h.chatId}${h.threadId ? ` topic ${h.threadId}` : ''}`)].join('\n'))
    }

    if (cmd === '/setalert') {
      if (!this.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
      const nextTg = {
        ...this.tg(),
        alerts: {
          ...(this.tg().alerts || {}),
          enabled: true,
          chatId,
          threadId: threadId || 0,
        },
      }
      this.config.telegram = nextTg
      try { await this.hooks?.persistHomes?.(nextTg) } catch {}
      return reply(`🔔 This chat assigned as alert channel (chat: ${chatId}${threadId ? `, topic: ${threadId}` : ''}).`)
    }

    if (cmd === '/alert') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'test') {
        const target = resolveAlertTarget(this)
        if (!target) return reply('Alert channel not configured. Configure: /setalert')
        await this.sendAlert('status', { title: 'Test Alert', details: `Sent by user ID ${userId}` })
        return reply('Test alert sent to alert channel.')
      }
      const target = resolveAlertTarget(this)
      const alertsCfg = this.tg().alerts || {}
      return reply([
        '🔔 <b>Alert Channel:</b>',
        `Status: ${alertsCfg.enabled ? 'enabled' : 'disabled'}`,
        `Chat: ${target ? `${target.chatId}${target.threadId ? ` (topic: ${target.threadId})` : ''}` : '(not assigned)'}`,
        `Events: ${(alertsCfg.events || ['error', 'pairing']).join(', ')}`,
        '',
        'Commands:',
        '/setalert — assign current chat as alert channel',
        '/alert test — send test alert',
      ].join('\n'))
    }

    if (cmd === '/remind') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'list') {
        const active = await this.scheduler.list(chatId)
        if (!active.length) return reply('No active reminders for this chat.')
        const lines = [
          '⏰ <b>Active Reminders:</b>',
          '',
          ...active.map((tItem) => {
            const left = formatRemaining(tItem.dueAt - Date.now(), locale)
            return `• <code>${tItem.id}</code> (in ${left}): ${tItem.text}`
          }),
          '',
          'Cancel: <code>/remind cancel ID</code>',
        ]
        return reply(lines.join('\n'))
      }
      if (sub === 'cancel') {
        const targetId = parts[2]?.trim()
        if (!targetId) return reply('Specify reminder ID: <code>/remind cancel ID</code>')
        const ok = await this.scheduler.cancel(targetId, chatId)
        return reply(ok ? `✅ Reminder <code>${targetId}</code> cancelled.` : `❌ Reminder <code>${targetId}</code> not found.`)
      }
      const timeArg = parts[1]
      const textArg = parts.slice(2).join(' ').trim()
      const delayMs = parseRelativeTime(timeArg)
      if (!delayMs || !textArg) {
        return reply([
          '⏰ <b>Reminders:</b>',
          'Create: <code>/remind &lt;time&gt; &lt;text&gt;</code>',
          'Examples: <code>/remind 10m Call colleague</code>, <code>/remind 2h Check deploy</code>',
          'List: <code>/remind list</code>',
          'Cancel: <code>/remind cancel ID</code>',
        ].join('\n'))
      }
      const dueAt = Date.now() + delayMs
      const task = await this.scheduler.schedule({
        platform: platform || 'telegram',
        chatId,
        threadId: threadId || 0,
        userId,
        text: textArg,
        dueAt,
      })
      const left = formatRemaining(delayMs, locale)
      return reply(t('remind.scheduled', { time: new Date(dueAt).toLocaleTimeString(), duration: left, text: textArg }, locale))
    }

    if (cmd === '/voice') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'summary') {
        const val = parts[2]?.toLowerCase()
        if (val === 'on' || val === 'off') {
          if (!this.config.tts) this.config.tts = {}
          this.config.tts.voiceSummary = val === 'on'
          return reply(`Voice summary (TL;DR): ${val === 'on' ? 'enabled' : 'disabled'}`)
        }
        const state = this.config.tts?.voiceSummary ? 'on' : 'off'
        return reply(`Voice summary (TL;DR): ${state}\nToggle: <code>/voice summary on|off</code>`)
      }
      if (sub === 'on' || sub === 'off') {
        this.voicePrefs.set(userId, sub === 'on')
        return reply(sub === 'on' ? 'Voice replies: on (for you)' : 'Voice replies: off (for you)')
      }
      const pref = this.voicePrefs.get(userId)
      const mode = this.tg().voiceMode || 'mirror'
      const prefLine = pref === null ? 'not set (/voice on|off)' : (pref ? 'on' : 'off')
      const summaryState = this.config.tts?.voiceSummary ? 'on' : 'off'
      return reply(`voiceMode=${mode}\nyour /voice: ${prefLine}\nglobal tts: ${this.config.tts?.enabled ? 'on' : 'off'}\nvoice summary: ${summaryState}`)
    }

    if (cmd === '/topic') {
      const topicName = parts.slice(1).join(' ').trim()
      if (!topicName) {
        return reply('Usage: <code>/topic &lt;name&gt;</code>\nCreates a new topic in supergroup with an isolated session.')
      }
      const tgAdapter = this.getAdapter('telegram')
      if (!tgAdapter?.createForumTopic) {
        return reply('Topic creation is available only in Telegram.')
      }
      try {
        const res = await tgAdapter.createForumTopic(chatId, topicName)
        const newThreadId = res?.message_thread_id
        await reply(`🎯 Created new topic <b>«${topicName}»</b> (ID: <code>${newThreadId}</code>).\nSwitch to the topic to continue working!`)
        if (newThreadId) {
          await tgAdapter.sendTo(chatId, {
            text: `👋 Hello! This is an isolated session for task <b>«${topicName}»</b>.\nHow can I help?`,
          }, { threadId: newThreadId })
        }
        return
      } catch (err) {
        return reply(`Failed to create topic: ${err.message}\n(Ensure the bot is group administrator with Manage Topics permission)`)
      }
    }

    if (cmd === '/top') {
      const mem = process.memoryUsage()
      const rssMb = (mem.rss / 1024 / 1024).toFixed(1)
      const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1)
      const sec = Math.floor((Date.now() - this.stats.startedAt) / 1000)
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0')
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      let activeReminders = 0
      try { activeReminders = (await this.scheduler.list()).length } catch {}
      let currentModel = 'not set'
      try {
        const m = this.resolveAgentModel()
        currentModel = `${m.provider}/${m.model}`
      } catch {}

      return reply([
        '📊 <b>DSH System & Resources:</b>',
        `• <b>Memory (RSS):</b> ${rssMb} MB`,
        `• <b>Heap:</b> ${heapMb} MB`,
        `• <b>Uptime:</b> ${hh}:${mm}:${ss}`,
        `• <b>Active chats:</b> ${this.chats.size}`,
        `• <b>Queued reminders:</b> ${activeReminders}`,
        `• <b>Active model:</b> <code>${currentModel}</code>`,
        `• <b>Messages sent:</b> ${this.stats.sent}`,
        `• <b>Errors:</b> ${this.stats.errors}`,
      ].join('\n'))
    }

    if (cmd === '/keyboard') {
      const sub = String(parts[1] || '').toLowerCase()
      const tgAdapter = this.getAdapter('telegram')
      if (sub === 'on') {
        if (tgAdapter) tgAdapter.quickActions = true
        return reply('Quick action keyboard enabled.', {
          replyMarkup: buildQuickActionsKeyboard(),
        })
      }
      if (sub === 'off') {
        if (tgAdapter) tgAdapter.quickActions = false
        return reply('Quick action keyboard disabled.', {
          replyMarkup: REMOVE_REPLY_KEYBOARD,
        })
      }
      const curState = tgAdapter?.quickActions ? 'enabled' : 'disabled'
      return reply([
        '⌨️ <b>Quick Action Keyboard:</b>',
        `Current state: <b>${curState}</b>`,
        '',
        'Commands:',
        '<code>/keyboard on</code> — show buttons',
        '<code>/keyboard off</code> — hide buttons',
      ].join('\n'))
    }

    if (cmd === '/tts') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'on' || sub === 'off') {
        this.chatTts.set(chatId, sub === 'on')
        return reply(sub === 'on' ? 'Speech in this chat: on' : 'Speech in this chat: off')
      }
      const cur = this.chatTts.get(chatId)
      const line = cur === null ? 'not set (/tts on|off)' : (cur ? 'on' : 'off')
      return reply(`Speech in this chat: ${line}\nglobal tts: ${this.config.tts?.enabled ? 'on' : 'off'}`)
    }

    if (cmd === '/mute') {
      this.setMuted(chatId, true)
      return reply(t('msg.muted_on', {}, locale))
    }

    if (cmd === '/unmute') {
      this.setMuted(chatId, false)
      return reply(t('msg.muted_off', {}, locale))
    }

    return reply(t('msg.unknown_command', { cmd }, locale))
  }

  collectDynamicSkills() {
    const skills = []
    try {
      const skillsService = this.ctx.get?.('skills') || this.ctx.skills
      const allSkills = skillsService?.list?.() || []
      for (const s of allSkills) {
        if (!s || !s.name) continue
        if (s.userInvocable === false) continue
        skills.push({
          name: String(s.name),
          description: String(s.description || s.title || `Skill ${s.name}`).slice(0, 256),
        })
      }
    } catch (err) {
      this.ctx.logger?.debug?.(`Failed to collect dynamic skills: ${err?.message || err}`)
    }
    return skills
  }

  async syncTelegramCommands() {
    const tgAdapter = this.adapters.get('telegram')
    if (!tgAdapter || typeof tgAdapter.registerCommands !== 'function') return
    const baseCommands = this.config.telegram?.commands || []
    const dynamicSkills = this.collectDynamicSkills()
    const merged = mergeDynamicCommands(baseCommands, dynamicSkills, 100)
    try {
      await tgAdapter.registerCommands(merged)
      this.ctx.logger?.info?.(`Synced ${merged.length} Telegram commands (including ${dynamicSkills.length} dynamic skills)`)
    } catch (err) {
      this.ctx.logger?.warn?.(`Failed to sync Telegram commands: ${err?.message || err}`)
    }
  }

  async mirrorSessionToForumTopic(session) {
    if (!session || !session.id) return
    const sessionId = String(session.id)
    if (sessionId.startsWith('msgw-')) return
    if (this.sessionToThread.has(sessionId)) return

    const tgCfg = this.config.telegram || {}
    if (!tgCfg.forumMirrorEnabled || !tgCfg.forumMirrorChatId) return

    const tgAdapter = this.adapters.get('telegram')
    if (!tgAdapter || typeof tgAdapter.createForumTopic !== 'function') return

    const forumChatId = tgCfg.forumMirrorChatId
    const title = String(session.title || session.meta?.name || `Session ${sessionId.slice(0, 8)}`).slice(0, 120)

    try {
      const topic = await tgAdapter.createForumTopic(forumChatId, title)
      const threadId = topic?.message_thread_id
      if (!threadId) return

      const threadKey = `${forumChatId}:${threadId}`
      this.sessionToThread.set(sessionId, { chatId: forumChatId, threadId })
      this.threadToSession.set(threadKey, sessionId)

      const text = t('mirror.created', { sessionId, title }, 'en')
      await tgAdapter.sendTo(forumChatId, { text }, { threadId })
      this.ctx.logger?.info?.(`Mirrored session ${sessionId} to Telegram forum topic ${threadId} in ${forumChatId}`)
    } catch (err) {
      this.ctx.logger?.warn?.(`Failed to mirror session ${sessionId} to forum topic: ${err?.message || err}`)
    }
  }

  async relayTurnToForumMirror(session, event) {
    if (!session || !session.id) return
    const sessionId = String(session.id)
    const threadInfo = this.sessionToThread.get(sessionId)
    if (!threadInfo) return
    if (this.pending.has(sessionId)) return

    const tgAdapter = this.adapters.get('telegram')
    if (!tgAdapter) return

    const messages = Array.isArray(session.messages)
      ? session.messages
      : (Array.isArray(session.history) ? session.history : [])

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const role = msg.role || (msg.type === 'user' ? 'user' : 'assistant')
      if (role === 'assistant') {
        let text = ''
        if (typeof msg.content === 'string') text = msg.content
        else if (Array.isArray(msg.content)) {
          text = msg.content
            .map((p) => (typeof p === 'string' ? p : (p?.text || '')))
            .filter(Boolean)
            .join('\n')
        } else if (msg.text) text = msg.text
        const clean = stripReasoningPreamble(stripImageUrls(text)).trim()
        if (clean) {
          const maxLen = Number(this.config.agent?.maxMessageLength) || 4000
          const chunks = splitText(clean, maxLen)
          for (const chunk of chunks) {
            await tgAdapter.sendTo(threadInfo.chatId, { text: chunk }, { threadId: threadInfo.threadId })
          }
        }
        break
      }
    }
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
    try {
      const chat = this.chats.get(chatKeyValue)
      if (!chat?.target) return next()
      const tool = req.toolName || 'tool'
      if (chat.sessionAllowlist?.has(tool)) {
        return 'allowed-once'
      }
      const locale = this.resolveLocale(chat.target)
      const reason = req.reason ? `\n<i>${req.reason}</i>` : ''
      let detail = ''
      if (req.input && typeof req.input === 'object') {
        try {
          const jsonStr = JSON.stringify(req.input, null, 2)
          detail = `\n<pre><code>${jsonStr.slice(0, 500)}</code></pre>`
        } catch {}
      }
      const text = t('ask.confirm_title', { tool, reason: reason + detail }, locale)
      const buttons = [
        [
          { id: 'allow_once', text: t('ask.allow_once', {}, locale) },
          { id: 'allow_session', text: t('ask.allow_session', {}, locale) },
          { id: 'deny', text: t('ask.deny', {}, locale) },
        ],
      ]
      const result = await this.messengerAsk(chat.target, { text, buttons }, 300_000)
      if (result?.buttonId === 'allow_once' || result?.buttonId === 'allow') return 'allowed-once'
      if (result?.buttonId === 'allow_session') {
        if (!chat.sessionAllowlist) chat.sessionAllowlist = new Set()
        chat.sessionAllowlist.add(tool)
        return 'allowed-once'
      }
      if (result?.buttonId === 'deny') return 'rejected'
      return next()
    } catch {
      return next()
    }
  }

  async buildUserContent(input, signal) {
    const { text, attachments = [], replyText, steer, personaOverride } = input
    const parts = []
    parts.push(String(this.config.agent?.instructionPrefix || MESSENGER_RELAY_INSTRUCTION))
    const activePersonaId = personaOverride || this.personas.getPersonaForChat(input.chatId, input.threadId)
    const activePersona = getPersona(activePersonaId)
    if (activePersona?.instruction) {
      parts.push(`[Persona: ${activePersona.name} (${activePersona.icon})]\n${activePersona.instruction}`)
    }
    if (steer) parts.push('[Steer / addition to current turn: combine with previous instruction, do not restart from scratch]')
    if (replyText?.trim()) parts.push(`[Replying to message: ${replyText.trim()}]`)
    const blocks = []
    for (const att of attachments) {
      if (att.kind === 'photo' || (att.kind === 'sticker' && att.mime?.startsWith('image/'))) {
        try {
          const { ref } = await attachInboundPhoto(this.ctx, att, {
            signal,
            maxBytes: Number(this.config.media?.maxImageBytes) || 20 * 1024 * 1024,
          })
          blocks.push({ type: 'image', attachment: ref })
          if (att.kind === 'sticker' && att.emoji) parts.push(`[Sticker ${att.emoji}]`)
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          parts.push(`[Failed to attach image: ${msg}]`)
        }
      } else if (att.kind === 'voice' || att.kind === 'audio') {
        try {
          const bytes = new Uint8Array(await readFile(att.path))
          const transcript = await transcribeVoice(this.baseUrl(), bytes, att.mime || 'audio/ogg', 'message', signal)
          parts.push(transcript ? `[Voice message transcript: ${transcript}]` : '[Voice message (unrecognized)]')
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          this.ctx.logger?.warn?.(`voice: ${msg}`)
          parts.push(`[Voice message (dsh-voice unavailable: ${msg})]`)
        }
      } else if (att.kind === 'document' || att.kind === 'video' || att.kind === 'animation' || att.kind === 'sticker') {
        let parsed = null
        if (att.kind === 'document' && att.path) {
          try {
            const maxDocBytes = Number(this.config.media?.maxTextInjectBytes) || 100 * 1024
            parsed = await parseDocument(att.path, { maxBytes: maxDocBytes })
          } catch {}
        }
        parts.push(formatInboundDocument(att, parsed))
      } else {
        parts.push(`[File: ${att.path}${att.name ? ` (${att.name})` : ''}]`)
      }
    }
    const photoHint = photoOnlyHint(attachments, text)
    if (photoHint) parts.push(photoHint)
    const docHint = documentOnlyHint(attachments, text)
    if (docHint) parts.push(docHint)
    if (text?.trim()) parts.push(text.trim())
    const textBlock = parts.filter(Boolean).join('\n\n')
    if (textBlock) blocks.unshift({ type: 'text', text: textBlock })
    if (!blocks.length) blocks.push({ type: 'text', text: '(empty message)' })
    return blocks
  }

  async runTurn(chat, input, signal) {
    const { reply, typing, startStream, startProgress, react, inboundWasVoice, userId } = input
    chat.turnActive = true
    const sessionId = chat.agent.session.id
    const tg = this.tg()
    const streaming = tg.streaming === true && typeof startStream === 'function'
    const progressEnabled = tg.progressEnabled !== false
    const collector = { parts: [], lastText: '', streamText: '', toolName: '', images: [], reason: undefined, onStream: undefined }
    this.pending.set(sessionId, collector)
    let stopTyping = () => {}
    let stream = null
    let scheduler = null
    let progress = null
    try {
      if (signal.aborted) return
      if (typeof react === 'function' && tg.reactionsEnabled !== false) {
        react('👀').catch?.(() => {})
      }
      if (typeof typing === 'function') stopTyping = startTypingHeartbeat(typing, 4000)
      if (streaming) {
        try {
          stream = await startStream()
          scheduler = createEditScheduler((text) => stream.edit(text), Number(tg.streamEditIntervalMs) || 1200)
          collector.onStream = (text, toolName) => {
            if (text) stopTyping()
            if (!progressEnabled && !text) return
            scheduler.push(buildStreamPreview(text, progressEnabled ? toolName : ''))
          }
          if (progressEnabled) scheduler.push(buildStreamPreview('', ''))
        } catch (e) {
          this.ctx.logger?.warn?.(`stream start: ${e.message}`)
          stream = null
        }
      } else if (progressEnabled && typeof startProgress === 'function') {
        try {
          progress = await startProgress()
          const editProgress = createEditScheduler((text) => progress.edit(text), 800)
          collector.onStream = (_text, toolName) => {
            editProgress.push(formatProgressLine(toolName))
          }
        } catch (e) {
          this.ctx.logger?.warn?.(`progress start: ${e.message}`)
          progress = null
        }
      }


      const content = await this.buildUserContent(input, signal)
      chat.agent.followup(createUserMessage({
        content: ensureContentArray(content),
        source: { kind: 'user', plugin: PLUGIN, form: 'relay', origin: 'telegram' },
      }))
      const turnTimeoutMs = Number(this.config.agent?.turnTimeoutMs) || 600_000
      await whenIdleWithTimeout(chat.agent, turnTimeoutMs, signal)
      if (signal.aborted) {
        if (progress) try { await progress.remove() } catch {}
        if (typeof react === 'function') react('').catch?.(() => {})
        const stoppedMsg = t('msg.turn_stopped', {}, this.resolveLocale(input))
        if (stream) try { await stream.finalize(stoppedMsg) } catch {}
        else return reply(stoppedMsg)
        return
      }
      const sessions = this.ctx.get?.('sessions') || this.ctx.sessions
      await sessions?.flush?.(chat.agent.session)
      if (progress) try { await progress.remove() } catch {}
      progress = null
      if (typeof react === 'function') react('').catch?.(() => {})
      const rawAnswer = stripReasoningPreamble(stripImageUrls(collector.lastText || collector.streamText || collector.parts.join('\n\n')))
      const processed = processDiagramsAndTables(rawAnswer, {
        artifactPreviews: this.tg().artifactPreviews !== false,
      })
      const answer = processed.text
      if (collector.reason?.kind === 'error') {
        const err = collector.reason.error
        const msg = t('msg.agent_error', { code: err?.code || 'error', message: err?.message || 'unknown' }, this.resolveLocale(input))
        this.sendAlert('error', {
          code: err?.code || 'AGENT_ERROR',
          message: err?.message || 'unknown',
          sessionId,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch(() => {})
        if (stream) { await scheduler?.flush(); await stream.finalize(msg) }
        else await reply(msg)
        return
      }
      const files = await buildOutboundFiles(this.ctx, this.baseUrl(), collector, { signal, logger: this.ctx.logger })
      const allFiles = [...files, ...(processed.files || [])]
      if (!answer && !allFiles.length) {
        const noResp = t('msg.no_response', {}, this.resolveLocale(input))
        if (stream) { await scheduler?.flush(); await stream.finalize(noResp) }
        else await reply(noResp)
        return
      }
      const maxLen = Number(this.config.agent?.maxMessageLength) || 4000
      const chunks = answer ? splitText(answer, maxLen) : ['']
      if (stream) {
        await scheduler?.flush()
        await stream.finalize(chunks[0] || t('msg.no_response', {}, this.resolveLocale(input)))
        for (let i = 1; i < chunks.length; i++) await reply({ text: chunks[i] })
        if (allFiles.length) await reply({ files: allFiles })
      } else {
        for (let i = 0; i < chunks.length; i++) {
          await reply({ text: chunks[i] || undefined, files: i === 0 ? allFiles : [] })
        }
      }
      const chatTtsPref = this.chatTts.get(chat.target?.chatId)
      const speak = shouldSpeakReply({
        globalTts: Boolean(this.config.tts?.enabled),
        voiceMode: this.tg().voiceMode || 'mirror',
        inboundWasVoice: Boolean(inboundWasVoice),
        userPref: this.voicePrefs.get(userId),
        chatPref: chatTtsPref,
      })
      if (speak && !signal.aborted) {
        const isVoiceSummary = this.config.tts?.voiceSummary === true
        const ttsText = prepareTtsText(answer, this.config.tts?.maxChars, { voiceSummary: isVoiceSummary })
        if (ttsText) {
          try {
            const spoken = await speakText(this.baseUrl(), ttsText, signal)
            const voiceFile = await toTelegramVoiceFile(spoken, { logger: this.ctx.logger })
            if (!signal.aborted && voiceFile) await reply({ files: [voiceFile] })
          } catch (e) {
            if (!signal?.aborted) this.ctx.logger?.warn?.(`tts: ${e.message}`)
          }
        }
      }
    } catch (err) {
      if (!signal?.aborted) {
        this.sendAlert('error', {
          code: err?.code || 'EXCEPTION',
          message: err?.message || String(err),
          sessionId,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch(() => {})
        try {
          const excMsg = t('msg.exception', { message: err.message }, this.resolveLocale(input))
          if (stream) await stream.finalize(excMsg)
          else await reply(excMsg)
        } catch {}
      }
    } finally {
      stopTyping()
      if (progress) try { await progress.remove() } catch {}
      if (typeof react === 'function') react('').catch?.(() => {})
      chat.turnActive = false
      chat.abort = undefined
      this.pending.delete(sessionId)
    }
  }

  reapIdle() {
    const rawTimeout = Number(this.config.agent?.idleTimeoutMs)
    const timeout = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 86_400_000
    const now = Date.now()
    for (const [key, chat] of this.chats) {
      if (!chat.turnActive && now - chat.lastUsed > timeout) {
        if (chat.agent?.session?.id) {
          this.sessionToChat.delete(String(chat.agent.session.id))
        }
        this.chats.delete(key)
        chat.dispose().catch(() => {})
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
