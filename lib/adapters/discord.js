import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_MAX_LENGTH = 2000

export function splitDiscordText(text, limit = DISCORD_MAX_LENGTH) {
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

export function toDiscordComponents(buttons) {
  if (!buttons || !Array.isArray(buttons) || !buttons.length) return undefined
  const rows = []
  const grid = Array.isArray(buttons[0]) ? buttons : [buttons]
  for (const row of grid.slice(0, 5)) {
    const components = []
    for (const btn of (row || []).slice(0, 5)) {
      if (!btn) continue
      const custom_id = String(btn.id || btn.callback_data || btn.text || 'btn').slice(0, 100)
      const label = String(btn.text || btn.label || 'Action').slice(0, 80)
      components.push({
        type: 2, // Button
        style: 1, // Primary
        label,
        custom_id,
      })
    }
    if (components.length) {
      rows.push({ type: 1, components })
    }
  }
  return rows.length ? rows : undefined
}

export class DiscordAdapter {
  constructor(opts = {}) {
    this.name = 'discord'
    this.botToken = String(opts.botToken || '').trim()
    this.webhookUrl = String(opts.webhookUrl || '').trim()
    this.logger = opts.logger
    this.stopped = false
  }

  async start() {
    this.stopped = false
    if (!this.botToken && !this.webhookUrl) {
      this.logger?.warn?.('dsh-messenger-gateway: discord adapter enabled but neither botToken nor webhookUrl provided')
    }
  }

  stop() {
    this.stopped = true
  }

  async sendTo(channelId, payload, opts = {}) {
    if (this.stopped) throw new Error('discord adapter stopped')
    const body = typeof payload === 'string' ? { text: payload } : (payload || {})
    const text = String(body.text || '')
    const files = Array.isArray(body.files) ? body.files : []
    const components = toDiscordComponents(body.buttons || body.replyMarkup?.inline_keyboard)

    const chunks = splitDiscordText(text)
    if (!chunks.length && !files.length && !components) return { ok: true }

    // Case 1: Webhook sending
    const isWebhookTarget = !channelId || channelId === 'default' || channelId === 'webhook'
    if (this.webhookUrl && isWebhookTarget) {
      for (const chunk of (chunks.length ? chunks : [''])) {
        const payloadJson = { content: chunk }
        if (components) payloadJson.components = components
        const res = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadJson),
          keepalive: true,
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`discord webhook error ${res.status}: ${errText}`)
        }
      }
      return { ok: true }
    }

    // Case 2: Bot REST API
    if (!this.botToken) {
      throw new Error('discord botToken required to send to specific channels')
    }

    const targetChannel = String(channelId || '').trim()
    if (!targetChannel) throw new Error('discord channelId required')

    // Handle files if any on the first chunk
    if (files.length > 0 && typeof FormData !== 'undefined') {
      const form = new FormData()
      const payloadJson = { content: chunks[0] || '' }
      if (components) payloadJson.components = components
      form.append('payload_json', JSON.stringify(payloadJson))
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const bytes = file.bytes || (file.path ? await readFile(file.path) : null)
        if (bytes) {
          const name = file.name || (file.path ? basename(file.path) : `file-${i}`)
          const mime = file.mime || 'application/octet-stream'
          form.append(`files[${i}]`, new Blob([bytes], { type: mime }), name)
        }
      }
      const res = await fetch(`${DISCORD_API}/channels/${targetChannel}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.botToken}`,
        },
        body: form,
        keepalive: true,
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`discord send error ${res.status}: ${errText}`)
      }
      const json = await res.json().catch(() => ({}))
      // Send remaining text chunks if any
      for (let i = 1; i < chunks.length; i++) {
        await this._sendRestMessage(targetChannel, chunks[i])
      }
      return { ok: true, messageId: json.id }
    }

    // Pure text chunks with components on first chunk
    let firstResult = { ok: true }
    for (let i = 0; i < (chunks.length ? chunks.length : 1); i++) {
      const chunk = chunks[i] || ''
      const res = await this._sendRestMessage(targetChannel, chunk, i === 0 ? components : undefined)
      if (i === 0) firstResult = res
    }
    return firstResult
  }

  async editMessage(channelId, messageId, content, components) {
    if (!this.botToken) throw new Error('discord botToken required to edit message')
    const body = { content: String(content || '').slice(0, DISCORD_MAX_LENGTH) }
    if (components !== undefined) body.components = components
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`discord edit error ${res.status}: ${errText}`)
    }
    return { ok: true }
  }

  async _sendRestMessage(channelId, content, components) {
    const body = { content }
    if (components && components.length) body.components = components
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      keepalive: true,
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`discord send error ${res.status}: ${errText}`)
    }
    const json = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {}
    return { ok: true, messageId: json?.id }
  }
}
