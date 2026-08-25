import { readFile } from 'node:fs/promises'
import {
  IMAGE_EXT_TO_MIME, VIDEO_EXT_TO_MIME, basename, cacheName, classifyDocument,
  extOf, mediaKindOf, saveToCache, safeName,
} from '../media.js'
import { splitText } from '../text.js'
import { normalizeTelegramCommands } from '../commands.js'
import { normalizeThreadId, telegramThreadParams } from '../topics.js'

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
    this.logger = opts.logger
    this.commands = normalizeTelegramCommands(opts.commands)
    this.offset = 0
    this.stopped = false
    this.pollTimer = undefined
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

  async start() {
    if (!this.token) throw new Error('telegram bot token is empty')
    this.stopped = false
    try {
      await this.registerCommands()
      this.logger?.info?.(`dsh-messenger-gateway: telegram commands registered (${this.commands.length})`)
    } catch (err) {
      this.logger?.warn?.(`dsh-messenger-gateway: telegram setMyCommands: ${err.message}`)
    }
    this.poll()
  }

  stop() {
    this.stopped = true
    if (this.pollTimer) clearTimeout(this.pollTimer)
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
      for (const update of updates || []) {
        this.offset = Math.max(this.offset, update.update_id + 1)
        if (update.callback_query) {
          try { await this.onCallback?.(this.wrapCallback(update.callback_query)) } catch (e) {
            this.logger?.warn?.(`callback: ${e.message}`)
          }
          continue
        }
        const msg = update.message
        if (!msg) continue
        try { await this.handleMessage(msg) } catch (e) {
          this.logger?.warn?.(`message: ${e.message}`)
        }
      }
    } catch (e) {
      if (!this.stopped) this.logger?.warn?.(`poll: ${e.message}`)
    }
    this.schedulePoll()
  }

  wrapCallback(cq) {
    const chatId = cq.message?.chat?.id
    const messageId = cq.message?.message_id
    return {
      platform: 'telegram', chatId, threadId: cq.message?.message_thread_id || 0, userId: cq.from?.id, data: cq.data, callbackQueryId: cq.id,
      answer: async (text) => this.call('answerCallbackQuery', { callback_query_id: cq.id, text: text || '' }),
      editMessage: async (text, replyMarkup) => this.call('editMessageText', {
        chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup,
      }),
    }
  }

  allowed(userId) {
    return this.allowedUserIds.length === 0 || this.allowedUserIds.includes(Number(userId))
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id
    const userId = msg.from?.id ?? chatId
    if (!this.allowed(userId)) return
    const threadId = msg.message_thread_id || 0
    const cacheDir = this.media.cacheDir
    const maxDocBytes = this.media.maxDocBytes ?? 20 * 1024 * 1024
    const maxTextInjectBytes = this.media.maxTextInjectBytes ?? 100 * 1024
    let text = msg.text ?? msg.caption ?? ''
    const attachments = []
    const replyText = msg.reply_to_message ? (msg.reply_to_message.text ?? msg.reply_to_message.caption ?? '') : ''

    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1]
      const file = await this.getFile(largest.file_id)
      const bytes = await this.downloadFile(file.file_path)
      const ext = extOf(file.file_path, '') || '.jpg'
      attachments.push({ kind: 'photo', path: saveToCache(cacheDir, cacheName('photo', ext, ''), bytes), mime: IMAGE_EXT_TO_MIME[ext] || 'image/jpeg' })
    }
    if (msg.voice) {
      const file = await this.getFile(msg.voice.file_id)
      const bytes = await this.downloadFile(file.file_path)
      attachments.push({ kind: 'voice', path: saveToCache(cacheDir, cacheName('voice', '.ogg', ''), bytes), mime: 'audio/ogg' })
    }
    if (msg.audio) {
      const file = await this.getFile(msg.audio.file_id)
      const bytes = await this.downloadFile(file.file_path)
      const ext = extOf(msg.audio.file_name, msg.audio.mime_type) || '.mp3'
      attachments.push({ kind: 'audio', path: saveToCache(cacheDir, cacheName('audio', ext, msg.audio.file_name || ''), bytes), mime: msg.audio.mime_type || 'audio/mpeg' })
    }
    if (msg.document) {
      const doc = msg.document
      const ext = extOf(doc.file_name, doc.mime_type)
      const kind = classifyDocument(ext, doc.mime_type)
      if (doc.file_size > maxDocBytes) {
        text = `${text}\n[Document too large: ${doc.file_name || 'file'}]`.trim()
      } else if (kind === 'unsupported') {
        text = `${text}\n[Unsupported document type: ${doc.file_name || ext}]`.trim()
      } else {
        const file = await this.getFile(doc.file_id)
        const bytes = await this.downloadFile(file.file_path)
        const path = saveToCache(cacheDir, cacheName('doc', ext, doc.file_name || ''), bytes)
        if (kind === 'image') attachments.push({ kind: 'photo', path, mime: IMAGE_EXT_TO_MIME[ext] || doc.mime_type || 'image/jpeg', name: doc.file_name })
        else if (kind === 'video') attachments.push({ kind: 'video', path, mime: VIDEO_EXT_TO_MIME[ext] || doc.mime_type || 'video/mp4', name: doc.file_name })
        else if (bytes.length <= maxTextInjectBytes && ['.md', '.txt', '.csv', '.log', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.ts', '.py', '.sh'].includes(ext)) {
          const body = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, maxTextInjectBytes)
          text = `${text}\n\n[Document ${doc.file_name}]\n${body}`.trim()
        } else attachments.push({ kind: 'document', path, mime: doc.mime_type || 'application/octet-stream', name: doc.file_name || basename(path) })
      }
    }

    const reply = async (payload) => this.sendReply(chatId, msg.message_id, payload, threadId)
    const typing = async () => { try { await this.call('sendChatAction', { chat_id: chatId, action: 'typing', ...telegramThreadParams(threadId) }) } catch {} }

    await this.onMessage({
      platform: 'telegram', chatId, userId, threadId, text, attachments, replyText, messageId: msg.message_id, reply, typing,
    })
  }

  async sendMedia(chatId, file, threadId = 0) {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    const thread = telegramThreadParams(threadId)
    if (thread.message_thread_id) form.append('message_thread_id', String(thread.message_thread_id))
    const blob = new Blob([file.bytes])
    const name = safeName(file.name || 'file')
    if (file.kind === 'photo') { form.append('photo', blob, name); return this.callMultipart('sendPhoto', form) }
    if (file.kind === 'voice') { form.append('voice', blob, name); return this.callMultipart('sendVoice', form) }
    if (file.kind === 'audio') { form.append('audio', blob, name); return this.callMultipart('sendAudio', form) }
    form.append('document', blob, name)
    return this.callMultipart('sendDocument', form)
  }

  async sendReply(chatId, replyTo, payload, threadId = 0) {
    const body = typeof payload === 'string' ? { text: payload } : (payload || {})
    const files = Array.isArray(body.files) ? body.files : []
    const text = String(body.text || '')
    const replyMarkup = body.replyMarkup
    for (const file of files) {
      try { await this.sendMedia(chatId, file, threadId) } catch (e) { this.logger?.warn?.(`send media: ${e.message}`) }
    }
    if (text) {
      for (const chunk of splitText(text, TELEGRAM_MAX)) {
        await this.call('sendMessage', {
          chat_id: chatId,
          text: chunk,
          reply_to_message_id: replyTo,
          reply_markup: replyMarkup,
          ...telegramThreadParams(threadId),
        })
      }
    }
  }

  async sendTo(chatId, payload, opts = {}) {
    return this.sendReply(chatId, undefined, payload, normalizeThreadId(opts.threadId))
  }
}
