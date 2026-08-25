import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import createAdapters from './adapters/index.js'
import { transcribeVoice, speakText } from './integrations.js'
import { attachInboundPhoto, photoOnlyHint } from './photos.js'
import { formatInboundDocument, documentOnlyHint } from './documents.js'
import { collectAssistantParts, buildOutboundFiles, stripImageUrls } from './outbound.js'
import { assistantText, splitText } from './text.js'
import { chatKey } from './topics.js'
import { prepareTtsText, voiceReplyFile } from './tts.js'
import {
  makeAskToken, buildInlineKeyboard, indexCallbacks, releaseCallbacks,
  parseCallbackData, targetMatchesAsk, rejectPendingAsk, REMOVE_KEYBOARD,
} from './ask.js'


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
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.chats = new Map()
    this.pending = new Map()
    this.pendingAsks = new Map()
    this.adapters = new Map()
    this.adapterList = []
    this.disposeListener = undefined
    this.idleTimer = undefined
    this.callbackIndex = new Map()
  }

  baseUrl() {
    const raw = String(this.config.internalBaseURL || '').trim()
    return raw || 'http://127.0.0.1:3080'
  }

  async start() {
    this.disposeListener = this.ctx.on('session/event', (session, event) => {
      const collector = this.pending.get(session.id)
      if (!collector) return
      if (event.type === 'assistant/message') {
        const msg = event.data.message
        const text = assistantText(msg)
        if (text) collector.parts.push(text)
        const extra = collectAssistantParts(msg)
        for (const img of extra.images) collector.images.push(img)
      } else if (event.type === 'turn/end') {
        collector.reason = event.data.reason
      }
    })
    const adapters = createAdapters({
      config: this.config,
      onMessage: (input) => this.handleMessage(input),
      onCallback: (cb) => this.handleCallback(cb),
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
    for (const pending of this.pendingAsks.values()) {
      releaseCallbacks(this.callbackIndex, pending.callbackKeys)
      rejectPendingAsk(pending, new Error('gateway stopped'))
    }
    this.pending.clear()
    this.pendingAsks.clear()
    this.callbackIndex.clear()
  }

  getAdapter(platform) {
    return this.adapters.get(platform)
  }

  async messengerSend(target, payload) {
    const adapter = this.getAdapter(target.platform)
    if (!adapter?.sendTo) throw new Error(`adapter ${target.platform} unavailable`)
    await adapter.sendTo(target.chatId, payload, { threadId: target.threadId })
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
        const pending = this.pendingAsks.get(token)
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
      try {
        await cb.editMessage(cb.message?.text || 'Выбрано', REMOVE_KEYBOARD)
      } catch {}
      pending.resolve({ buttonId, data: cb.data })
      return
    }
    await cb.answer()
  }

  async handleMessage(input) {
    const { platform, chatId, userId, threadId = 0, text, attachments = [], replyText, reply } = input
    const key = chatKey(platform, chatId, threadId)
    const body = String(text || '').trim()
    const hasMedia = attachments.length > 0
    if (!body && !hasMedia) return
    if (body.startsWith('/')) { await this.handleCommand(key, body, input); return }
    try {
      const chat = await this.getOrCreateChat(key)
      if (chat.abort) chat.abort.abort()
      chat.abort = new AbortController()
      const run = chat.busy.then(() => this.runTurn(chat, input, chat.abort.signal))
      chat.busy = run.catch(() => {})
      await run
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: message: ${msg}`)
      try { await reply(`Ошибка: ${msg}`) } catch {}
    }
  }

  async handleCommand(key, text, input) {
    const cmd = text.split(/\s+/)[0].toLowerCase()
    const { reply, userId } = input
    if (cmd === '/start') return reply('Шлюз подключён. Пишите сообщение агенту. /help — команды.')
    if (cmd === '/help') return reply(['Команды:', '/help — справка', '/new — новая сессия', '/whoami — ваш id', '/stop — прервать текущий ответ'].join('\n'))
    if (cmd === '/new') {
      const chat = this.chats.get(key)
      if (chat) { if (chat.abort) chat.abort.abort(); chat.pendingMedia = []; this.chats.delete(key); await chat.dispose(); return reply('Сессия сброшена.') }
      return reply('Активной сессии нет.')
    }
    if (cmd === '/whoami') return reply(`Ваш id: ${userId}`)
    if (cmd === '/stop') {
      const chat = this.chats.get(key)
      if (chat?.abort) { chat.abort.abort(); return reply('Прерывание отправлено.') }
      return reply('Нечего прерывать.')
    }
    return reply(`Неизвестная команда ${cmd}. /help`)
  }

  async getOrCreateChat(key) {
    let chat = this.chats.get(key)
    if (!chat) { chat = await this.createChat(key); this.chats.set(key, chat) }
    chat.lastUsed = Date.now()
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
    return {
      provider: provider || selection.provider,
      model: model || selection.model,
    }
  }

  async createChat(key) {
    const { provider, model } = this.resolveAgentModel()
    const agentCfg = this.config.agent || {}
    const cwd = agentCfg.cwd || process.cwd()
    const handle = await this.ctx.agents.create({
      sessionId: SessionId(`msgw-${randomUUID()}`),
      meta: { cwd },
      agentOptions: { provider, model },
      setup: (agentCtx) => {
        installModelSelection(agentCtx, { current: { provider, model }, assembled: undefined })
      },
    })
    await handle.agent.whenIdle()
    return { key, agent: handle.agent, dispose: handle.dispose, busy: Promise.resolve(), lastUsed: Date.now(), abort: undefined, pendingMedia: [] }
  }

  async buildUserContent(input, signal) {
    const { text, attachments = [], replyText } = input
    const parts = []
    if (this.config.agent?.instructionPrefix) parts.push(String(this.config.agent.instructionPrefix))
    if (replyText?.trim()) parts.push(`[Ответ на сообщение: ${replyText.trim()}]`)
    const blocks = []
    for (const att of attachments) {
      if (att.kind === 'photo') {
        try {
          const { ref } = await attachInboundPhoto(this.ctx, att, {
            signal,
            maxBytes: Number(this.config.media?.maxImageBytes) || 20 * 1024 * 1024,
          })
          blocks.push({ type: 'image', attachment: ref })
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
      } else if (att.kind === 'document' || att.kind === 'video') {
        parts.push(formatInboundDocument(att))
      } else {
        parts.push(`[Файл: ${att.path}${att.name ? ` (${att.name})` : ''}]`)
      }
    }
    const photoHint = photoOnlyHint(attachments, text)
    if (photoHint) parts.push(photoHint)
    if (text?.trim()) parts.push(text.trim())
    const textBlock = parts.filter(Boolean).join('\n\n')
    if (textBlock) blocks.unshift({ type: 'text', text: textBlock })
    if (!blocks.length) blocks.push({ type: 'text', text: '(пустое сообщение)' })
    return blocks
  }

  async runTurn(chat, input, signal) {
    const { reply, typing } = input
    const sessionId = chat.agent.session.id
    const collector = { parts: [], images: [], reason: undefined }
    this.pending.set(sessionId, collector)
    try {
      if (signal.aborted) return
      if (typing) await typing()
      const content = await this.buildUserContent(input, signal)
      chat.agent.followup(createUserMessage({
        content,
        source: { kind: 'plugin', plugin: PLUGIN, form: 'relay' },
      }))
      await chat.agent.whenIdle()
      if (signal.aborted) return reply('Прервано.')
      await this.ctx.sessions.flush(chat.agent.session)
      const answer = stripImageUrls(collector.parts.join('\n\n'))
      if (collector.reason?.kind === 'error') {
        const err = collector.reason.error
        return reply(`Ошибка агента: ${err?.code || 'error'}: ${err?.message || 'unknown'}`)
      }
      const files = await buildOutboundFiles(this.ctx, this.baseUrl(), collector, { signal, logger: this.ctx.logger })
      if (!answer && !files.length) return reply('(нет ответа)')
      const maxLen = Number(this.config.agent?.maxMessageLength) || 4000
      const chunks = answer ? splitText(answer, maxLen) : ['']
      for (let i = 0; i < chunks.length; i++) {
        await reply({ text: chunks[i] || undefined, files: i === 0 ? files : [] })
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
        try { await reply(`Сбой: ${err.message}`) } catch {}
      }
    } finally {
      this.pending.delete(sessionId)
    }
  }

  reapIdle() {
    const timeout = Number(this.config.agent?.idleTimeoutMs) || 0
    if (timeout <= 0) return
    const now = Date.now()
    for (const [key, chat] of this.chats) {
      if (now - chat.lastUsed > timeout) { this.chats.delete(key); chat.dispose().catch(() => {}) }
    }
  }

  get messenger() {
    return {
      adapters: () => [...this.adapters.keys()],
      activeChats: () => this.chats.size,
      send: (target, payload) => this.messengerSend(target, payload),
      ask: (target, payload, timeoutMs) => this.messengerAsk(target, payload, timeoutMs),
      progress: (target, payload) => this.messengerProgress(target, payload),
    }
  }
}
