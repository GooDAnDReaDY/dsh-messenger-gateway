import { readFile } from 'node:fs/promises'
import {
  IMAGE_EXT_TO_MIME, VIDEO_EXT_TO_MIME, basename, cacheName, classifyDocument,
  extOf, saveToCache, safeName,
} from '../media.js'
import { TEXT_INJECT_EXTS } from '../documents.js'
import { splitText } from '../text.js'
import { prepareTelegramText } from '../telegram-format.js'
import { normalizeTelegramCommands } from '../commands.js'
import { normalizeThreadId, telegramThreadParams } from '../topics.js'
import {
  shouldProcessTelegramMessage, stripBotCommandSuffix,
} from '../groups.js'
import { isResendSafeNetworkError, isPollingConflict } from '../telegram-errors.js'

const API = 'https://api.telegram.org'
const TELEGRAM_MAX = 4096

export class TelegramAdapter {
  constructor(opts) {
    this.name = 'telegram'
    this.token = String(opts.botToken || '').trim()
    this.allowedUserIds = (opts.allowedUserIds || []).map(Number).filter((n) => Number.isFinite(n))
    this.timeoutSeconds = Number(opts.timeoutSeconds) || 50
    this.pollIntervalMs = Number(opts.pollIntervalMs) || 500
    this.media = opts.media || {}
    this.onMessage = opts.onMessage
    this.onCallback = opts.onCallback
    this.onUnauthorized = opts.onUnauthorized
    this.isUserAllowed = opts.isUserAllowed
    this.logger = opts.logger
    this.commands = normalizeTelegramCommands(opts.commands)
    this.textFormat = opts.textFormat === 'plain' ? 'plain' : 'html'
    this.groupsEnabled = opts.groupsEnabled !== false
    this.groupRequireMention = opts.groupRequireMention !== false
    this.reactionsEnabled = opts.reactionsEnabled !== false
    this.transport = opts.transport === 'webhook' ? 'webhook' : 'poll'
    this.statusIndicator = opts.statusIndicator === true
    this.statusOnline = String(opts.statusOnline || 'Online')
    this.statusOffline = String(opts.statusOffline || 'Offline')
    this.sendRetryMax = 2
    this.sendRetryBaseMs = 400
    this.pollingConflict = false
    this.webhookUrl = String(opts.webhookUrl || '').trim()
    this.webhookSecret = String(opts.webhookSecret || '').trim()
    this.offset = 0
    this.stopped = false
    this.pollTimer = undefined
    this.botId = 0
    this.botUsername = ''
  }

  setAllowedUserIds(ids) {
    this.allowedUserIds = (ids || []).map(Number).filter((n) => Number.isFinite(n))
  }

  async call(method, params = {}) {
    const res = await fetch(`${API}/bot${this.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.ok === false) throw new Error(`telegram ${method}: ${json.description || res.status}`)
    return json.result
  }

  async callMultipart(method, form) {
    const res = await fetch(`${API}/bot${this.token}/${method}`, { method: 'POST', body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.ok === false) throw new Error(`telegram ${method}: ${json.description || res.status}`)
    return json.result
  }

  // Retry a send only on resend-safe network errors (request never reached Telegram).
  // Permanent errors (4xx/5xx) and ambiguous timeouts are not retried to avoid duplicates.
  async sendWithRetry(method, params, { multipart = false } = {}) {
    const fn = () => (multipart ? this.callMultipart(method, params) : this.call(method, params))
    let lastErr
    for (let attempt = 0; attempt <= this.sendRetryMax; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (!isResendSafeNetworkError(err) || attempt >= this.sendRetryMax) throw err
        this.logger?.warn?.(`telegram ${method} resend-safe network error (attempt ${attempt + 1}/${this.sendRetryMax}), retrying: ${err.message}`)
        await new Promise((r) => setTimeout(r, this.sendRetryBaseMs * (attempt + 1)))
      }
    }
    throw lastErr
  }

  async getFile(fileId) { return this.call('getFile', { file_id: fileId }) }

  async downloadFile(filePath) {
    const res = await fetch(`${API}/file/bot${this.token}/${filePath}`)
    if (!res.ok) throw new Error(`telegram download HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async registerCommands() {
    if (!this.commands.length) return
    await this.call('setMyCommands', { commands: this.commands })
  }

  // Bots have no presence dot; the short description is the closest surface.
  // Opt-in only — it mutates the bot's global profile visible to all users.
  async setStatusIndicator(text) {
    if (!this.statusIndicator) return
    try {
      await this.call('setMyShortDescription', { short_description: String(text || '').slice(0, 120) })
    } catch (err) {
      this.logger?.warn?.(`telegram setMyShortDescription: ${err.message}`)
    }
  }

  async start() {
    if (!this.token) throw new Error('telegram bot token is empty')
    this.stopped = false
    try {
      const me = await this.call('getMe')
      this.botId = Number(me.id) || 0
      this.botUsername = String(me.username || '')
      this.logger?.info?.(`dsh-messenger-gateway: telegram bot @${this.botUsername} (${this.botId})`)
    } catch (err) {
      this.logger?.warn?.(`dsh-messenger-gateway: telegram getMe: ${err.message}`)
    }
    if (this.statusIndicator) await this.setStatusIndicator(this.statusOnline)
    try {
      await this.registerCommands()
      this.logger?.info?.(`dsh-messenger-gateway: telegram commands registered (${this.commands.length})`)
    } catch (err) {
      this.logger?.warn?.(`dsh-messenger-gateway: telegram setMyCommands: ${err.message}`)
    }
    if (this.transport === 'webhook') {
      if (!this.webhookUrl) throw new Error('telegram webhookUrl is required for webhook transport')
      try {
        await this.call('deleteWebhook', { drop_pending_updates: false })
      } catch {}
      const params = {
        url: this.webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }
      if (this.webhookSecret) params.secret_token = this.webhookSecret
      await this.call('setWebhook', params)
      this.logger?.info?.(`dsh-messenger-gateway: telegram webhook set → ${this.webhookUrl}`)
      return
    }
    try { await this.call('deleteWebhook', { drop_pending_updates: false }) } catch {}
    this.poll()
  }

  stop() {
    this.stopped = true
    if (this.pollTimer) clearTimeout(this.pollTimer)
    if (this.statusIndicator) this.setStatusIndicator(this.statusOffline).catch(() => {})
  }

  schedulePoll() {
    if (this.stopped) return
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs)
    this.pollTimer.unref?.()
  }

  async poll() {
    if (this.stopped) return
    try {
      const updates = await this.call('getUpdates', {
        timeout: this.timeoutSeconds,
        offset: this.offset,
        allowed_updates: ['message', 'callback_query'],
      })
      this.pollingConflict = false
      for (const update of updates || []) {
        this.offset = Math.max(this.offset, update.update_id + 1)
        await this.dispatchUpdate(update)
      }
    } catch (e) {
      if (!this.stopped) {
        if (isPollingConflict(e)) {
          this.pollingConflict = true
          this.logger?.error?.(`poll: TELEGRAM CONFLICT — another bot instance is polling the same token. Stop the duplicate instance. (${e.message})`)
        } else {
          this.logger?.warn?.(`poll: ${e.message}`)
        }
      }
    }
    this.schedulePoll()
  }

  async dispatchUpdate(update) {
    if (update.callback_query) {
      try { await this.onCallback?.(this.wrapCallback(update.callback_query)) } catch (e) {
        this.logger?.warn?.(`callback: ${e.message}`)
      }
      return
    }
    const msg = update.message
    if (!msg) return
    try { await this.handleMessage(msg) } catch (e) {
      this.logger?.warn?.(`message: ${e.message}`)
    }
  }

  /** HTTP webhook entry (caller verifies secret). */
  async handleWebhookUpdate(update) {
    if (this.stopped) return
    await this.dispatchUpdate(update)
  }

  wrapCallback(cq) {
    const chatId = cq.message?.chat?.id
    const messageId = cq.message?.message_id
    return {
      platform: 'telegram', chatId, threadId: cq.message?.message_thread_id || 0, userId: cq.from?.id, data: cq.data, callbackQueryId: cq.id,
      message: cq.message,
      answer: async (text) => this.call('answerCallbackQuery', { callback_query_id: cq.id, text: text || '' }),
      editMessage: async (text, replyMarkup) => {
        const { text: formatted, parseMode } = this.formatOutgoingText(text)
        const params = { chat_id: chatId, message_id: messageId, text: formatted, reply_markup: replyMarkup }
        if (parseMode) params.parse_mode = parseMode
        try {
          return await this.call('editMessageText', params)
        } catch (err) {
          if (!parseMode) throw err
          return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup })
        }
      },
    }
  }

  allowed(userId) {
    if (typeof this.isUserAllowed === 'function') return this.isUserAllowed(userId)
    return this.allowedUserIds.length === 0 || this.allowedUserIds.includes(Number(userId))
  }

  async downloadByFileId(fileId, prefix, ext, name = '') {
    const file = await this.getFile(fileId)
    const bytes = await this.downloadFile(file.file_path)
    const resolvedExt = ext || extOf(file.file_path, '') || ''
    const path = saveToCache(this.media.cacheDir, cacheName(prefix, resolvedExt, name), bytes)
    return { path, bytes, file }
  }

  async setReaction(chatId, messageId, emoji) {
    if (!this.reactionsEnabled || !messageId) return
    try {
      await this.call('setMessageReaction', {
        chat_id: chatId,
        message_id: messageId,
        reaction: emoji ? [{ type: 'emoji', emoji }] : [],
      })
    } catch (e) {
      this.logger?.warn?.(`reaction: ${e.message}`)
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id
    const chatType = msg.chat?.type || 'private'
    const userId = msg.from?.id ?? chatId
    let text = msg.text ?? msg.caption ?? ''
    const entities = msg.entities || msg.caption_entities || []
    const gate = shouldProcessTelegramMessage({
      chatType,
      text,
      entities,
      replyTo: msg.reply_to_message,
      botId: this.botId,
      botUsername: this.botUsername,
      groupsEnabled: this.groupsEnabled,
      requireMention: this.groupRequireMention,
    })
    if (!gate.ok) return

    if (!this.allowed(userId)) {
      if (chatType !== 'private') return
      if (this.onUnauthorized) {
        await this.onUnauthorized({
          platform: 'telegram', chatId, userId, threadId: msg.message_thread_id || 0,
          username: msg.from?.username || '',
          reply: async (payload) => this.sendReply(chatId, msg.message_id, payload, msg.message_thread_id || 0),
        })
      }
      return
    }

    text = stripBotCommandSuffix(text, this.botUsername)
    const threadId = msg.message_thread_id || 0
    const maxDocBytes = this.media.maxDocBytes ?? 20 * 1024 * 1024
    const maxTextInjectBytes = this.media.maxTextInjectBytes ?? 100 * 1024
    const attachments = []
    const replyMsg = msg.reply_to_message
    let replyText = ''
    if (replyMsg) {
      const quoted = replyMsg.text ?? replyMsg.caption ?? ''
      const quoteFrag = msg.quote?.text || ''
      replyText = quoteFrag
        ? `${quoted}${quoted ? '\n' : ''}[цитата: ${quoteFrag}]`
        : quoted
    }

    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1]
      const { path, file } = await this.downloadByFileId(largest.file_id, 'photo', extOf('', '') || '.jpg')
      const ext = extOf(file.file_path, '') || '.jpg'
      attachments.push({ kind: 'photo', path, mime: IMAGE_EXT_TO_MIME[ext] || 'image/jpeg' })
    }
    if (msg.sticker) {
      const st = msg.sticker
      if (st.is_video) {
        try {
          const { path } = await this.downloadByFileId(st.file_id, 'sticker-video', '.webm', st.file_unique_id || '')
          attachments.push({ kind: 'animation', path, mime: 'video/webm', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.webm` })
          if (st.emoji) text = `${text}\n[Видео-стикер ${st.emoji}]`.trim()
        } catch (e) {
          text = `${text}\n[Видео-стикер ${st.emoji || ''} (не скачан: ${e.message})]`.trim()
        }
      } else if (st.is_animated) {
        try {
          const { path } = await this.downloadByFileId(st.file_id, 'sticker-anim', '.tgs', st.file_unique_id || '')
          attachments.push({ kind: 'document', path, mime: 'application/x-tgsticker', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.tgs` })
          if (st.emoji) text = `${text}\n[Анимированный стикер ${st.emoji}]`.trim()
        } catch (e) {
          text = `${text}\n[Анимированный стикер ${st.emoji || ''} (не скачан: ${e.message})]`.trim()
        }
      } else {
        const { path } = await this.downloadByFileId(st.file_id, 'sticker', '.webp', st.file_unique_id || '')
        attachments.push({ kind: 'sticker', path, mime: 'image/webp', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.webp` })
      }
    }
    if (msg.voice) {
      const { path } = await this.downloadByFileId(msg.voice.file_id, 'voice', '.ogg')
      attachments.push({ kind: 'voice', path, mime: 'audio/ogg' })
    }
    if (msg.audio) {
      const ext = extOf(msg.audio.file_name, msg.audio.mime_type) || '.mp3'
      const { path } = await this.downloadByFileId(msg.audio.file_id, 'audio', ext, msg.audio.file_name || '')
      attachments.push({ kind: 'audio', path, mime: msg.audio.mime_type || 'audio/mpeg' })
    }
    if (msg.video) {
      const ext = extOf(msg.video.file_name, msg.video.mime_type) || '.mp4'
      if ((msg.video.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Video too large]`.trim()
      } else {
        const { path } = await this.downloadByFileId(msg.video.file_id, 'video', ext, msg.video.file_name || '')
        attachments.push({ kind: 'video', path, mime: msg.video.mime_type || VIDEO_EXT_TO_MIME[ext] || 'video/mp4', name: msg.video.file_name || basename(path) })
      }
    }
    if (msg.video_note) {
      const vn = msg.video_note
      if ((vn.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Video note too large]`.trim()
      } else {
        const { path } = await this.downloadByFileId(vn.file_id, 'videonote', '.mp4')
        attachments.push({ kind: 'video', path, mime: 'video/mp4', name: 'video_note.mp4' })
      }
    }
    if (msg.animation) {
      const an = msg.animation
      const ext = extOf(an.file_name, an.mime_type) || '.mp4'
      if ((an.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Animation too large]`.trim()
      } else {
        const { path } = await this.downloadByFileId(an.file_id, 'anim', ext, an.file_name || '')
        attachments.push({ kind: 'animation', path, mime: an.mime_type || 'video/mp4', name: an.file_name || basename(path) })
      }
    }
    if (msg.document) {
      const doc = msg.document
      const ext = extOf(doc.file_name, doc.mime_type)
      const kind = classifyDocument(ext, doc.mime_type)
      if (doc.file_size > maxDocBytes) {
        text = `${text}\n[Document too large: ${doc.file_name || 'file'}]`.trim()
      } else if (kind === 'unsupported') {
        const { path } = await this.downloadByFileId(doc.file_id, 'doc', ext, doc.file_name || '')
        attachments.push({ kind: 'document', path, mime: doc.mime_type || 'application/octet-stream', name: doc.file_name || basename(path) })
      } else {
        const { path, bytes } = await this.downloadByFileId(doc.file_id, 'doc', ext, doc.file_name || '')
        if (kind === 'image') attachments.push({ kind: 'photo', path, mime: IMAGE_EXT_TO_MIME[ext] || doc.mime_type || 'image/jpeg', name: doc.file_name })
        else if (kind === 'video') attachments.push({ kind: 'video', path, mime: VIDEO_EXT_TO_MIME[ext] || doc.mime_type || 'video/mp4', name: doc.file_name })
        else if (bytes.length <= maxTextInjectBytes && TEXT_INJECT_EXTS.has(ext)) {
          const body = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, maxTextInjectBytes)
          text = `${text}\n\n[Document ${doc.file_name}]\n${body}`.trim()
        } else attachments.push({ kind: 'document', path, mime: doc.mime_type || 'application/octet-stream', name: doc.file_name || basename(path) })
      }
    }

    const messageId = msg.message_id
    const reply = async (payload) => this.sendReply(chatId, messageId, payload, threadId)
    const typing = async () => { try { await this.call('sendChatAction', { chat_id: chatId, action: 'typing', ...telegramThreadParams(threadId) }) } catch {} }
    const startStream = async () => this.startStreamMessage(chatId, messageId, threadId)
    const startProgress = async () => this.startProgressMessage(chatId, messageId, threadId)
    const react = async (emoji) => this.setReaction(chatId, messageId, emoji)

    await this.onMessage({
      platform: 'telegram', chatId, userId, threadId, chatType, text, attachments, replyText,
      messageId, reply, typing, startStream, startProgress, react,
    })
  }

  async startProgressMessage(chatId, replyTo, threadId = 0) {
    const result = await this.call('sendMessage', {
      chat_id: chatId,
      text: '⏳ Думаю…',
      reply_to_message_id: replyTo,
      ...telegramThreadParams(threadId),
    })
    const messageId = result?.message_id
    return {
      messageId,
      edit: async (text) => {
        const plain = String(text || '⏳ Думаю…').slice(0, TELEGRAM_MAX)
        try {
          await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text: plain || '⏳ Думаю…' })
        } catch (err) {
          const msg = String(err.message || '')
          if (!msg.includes('message is not modified')) this.logger?.warn?.(`progress edit: ${err.message}`)
        }
      },
      remove: async () => {
        try { await this.call('deleteMessage', { chat_id: chatId, message_id: messageId }) } catch {}
      },
    }
  }

  async startStreamMessage(chatId, replyTo, threadId = 0) {
    const result = await this.call('sendMessage', {
      chat_id: chatId,
      text: '…',
      reply_to_message_id: replyTo,
      ...telegramThreadParams(threadId),
    })
    const messageId = result?.message_id
    return {
      messageId,
      edit: async (text) => {
        const plain = String(text || '…').slice(0, TELEGRAM_MAX)
        try {
          await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text: plain || '…' })
        } catch (err) {
          const msg = String(err.message || '')
          if (!msg.includes('message is not modified')) throw err
        }
      },
      finalize: async (text, payload = {}) => {
        const { text: formatted, parseMode } = this.formatOutgoingText(String(text || ''), payload)
        const chunk = splitText(formatted, TELEGRAM_MAX)[0] || '…'
        const params = { chat_id: chatId, message_id: messageId, text: chunk }
        if (parseMode) params.parse_mode = parseMode
        try {
          await this.call('editMessageText', params)
        } catch (err) {
          if (!parseMode) {
            const msg = String(err.message || '')
            if (!msg.includes('message is not modified')) throw err
            return
          }
          await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text: splitText(String(text || ''), TELEGRAM_MAX)[0] || '…' })
        }
      },
    }
  }

  async sendMedia(chatId, file, threadId = 0) {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    const thread = telegramThreadParams(threadId)
    if (thread.message_thread_id) form.append('message_thread_id', String(thread.message_thread_id))
    const blob = new Blob([file.bytes])
    const name = safeName(file.name || 'file')
    if (file.kind === 'photo') { form.append('photo', blob, name); return this.sendWithRetry('sendPhoto', form, { multipart: true }) }
    if (file.kind === 'voice') { form.append('voice', blob, name); return this.sendWithRetry('sendVoice', form, { multipart: true }) }
    if (file.kind === 'audio') { form.append('audio', blob, name); return this.sendWithRetry('sendAudio', form, { multipart: true }) }
    if (file.kind === 'video') { form.append('video', blob, name); return this.sendWithRetry('sendVideo', form, { multipart: true }) }
    form.append('document', blob, name)
    return this.sendWithRetry('sendDocument', form, { multipart: true })
  }

  formatOutgoingText(text, payload = {}) {
    const mode = payload.parseMode === 'HTML' ? 'html'
      : payload.parseMode === 'plain' ? 'plain'
      : this.textFormat
    return prepareTelegramText(text, mode)
  }

  async sendFormattedMessage(chatId, replyTo, text, payload, threadId, replyMarkup) {
    const { text: formatted, parseMode } = this.formatOutgoingText(text, payload)
    const chunks = splitText(formatted, TELEGRAM_MAX)
    const plainChunks = splitText(text, TELEGRAM_MAX)
    for (let i = 0; i < chunks.length; i++) {
      const params = {
        chat_id: chatId,
        text: chunks[i],
        reply_to_message_id: replyTo,
        reply_markup: i === 0 ? replyMarkup : undefined,
        ...telegramThreadParams(threadId),
      }
      if (parseMode) params.parse_mode = parseMode
      try {
        await this.sendWithRetry('sendMessage', params)
      } catch (err) {
        if (!parseMode) throw err
        this.logger?.warn?.(`telegram HTML send failed, fallback plain: ${err.message}`)
        await this.call('sendMessage', {
          chat_id: chatId,
          text: plainChunks[i] ?? chunks[i],
          reply_to_message_id: replyTo,
          reply_markup: i === 0 ? replyMarkup : undefined,
          ...telegramThreadParams(threadId),
        })
      }
    }
  }

  async sendReply(chatId, replyTo, payload, threadId = 0) {
    const body = typeof payload === 'string' ? { text: payload } : (payload || {})
    const files = Array.isArray(body.files) ? body.files : []
    const text = String(body.text || '')
    const replyMarkup = body.replyMarkup
    for (const file of files) {
      try {
        const bytes = file.bytes || (file.path ? await readFile(file.path) : null)
        if (!bytes) continue
        await this.sendMedia(chatId, { ...file, bytes }, threadId)
      } catch (e) { this.logger?.warn?.(`send media: ${e.message}`) }
    }
    if (text) await this.sendFormattedMessage(chatId, replyTo, text, body, threadId, replyMarkup)
  }

  async sendTo(chatId, payload, opts = {}) {
    return this.sendReply(chatId, undefined, payload, normalizeThreadId(opts.threadId))
  }
}
