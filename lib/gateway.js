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
import { createPairingStore } from './pairing.js'
import {
  extractTextDelta, extractToolName, buildStreamPreview, formatProgressLine,
  createEditScheduler, startTypingHeartbeat,
} from './stream.js'
import { isTopicGoneError } from './telegram-errors.js'

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
    this.voicePrefs = createVoicePrefs(join(home, 'messenger-gateway', 'voice-prefs.json'))
    this.chatTts = createVoicePrefs(join(home, 'messenger-gateway', 'chat-tts.json'))
    this.muted = createVoicePrefs(join(home, 'messenger-gateway', 'muted.json'))
    this.personas = createPersonaStore(join(home, 'messenger-gateway', 'personas.json'))
    this.stats = { sent: 0, errors: 0, startedAt: Date.now() }
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
        if (adapter.name === 'telegram') this.tgAdapter = adapter
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
            else await cb.editMessage(cb.message?.text || 'Выбор', nextKb.replyMarkup)
          } catch {}
          await cb.answer(pending.selected.has(action.id) ? 'Выбрано' : 'Снято')
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
            else await cb.editMessage(cb.message?.text || 'Выбор', nextKb.replyMarkup)
          } catch {}
          await cb.answer()
          return
        }
        if (action.kind === 'done') {
          clearTimeout(pending.timer)
          this.pendingAsks.delete(askToken)
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          await cb.answer('OK')
          try { await cb.editMessage(cb.message?.text || 'Выбрано', REMOVE_KEYBOARD) } catch {}
          pending.resolve({ buttonId: 'done', selected: Array.from(pending.selected), data: cb.data })
          return
        }
        if (action.kind === 'cancel') {
          clearTimeout(pending.timer)
          this.pendingAsks.delete(askToken)
          releaseCallbacks(this.callbackIndex, pending.callbackKeys)
          await cb.answer('Отменено')
          try { await cb.editMessage(cb.message?.text || 'Отменено', REMOVE_KEYBOARD) } catch {}
          pending.resolve({ buttonId: 'cancel', selected: [], data: cb.data })
          return
        }
      }
      clearTimeout(pending.timer)
      this.pendingAsks.delete(askToken)
      releaseCallbacks(this.callbackIndex, pending.callbackKeys)
      await cb.answer('OK')
      try { await cb.editMessage(cb.message?.text || 'Выбрано', REMOVE_KEYBOARD) } catch {}
      pending.resolve({ buttonId: action.id || buttonId, data: cb.data })
      return
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
        const msg = n === 1
          ? 'Медиа получено. Напишите вопрос — например: «что на фото?»'
          : `Получено ${n} вложений. Напишите вопрос.`
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
        const steerText = body || (hasMedia ? '(дополнение: медиа)' : '')
        const content = await this.buildUserContent({
          ...turnInput,
          text: steerText,
          steer: true,
        }, undefined)
        chat.agent.followup(createUserMessage({
          content,
          source: { kind: 'plugin', plugin: PLUGIN, form: 'steer' },
        }))
        chat.lastUsed = Date.now()
        try { await reply('↪️ Добавлено к текущему ответу') } catch {}
        return
      }

      // Mark busy BEFORE yielding to the poll loop, otherwise steer/stop never see an active turn.
      chat.turnActive = true
      chat.abort = new AbortController()
      const run = chat.busy.then(() => this.runTurn(chat, turnInput, chat.abort.signal))
      chat.busy = run.catch(() => {})
      // Do NOT await: Telegram poll is sequential; awaiting blocked steer and /stop until the turn finished.
      run.catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        this.ctx.logger?.warn?.(`dsh-messenger-gateway: background turn: ${msg}`)
        chat.turnActive = false
        chat.abort = undefined
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.ctx.logger?.warn?.(`dsh-messenger-gateway: message: ${msg}`)
      try { await reply(`Ошибка: ${msg}`) } catch {}
    }
  }

  async handleCommand(key, text, input) {

    const parts = text.split(/\s+/)
    const cmd = parts[0].toLowerCase().split('@')[0]
    const { reply, userId, chatId, threadId = 0, platform } = input
    if (cmd === '/start') return reply('Шлюз подключён. Пишите сообщение агенту. /help — команды.')
    if (cmd === '/help') {
      return reply([
        'Команды:',
        '/help — справка',
        '/new — новая сессия',
        '/whoami — ваш id',
        '/stop — прервать текущий ответ',
        '/status — статус шлюза',
        '/model — текущая модель; /model provider model — сменить',
        '/role [name] — персоны и роли агента (/role list)',
        '/skills / /tools — список инструментов и навыков',
        '/fork — ответвление текущей сессии',
        '/export — выгрузка истории диалога в Markdown',
        '/rewind [N] — откат последних N сообщений',
        '/files [dir] — менеджер файлов в рабочей папке агента',
        '/get <path> — скачать файл из рабочей папки в Telegram',
        '/pair CODE — одобрить пользователя',
        '/sethome [name] — этот чат = home (имя опционально)',
        '/home — список home',
        '/voice on|off|status — голосовые ответы',
        '/tts on|off|status — озвучка в этом чате',
        '/mute / /unmute — заглушить уведомления в этот чат',
        '/keyboard on|off — быстрая клавиатура',
      ].join('\n'))
    }
    if (cmd === '/role' || cmd === '/persona') {
      const targetRole = parts[1]?.toLowerCase()
      if (!targetRole || targetRole === 'list') {
        const currentId = this.personas.get(chatId)
        const lines = [
          '🎭 <b>Доступные роли и персоны:</b>',
          '',
          ...listPersonas().map((p) => {
            const isCurrent = p.id === currentId ? ' (активна)' : ''
            return `${p.icon} <b>${p.id}</b> — ${p.name}: ${p.description}${isCurrent}`
          }),
          '',
          'Смена роли: <code>/role coder</code> (или /role reset)',
        ]
        return reply(lines.join('\n'))
      }
      if (targetRole === 'reset' || targetRole === 'default') {
        this.personas.set(chatId, 'default')
        return reply('🎭 Роль сброшена на стандартную (Default).')
      }
      const persona = getPersona(targetRole)
      if (!persona) {
        return reply(`Неизвестная роль "${targetRole}". Список: /role list`)
      }
      this.personas.set(chatId, persona.id)
      return reply(`🎭 Роль изменена на: ${persona.icon} <b>${persona.name}</b>\n${persona.description}`)
    }
    if (cmd === '/skills' || cmd === '/tools') {
      const toolsList = []
      if (this.ctx.tools?.tools) {
        for (const [name, t] of this.ctx.tools.tools.entries()) {
          toolsList.push(`• <b>${name}</b>: ${t.description || '(нет описания)'}`)
        }
      }
      if (!toolsList.length) {
        return reply('🛠️ <b>Инструменты агента:</b>\n(нет зарегистрированных инструментов)')
      }
      return reply([
        '🛠️ <b>Активные инструменты и скиллы:</b>',
        '',
        ...toolsList,
      ].join('\n'))
    }
    if (cmd === '/export') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply('Нет активной сессии для экспорта.')
      }
      try {
        const { filename, buffer, messagesCount } = exportSessionToMarkdown(chat.agent.session)
        if (!messagesCount) {
          return reply('Сессия пуста, нет сообщений для экспорта.')
        }
        const file = {
          name: filename,
          mime: 'text/markdown',
          kind: 'document',
          bytes: buffer,
          dataBase64: buffer.toString('base64'),
        }
        return reply({ text: `📄 Экспорт диалога (${messagesCount} сообщений):`, files: [file] })
      } catch (err) {
        return reply(`Ошибка экспорта: ${err.message}`)
      }
    }
    if (cmd === '/rewind') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply('Нет активной сессии для отката.')
      }
      const count = Number(parts[1]) || 1
      const res = rewindSession(chat.agent.session, count)
      if (!res.removed) {
        return reply('В истории сессии нет сообщений для отката.')
      }
      try { await this.ctx.sessions?.flush(chat.agent.session) } catch {}
      return reply(`⏪ Откачено сообщений: ${res.removed}. Осталось в контексте: ${res.remaining}.`)
    }
    if (cmd === '/fork') {
      const chat = this.chats.get(key)
      if (!chat?.agent?.session) {
        return reply('Нет активной сессии для форка.')
      }
      try {
        const oldSession = chat.agent.session
        const oldMessages = Array.isArray(oldSession.messages) ? [...oldSession.messages] : []
        const newChat = await this.createChat(key, input)
        if (newChat.agent?.session && oldMessages.length) {
          newChat.agent.session.messages = oldMessages
          try { await this.ctx.sessions?.flush(newChat.agent.session) } catch {}
        }
        this.chats.set(key, newChat)
        return reply(`🔀 Создан форк сессии!\nСтарая сессия: ${oldSession.id}\nНовая активная сессия: ${newChat.agent.session.id}\nКонтекст сохранён (${oldMessages.length} сообщений).`)
      } catch (err) {
        return reply(`Ошибка форка: ${err.message}`)
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
        return reply('Укажите имя файла для скачивания: <code>/get <файл></code>\nСписок: <code>/files</code>')
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
      return reply({ text: `📄 Файл: <b>${res.name}</b> (${formatFileSize(res.size)})`, files: [file] })
    }
    if (cmd === '/keyboard') {
      const sub = String(parts[1] || 'status').toLowerCase()
      const tgAdapter = this.getAdapter('telegram')
      if (sub === 'on' || sub === 'off') {
        if (tgAdapter) tgAdapter.quickActions = sub === 'on'
        return reply(sub === 'on' ? 'Быстрая клавиатура: включена.' : 'Быстрая клавиатура: выключена.', sub === 'off' ? { replyMarkup: { remove_keyboard: true } } : undefined)
      }
      const cur = tgAdapter?.quickActions !== false
      return reply(`Быстрая клавиатура: ${cur ? 'on' : 'off'}\nСмена: /keyboard on|off`)
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
    if (cmd === '/whoami') {
      const lines = [`Ваш id: ${userId}`]
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
        return reply('Прерывание отправлено.')
      }
      return reply('Нечего прерывать.')
    }
    if (cmd === '/status') {
      let modelLine = 'модель: (не задана)'
      try {
        const sel = this.resolveAgentModel()
        modelLine = `модель: ${sel.provider}/${sel.model}`
      } catch (e) {
        modelLine = `модель: ${e.message}`
      }
      const home = this.resolveHomeTarget(platform || 'telegram')
      const homeLine = home
        ? `home: chat ${home.chatId}${home.threadId ? ` topic ${home.threadId}` : ''}`
        : 'home: не задан'
      const pending = this.pairing.listPending().length
      const up = Math.max(0, Math.round((Date.now() - this.stats.startedAt) / 1000))
      const hh = String(Math.floor(up / 3600)).padStart(2, '0')
      const mm = String(Math.floor((up % 3600) / 60)).padStart(2, '0')
      const ss = String(up % 60).padStart(2, '0')
      return reply([
        'Messenger gateway',
        `адаптеры: ${[...this.adapters.keys()].join(', ') || '(нет)'}`,
        `активных чатов: ${this.chats.size}`,
        modelLine,
        homeLine,
        `pairing pending: ${pending}`,
        `transport: ${this.tg().transport || 'poll'}`,
        `sessionScope: ${this.config.agent?.sessionScope || 'user'}`,
        `доставлено: ${this.stats.sent}`,
        `ошибок: ${this.stats.errors}`,
        `polling conflict: ${this.tgAdapter?.pollingConflict ? 'да' : 'нет'}`,
        `uptime: ${hh}:${mm}:${ss}`,
      ].join('\n'))
    }
    if (cmd === '/model') {
      if (parts.length >= 3) {
        if (!this.isUserAllowed(userId)) return reply('Нет доступа.')
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
          return reply(`Модель сохранена: ${provider}/${model}`)
        } catch (e) {
          return reply(`Не удалось сменить модель: ${e.message}`)
        }
      }
      try {
        const sel = this.resolveAgentModel()
        return reply(`Текущая модель: ${sel.provider}/${sel.model}\nСмена: /model <provider> <model>`)
      } catch (e) {
        return reply(e.message)
      }
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
      const name = normalizeHomeName(parts[1] || 'default') || 'default'
      try {
        const nextTg = upsertHome(this.tg(), { name, chatId, threadId })
        await this.hooks?.persistHomes?.(nextTg)
        this.config.telegram = nextTg
        return reply(`Home «${name}»: chat ${chatId}${threadId ? ` topic ${threadId}` : ''}`)
      } catch (e) {
        return reply(`Не удалось сохранить home: ${e.message}`)
      }
    }
    if (cmd === '/home') {
      const homes = listHomes(this.tg())
      if (!homes.length) return reply('Home не задан. /sethome или /sethome name')
      return reply(['Homes:', ...homes.map((h) => `• ${h.name}: chat ${h.chatId}${h.threadId ? ` topic ${h.threadId}` : ''}`)].join('\n'))
    }
    if (cmd === '/voice') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'on' || sub === 'off') {
        this.voicePrefs.set(userId, sub === 'on')
        return reply(sub === 'on' ? 'Голосовые ответы: on (для вас)' : 'Голосовые ответы: off (для вас)')
      }
      const pref = this.voicePrefs.get(userId)
      const mode = this.tg().voiceMode || 'mirror'
      const prefLine = pref === null ? 'не задан (/voice on|off)' : (pref ? 'on' : 'off')
      return reply(`voiceMode=${mode}\nваш /voice: ${prefLine}\nglobal tts: ${this.config.tts?.enabled ? 'on' : 'off'}`)
    }
    if (cmd === '/tts') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'on' || sub === 'off') {
        this.chatTts.set(chatId, sub === 'on')
        return reply(sub === 'on' ? 'Озвучка в этом чате: on' : 'Озвучка в этом чате: off')
      }
      const cur = this.chatTts.get(chatId)
      const line = cur === null ? 'не задан (/tts on|off)' : (cur ? 'on' : 'off')
      return reply(`Озвучка в этом чате: ${line}\nglobal tts: ${this.config.tts?.enabled ? 'on' : 'off'}`)
    }
    if (cmd === '/mute') {
      this.setMuted(chatId, true)
      return reply('Уведомления в этот чат: выключены (/unmute)')
    }
    if (cmd === '/unmute') {
      this.setMuted(chatId, false)
      return reply('Уведомления в этот чат: включены')
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
      lastUsed: Date.now(), abort: undefined, pendingMedia: [], turnActive: false,
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
    const { text, attachments = [], replyText, steer, personaOverride } = input
    const parts = []
    parts.push(String(this.config.agent?.instructionPrefix || MESSENGER_RELAY_INSTRUCTION))
    const activePersonaId = personaOverride || this.personas.get(input.chatId)
    const activePersona = getPersona(activePersonaId)
    if (activePersona?.instruction) {
      parts.push(`[Persona: ${activePersona.name} (${activePersona.icon})]\n${activePersona.instruction}`)
    }
    if (steer) parts.push('[Steer / дополнение к текущему ходу — учти вместе с предыдущим запросом, не начинай ответ заново с нуля]')
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
        let parsed = null
        if (att.kind === 'document' && att.path) {
          try {
            const maxDocBytes = Number(this.config.media?.maxTextInjectBytes) || 100 * 1024
            parsed = await parseDocument(att.path, { maxBytes: maxDocBytes })
          } catch {}
        }
        parts.push(formatInboundDocument(att, parsed))
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
          if (typing) await typing()
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
        if (progress) try { await progress.remove() } catch {}
        if (typeof react === 'function') react('').catch?.(() => {})
        if (stream) try { await stream.finalize('Прервано.') } catch {}
        else return reply('Прервано.')
        return
      }
      await this.ctx.sessions.flush(chat.agent.session)
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
        const msg = `Ошибка агента: ${err?.code || 'error'}: ${err?.message || 'unknown'}`
        if (stream) { await scheduler?.flush(); await stream.finalize(msg) }
        else await reply(msg)
        return
      }
      const files = await buildOutboundFiles(this.ctx, this.baseUrl(), collector, { signal, logger: this.ctx.logger })
      const allFiles = [...files, ...(processed.files || [])]
      if (!answer && !allFiles.length) {
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
        const ttsText = prepareTtsText(answer, this.config.tts?.maxChars)
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
        try {
          if (stream) await stream.finalize(`Сбой: ${err.message}`)
          else await reply(`Сбой: ${err.message}`)
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
    }
  }
}
