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
    const chunks = splitSlackText(text)
    if (!chunks.length) return { ok: true }

    const isWebhookTarget = !channelId || channelId === 'default' || channelId === 'webhook'
    if (this.webhookUrl && isWebhookTarget) {
      for (const chunk of chunks) {
        const res = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk }),
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
    for (const chunk of chunks) {
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          channel: targetChannel,
          text: chunk,
          thread_ts: threadTs,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) {
        throw new Error(`slack chat.postMessage error: ${json.error || res.status}`)
      }
    }
    return { ok: true }
  }
}
