const SLACK_API = 'https://slack.com/api'
const SLACK_MAX_LENGTH = 4000

export function splitSlackText(text, limit = SLACK_MAX_LENGTH) {
  if (!text) return []
  if (text.length <= limit) return [text]
  const chunks = []
  let rem = text
  while (rem.length > limit) {
    let cut = rem.lastIndexOf('\n', limit)
    if (cut <= 0) cut = rem.lastIndexOf(' ', limit)
    if (cut <= 0) cut = limit
    chunks.push(rem.slice(0, cut))
    rem = rem.slice(cut).trimStart()
  }
  if (rem.length > 0) chunks.push(rem)
  return chunks
}

export function toSlackBlocks(text, buttons) {
  const blocks = []
  if (text) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: String(text).slice(0, 3000) },
    })
  }
  if (buttons && Array.isArray(buttons) && buttons.length) {
    const flat = (Array.isArray(buttons[0]) ? buttons.flat() : buttons).slice(0, 25)
    const elements = []
    for (const btn of flat) {
      if (!btn) continue
      const action_id = String(btn.id || btn.callback_data || btn.text || 'btn').slice(0, 100)
      const label = String(btn.text || btn.label || 'Action').slice(0, 75)
      elements.push({
        type: 'button',
        text: { type: 'plain_text', text: label },
        action_id,
        value: action_id,
      })
    }
    if (elements.length) {
      blocks.push({ type: 'actions', elements })
    }
  }
  return blocks.length ? blocks : undefined
}

export class SlackAdapter {
  constructor(opts = {}) {
    this.name = 'slack'
    this.botToken = String(opts.botToken || '').trim()
    this.webhookUrl = String(opts.webhookUrl || '').trim()
    this.logger = opts.logger
    this.stopped = false
  }

  async start() {
    this.stopped = false
    if (!this.botToken && !this.webhookUrl) {
      this.logger?.warn?.('dsh-messenger-gateway: slack adapter enabled but neither botToken nor webhookUrl provided')
    }
  }

  stop() {
    this.stopped = true
  }

  async sendTo(channelId, payload, opts = {}) {
    if (this.stopped) throw new Error('slack adapter stopped')
    const body = typeof payload === 'string' ? { text: payload } : (payload || {})
    const text = String(body.text || '')
    const blocks = toSlackBlocks(text, body.buttons || body.options || body.replyMarkup?.inline_keyboard)
    const chunks = splitSlackText(text)
    if (!chunks.length && !blocks) return { ok: true }

    const isWebhookTarget = !channelId || channelId === 'default' || channelId === 'webhook'
    if (this.webhookUrl && isWebhookTarget) {
      for (const chunk of (chunks.length ? chunks : [''])) {
        const payloadJson = { text: chunk }
        if (blocks) payloadJson.blocks = blocks
        const res = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadJson),
          keepalive: true,
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`slack webhook error ${res.status}: ${errText}`)
        }
      }
      return { ok: true }
    }

    if (!this.botToken) {
      throw new Error('slack botToken required to send to specific channels')
    }

    const targetChannel = String(channelId || '').trim()
    if (!targetChannel) throw new Error('slack channelId required')

    const threadTs = opts.threadId || undefined
    let firstResult = { ok: true }
    for (let i = 0; i < (chunks.length ? chunks.length : 1); i++) {
      const chunk = chunks[i] || ''
      const reqBody = {
        channel: targetChannel,
        text: chunk,
        thread_ts: threadTs,
      }
      if (i === 0 && blocks) reqBody.blocks = blocks
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(reqBody),
        keepalive: true,
        signal: AbortSignal.timeout(15000),
      })
      const json = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {}
      if (!res.ok || json?.ok === false) {
        throw new Error(`slack chat.postMessage error: ${json?.error || res.status}`)
      }
      if (i === 0) firstResult = { ok: true, ts: json?.ts }
    }
    return firstResult
  }

  async editMessage(channelId, ts, text, blocks) {
    if (!this.botToken) throw new Error('slack botToken required to edit message')
    const body = {
      channel: channelId,
      ts: String(ts),
      text: String(text || '').slice(0, SLACK_MAX_LENGTH),
    }
    if (blocks !== undefined) body.blocks = blocks
    const res = await fetch(`${SLACK_API}/chat.update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(15000),
    })
    const json = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {}
    if (!res.ok || json?.ok === false) {
      throw new Error(`slack chat.update error: ${json?.error || res.status}`)
    }
    return { ok: true }
  }
}
