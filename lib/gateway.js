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
import { formatInboundDocument, documentOnlyHint } from './documents.js'
import { collectAssistantParts, buildOutboundFiles, stripImageUrls } from './outbound.js'
import { assistantText, splitText, stripReasoningPreamble, MESSENGER_RELAY_INSTRUCTION } from './text.js'
import { chatKey } from './topics.js'
import { prepareTtsText, voiceReplyFile } from './tts.js'
import {
  makeAskToken, buildInlineKeyboard, indexCallbacks, releaseCallbacks,
  parseCallbackData, targetMatchesAsk, rejectPendingAsk, REMOVE_KEYBOARD,
} from './ask.js'
import { createPairingStore } from './pairing.js'
import {
  extractTextDelta, extractToolName, buildStreamPreview,
  createEditScheduler, startTypingHeartbeat,
} from './stream.js'

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
    this.pending = new Map()
    this.pendingAsks = new Map()
    this.adapters = new Map()
    this.adapterList = []
    this.disposeListener = undefined
    this.idleTimer = undefined
    this.callbackIndex = new Map()
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    this.pairing = createPairingStore(join(home, 'messenger-gateway', 'pairing.json'))
  }

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

  resolveHomeTarget(platform = 'telegram') {
    const tg = this.tg()
    const chatId = tg.homeChatId
    if (chatId === undefined || chatId === null || String(chatId).trim() === '') return null
    const out = { platform, chatId }
    const threadId = Number(tg.homeThreadId) || 0
    if (threadId > 0) out.threadId = threadId
    return out
  }

  async start() {
    this.disposeListener = this.ctx.on('session/event', (session, event) => {
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
        this.ctx.logger?.info?.(`dsh-messenger-gateway: ${adapter.name} started`)
      } catch (err) {
        this.ctx.logger?.warn?.(`dsh-messenger-gateway: ${adapter.name}: ${err.message}`)
      }
    }
    const idleMs = Number(this.config.agent?.idleTimeoutMs) || 0
    if (idleMs > 0) {
      this.idleTimer = setInterval(() => this.reapIdle(), Math.min(idleMs, 60_000))
      this.idleTimer.unref?.()
    }
  }

  stop() {
    if (this.disposeListener) this.disposeListener()
    if (this.idleTimer) clearInterval(this.idleTimer)
    for (const a of this.adapterList) { try { a.stop() } catch {} }
    this.adapterList = []
    this.adapters.clear()
    for (const chat of this.chats.values()) chat.dispose().catch(() => {})
    this.chats.clear()
    this.sessionToChat.clear()
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
      const home = this.resolveHomeTarget(resolved.platform)
      if (!home) throw new Error('target.chatId required (or set telegram home channel)')
      resolved = { ...home, ...resolved, chatId: home.chatId, threadId: resolved.threadId ?? home.threadId }
    }
    const adapter = this.getAdapter(resolved.platform)
    if (!adapter?.sendTo) throw new Error(`adapter ${resolved.platform} unavailable`)
    await adapter.sendTo(resolved.chatId, payload, { threadId: resolved.threadId })
  }

  async messengerAsk(target, payload, timeoutMs = 300_000) {
    const adapter = this.getAdapter(target.platform)
    if (!adapter) throw new Error(`adapter ${target.platform} unavailable`)
    const token = makeAskToken()
    const { replyMarkup, callbackKeys } = buildInlineKeyboard(token, payload.buttons || [])
    indexCallbacks(this.callbackIndex, callbackKeys, token)
    await adapter.sendTo(target.chatId, { text: payload.text, replyMarkup }, { threadId: target.threadId })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAsks.delete(token)
        releaseCallbacks(this.callbackIndex, callbackKeys)
        reject(new Error('messenger.ask timed out'))
      }, timeoutMs)
      timer.unref?.()
      this.pendingAsks.set(token, { resolve, reject, timer, target, callbackKeys })
    })
  }

  async messengerProgress(target, payload) {
    await this.messengerSend(target, { text: payload.text })
  }

  async handleUnauthorized(input) {
    const { reply, userId, username } = input
    if (!this.tg().pairingEnabled) {
      await reply('Доступ закрыт. Попросите владельца добавить ваш id в allowlist.')
      return
    }
    try {
      const { code } = this.pairing.requestCode(userId, { username })
      await reply(`Нет доступа.\nВаш id: ${userId}\nКод сопряжения: ${code}\n\nВладелец должен отправить боту:\n/pair ${code}`)
    } catch (err) {
      if (err.code === 'RATE_LIMIT') await reply('Код уже выдан. Подождите или попросите владельца /pair.')
      else await reply(`Не удалось выдать код: ${err.message}`)
    }
  }

  async handleCallback(cb) {
    const indexed = this.callbackIndex.get(cb.data)
    const { token, buttonId } = parseCallbackData(cb.data)
    const askToken = indexed || token
    if (askToken && this.pendingAsks.has(askToken)) {
      const pending = this.pendingAsks.get(askToken)
      if (!targetMatchesAsk(pending, cb)) {
        await cb.answer('Кнопка для другого чата')
        return
      }
      clearTimeout(pending.timer)
      this.pendingAsks.delete(askToken)
      releaseCallbacks(this.callbackIndex, pending.callbackKeys)
      await cb.answer('OK')
      try { await cb.editMessage(cb.message?.text || 'Выбрано', REMOVE_KEYBOARD) } catch {}
      pending.resolve({ buttonId, data: cb.data })
      return
    }
    await cb.answer()
  }

  async handleMessage(input) {
    const { platform, chatId, threadId = 0, text, reply } = input
    const key = chatKey(platform, chatId, threadId)
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
        const msg = n === 1
          ? 'Медиа получено. Напишите вопрос — например: «что на фото?»'
          : `Получено ${n} вложений. Напишите вопрос.`
        return reply(msg)
      }
      if (chat.pendingMedia?.length) {
        attachments = [...chat.pendingMedia, ...attachments]
        chat.pendingMedia = []
      }
      const turnInput = { ...input, text: body, attachments }
      if (chat.abort) {
        chat.abort.abort()
        releaseChatTurn(chat)
      }
      chat.abort = new AbortController()
      const run = chat.busy.then(() => this.runTurn(chat, turnInput, chat.abort.signal))
      chat.busy = run.catch(() => {})
      await run
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: message: ${msg}`)
      try { await reply(`Ошибка: ${msg}`) } catch {}
    }
  }

  async handleCommand(key, text, input) {
    const parts = text.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const { reply, userId, chatId, threadId = 0, platform } = input
    if (cmd === '/start') return reply('Шлюз подключён. Пишите сообщение агенту. /help — команды.')
    if (cmd === '/help') {
      return reply(['Команды:', '/help — справка', '/new — новая сессия', '/whoami — ваш id', '/stop — прервать текущий ответ', '/pair CODE — одобрить пользователя', '/sethome — этот чат = home', '/home — показать home'].join('\n'))
    }
    if (cmd === '/new') {
      const chat = this.chats.get(key)
      if (chat) {
        if (chat.abort) chat.abort.abort()
        chat.pendingMedia = []
        this.sessionToChat.delete(String(chat.agent.session.id))
        this.chats.delete(key)
        await chat.dispose()
        return reply('Сессия сброшена.')
      }
      return reply('Активной сессии нет.')
    }
    if (cmd === '/whoami') return reply(`Ваш id: ${userId}`)
    if (cmd === '/stop') {
      const chat = this.chats.get(key)
      if (chat?.abort) { chat.abort.abort(); releaseChatTurn(chat); return reply('Прерывание отправлено.') }
      return reply('Нечего прерывать.')
    }
    if (cmd === '/pair') {
      if (!this.isUserAllowed(userId)) return reply('Только пользователи из allowlist могут одобрять /pair.')
      const code = parts[1]
      if (!code) return reply('Использование: /pair CODE')
      const res = this.pairing.approveCode(code, userId)
      if (!res.ok) return reply(`Не удалось: ${res.error}`)
      const merged = this.effectiveAllowedIds()
      for (const a of this.adapterList) a.setAllowedUserIds?.(merged)
      try { await this.hooks?.persistAllowedUserIds?.(merged) } catch (e) {
        this.ctx.logger?.warn?.(`persist allowlist: ${e.message}`)
      }
      return reply(`Одобрен user id ${res.userId}${res.username ? ` (@${res.username})` : ''}.`)
    }
    if (cmd === '/sethome') {
      if (!this.isUserAllowed(userId)) return reply('Нет доступа.')
      try {
        await this.hooks?.persistHome?.({ chatId, threadId })
        this.config.telegram = { ...this.tg(), homeChatId: chatId, homeThreadId: threadId || 0 }
        return reply(`Home: chat ${chatId}${threadId ? ` topic ${threadId}` : ''}`)
      } catch (e) {
        return reply(`Не удалось сохранить home: ${e.message}`)
      }
    }
    if (cmd === '/home') {
      const home = this.resolveHomeTarget(platform || 'telegram')
      if (!home) return reply('Home не задан. Отправьте /sethome в нужном чате.')
      return reply(`Home: chat ${home.chatId}${home.threadId ? ` topic ${home.threadId}` : ''}`)
    }
    return reply(`Неизвестная команда ${cmd}. /help`)
  }

  async getOrCreateChat(key, input) {
    let chat = this.chats.get(key)
    if (!chat) { chat = await this.createChat(key, input); this.chats.set(key, chat) }
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
      throw new Error('Выберите модель в Settings → Models (или укажите agent.provider/model в профиле)')
    }
    return { provider: provider || selection.provider, model: model || selection.model }
  }

  async createChat(key, input) {
    const { provider, model } = this.resolveAgentModel()
    const agentCfg = this.config.agent || {}
    const cwd = agentCfg.cwd || process.cwd()
    const self = this
    const handle = await this.ctx.agents.create({
      sessionId: SessionId(`msgw-${randomUUID()}`),
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
      lastUsed: Date.now(), abort: undefined, pendingMedia: [],
      target: input ? { platform: input.platform, chatId: input.chatId, threadId: input.threadId || 0 } : undefined,
    }
    this.sessionToChat.set(String(handle.agent.session.id), key)
    return chat
  }

  async answerApproval(chatKeyValue, req, next) {
    try {
      const chat = this.chats.get(chatKeyValue)
      if (!chat?.target) return next()
      const tool = req.toolName || 'tool'
      const reason = req.reason ? `\n${req.reason}` : ''
      const result = await this.messengerAsk(chat.target, {
        text: `⚠️ Нужно подтверждение\nИнструмент: ${tool}${reason}`,
        buttons: [[{ id: 'allow', text: '✅ Разрешить' }, { id: 'deny', text: '❌ Отклонить' }]],
      }, 300_000)
      if (result?.buttonId === 'allow') return 'allowed-once'
      if (result?.buttonId === 'deny') return 'rejected'
      return next()
    } catch {
      return next()
    }
  }

  async buildUserContent(input, signal) {
    const { text, attachments = [], replyText } = input
    const parts = []
    parts.push(String(this.config.agent?.instructionPrefix || MESSENGER_RELAY_INSTRUCTION))
    if (replyText?.trim()) parts.push(`[Ответ на сообщение: ${replyText.trim()}]`)
    const blocks = []
    for (const att of attachments) {
      if (att.kind === 'photo' || (att.kind === 'sticker' && att.mime?.startsWith('image/'))) {
        try {
          const { ref } = await attachInboundPhoto(this.ctx, att, {
            signal,
            maxBytes: Number(this.config.media?.maxImageBytes) || 20 * 1024 * 1024,
          })
          blocks.push({ type: 'image', attachment: ref })
          if (att.kind === 'sticker' && att.emoji) parts.push(`[Стикер ${att.emoji}]`)
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          parts.push(`[Не удалось приложить изображение: ${msg}]`)
        }
      } else if (att.kind === 'voice' || att.kind === 'audio') {
        try {
          const bytes = new Uint8Array(await readFile(att.path))
          const transcript = await transcribeVoice(this.baseUrl(), bytes, att.mime || 'audio/ogg', 'message', signal)
          parts.push(transcript ? `[Голосовое сообщение, расшифровка: ${transcript}]` : '[Голосовое сообщение (не удалось распознать)]')
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          this.ctx.logger?.warn?.(`voice: ${msg}`)
          parts.push(`[Голосовое сообщение (dsh-voice недоступен: ${msg})]`)
        }
      } else if (att.kind === 'document' || att.kind === 'video' || att.kind === 'animation' || att.kind === 'sticker') {
        parts.push(formatInboundDocument(att))
      } else {
        parts.push(`[Файл: ${att.path}${att.name ? ` (${att.name})` : ''}]`)
      }
    }
    const photoHint = photoOnlyHint(attachments, text)
    if (photoHint) parts.push(photoHint)
    const docHint = documentOnlyHint(attachments, text)
    if (docHint) parts.push(docHint)
    if (text?.trim()) parts.push(text.trim())
    const textBlock = parts.filter(Boolean).join('\n\n')
    if (textBlock) blocks.unshift({ type: 'text', text: textBlock })
    if (!blocks.length) blocks.push({ type: 'text', text: '(пустое сообщение)' })
    return blocks
  }

  async runTurn(chat, input, signal) {
    const { reply, typing, startStream } = input
    const sessionId = chat.agent.session.id
    const tg = this.tg()
    const streaming = tg.streaming !== false && typeof startStream === 'function'
    const progressEnabled = tg.progressEnabled !== false
    const collector = { parts: [], lastText: '', streamText: '', toolName: '', images: [], reason: undefined, onStream: undefined }
    this.pending.set(sessionId, collector)
    let stopTyping = () => {}
    let stream = null
    let scheduler = null
    try {
      if (signal.aborted) return
      if (progressEnabled) stopTyping = startTypingHeartbeat(typing, 4000)
      if (streaming) {
        try {
          stream = await startStream()
          scheduler = createEditScheduler((text) => stream.edit(text), Number(tg.streamEditIntervalMs) || 1200)
          collector.onStream = (text, toolName) => {
            if (!progressEnabled && !text) return
            scheduler.push(buildStreamPreview(text, progressEnabled ? toolName : ''))
          }
          if (progressEnabled) scheduler.push(buildStreamPreview('', ''))
        } catch (e) {
          this.ctx.logger?.warn?.(`stream start: ${e.message}`)
          stream = null
        }
      } else if (typing) {
        await typing()
      }

      const content = await this.buildUserContent(input, signal)
      chat.agent.followup(createUserMessage({
        content,
        source: { kind: 'plugin', plugin: PLUGIN, form: 'relay' },
      }))
      const turnTimeoutMs = Number(this.config.agent?.turnTimeoutMs) || 600_000
      await whenIdleWithTimeout(chat.agent, turnTimeoutMs, signal)
      if (signal.aborted) {
        if (stream) try { await stream.finalize('Прервано.') } catch {}
        else return reply('Прервано.')
        return
      }
      await this.ctx.sessions.flush(chat.agent.session)
      const answer = stripReasoningPreamble(stripImageUrls(collector.lastText || collector.streamText || collector.parts.join('\n\n')))
      if (collector.reason?.kind === 'error') {
        const err = collector.reason.error
        const msg = `Ошибка агента: ${err?.code || 'error'}: ${err?.message || 'unknown'}`
        if (stream) { await scheduler?.flush(); await stream.finalize(msg) }
        else await reply(msg)
        return
      }
      const files = await buildOutboundFiles(this.ctx, this.baseUrl(), collector, { signal, logger: this.ctx.logger })
      if (!answer && !files.length) {
        if (stream) { await scheduler?.flush(); await stream.finalize('(нет ответа)') }
        else await reply('(нет ответа)')
        return
      }
      const maxLen = Number(this.config.agent?.maxMessageLength) || 4000
      const chunks = answer ? splitText(answer, maxLen) : ['']
      if (stream) {
        await scheduler?.flush()
        await stream.finalize(chunks[0] || '(нет ответа)')
        for (let i = 1; i < chunks.length; i++) await reply({ text: chunks[i] })
        if (files.length) await reply({ files })
      } else {
        for (let i = 0; i < chunks.length; i++) {
          await reply({ text: chunks[i] || undefined, files: i === 0 ? files : [] })
        }
      }
      if (this.config.tts?.enabled && !signal.aborted) {
        const ttsText = prepareTtsText(answer, this.config.tts?.maxChars)
        if (ttsText) {
          try {
            const spoken = await speakText(this.baseUrl(), ttsText, signal)
            if (!signal.aborted) await reply({ files: [voiceReplyFile(spoken)] })
          } catch (e) {
            if (!signal?.aborted) this.ctx.logger?.warn?.(`tts: ${e.message}`)
          }
        }
      }
    } catch (err) {
      if (!signal?.aborted) {
        try {
          if (stream) await stream.finalize(`Сбой: ${err.message}`)
          else await reply(`Сбой: ${err.message}`)
        } catch {}
      }
    } finally {
      stopTyping()
      this.pending.delete(sessionId)
    }
  }

  reapIdle() {
    const timeout = Number(this.config.agent?.idleTimeoutMs) || 0
    if (timeout <= 0) return
    const now = Date.now()
    for (const [key, chat] of this.chats) {
      if (now - chat.lastUsed > timeout) {
        this.sessionToChat.delete(String(chat.agent.session.id))
        this.chats.delete(key)
        chat.dispose().catch(() => {})
      }
    }
  }

  get messenger() {
    return {
      adapters: () => [...this.adapters.keys()],
      activeChats: () => this.chats.size,
      home: () => this.resolveHomeTarget('telegram'),
      send: (target, payload) => this.messengerSend(target, payload),
      ask: (target, payload, timeoutMs) => this.messengerAsk(target, payload, timeoutMs),
      progress: (target, payload) => this.messengerProgress(target, payload),
    }
  }
}
