const API = 'https://api.telegram.org'

export class TelegramAdapter {
  constructor(opts) {
    this.name = 'telegram'
    this.token = String(opts.botToken || '').trim()
    this.pollTimeoutSeconds = Number(opts.pollTimeoutSeconds) || 50
    this.onMessage = opts.onMessage
    this.logger = opts.logger
    this.abort = new AbortController()
  }

  apiUrl(method) { return `${API}/bot${this.token}/${method}` }

  async call(method, body) {
    const res = await fetch(this.apiUrl(method), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: this.abort.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) throw new Error(`Telegram ${method}: ${data.description || res.status}`)
    return data.result
  }

  async start() {
    if (!this.token) throw new Error('telegram bot token is empty')
    this.pollLoop().catch((err) => {
      if (!this.abort.signal.aborted) this.logger?.warn?.(`telegram poll: ${err.message}`)
    })
  }

  stop() { this.abort.abort() }

  async pollLoop() {
    let offset = 0
    while (!this.abort.signal.aborted) {
      let updates = []
      try {
        updates = await this.call('getUpdates', { offset, timeout: this.pollTimeoutSeconds, allowed_updates: ['message'] })
      } catch (err) {
        if (this.abort.signal.aborted) return
        await sleep(2000, this.abort.signal)
        continue
      }
      for (const update of updates) {
        if (typeof update.update_id === 'number') offset = update.update_id + 1
        const msg = update.message
        if (!msg || typeof msg.chat?.id !== 'number') continue
        const text = typeof msg.text === 'string' ? msg.text : typeof msg.caption === 'string' ? msg.caption : ''
        if (!text && !msg.voice && !msg.photo) continue
        const chatId = msg.chat.id
        const userId = msg.from?.id ?? chatId
        const messageId = msg.message_id
        const reply = async (body) => this.call('sendMessage', { chat_id: chatId, text: String(body ?? ''), reply_to_message_id: messageId })
        const typing = async () => { try { await this.call('sendChatAction', { chat_id: chatId, action: 'typing' }) } catch {} }
        try {
          await this.onMessage({ platform: 'telegram', chatId, userId, text: text || (msg.voice ? '[voice]' : '[photo]'), messageId, reply, typing, raw: msg })
        } catch (err) {
          try { await reply(`Error: ${err.message}`) } catch {}
        }
      }
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
  })
}
