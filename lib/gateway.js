import { randomUUID } from 'node:crypto'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import createAdapters from './adapters/index.js'
import { assistantText, splitText } from './text.js'

const PLUGIN = 'dsh-messenger-gateway'

export class Gateway {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.chats = new Map()
    this.pending = new Map()
    this.adapters = []
    this.disposeListener = undefined
    this.idleTimer = undefined
  }

  async start() {
    this.disposeListener = this.ctx.on('session/event', (session, event) => {
      const collector = this.pending.get(session.id)
      if (!collector) return
      if (event.type === 'assistant/message') {
        const text = assistantText(event.data.message)
        if (text) collector.parts.push(text)
      } else if (event.type === 'turn/end') collector.reason = event.data.reason
    })
    for (const adapter of createAdapters({ config: this.config, onMessage: (i) => this.handleMessage(i), logger: this.ctx.logger })) {
      try {
        await adapter.start()
        this.adapters.push(adapter)
        this.ctx.logger?.info?.(`dsh-messenger-gateway: ${adapter.name} started`)
      } catch (err) {
        this.ctx.logger?.warn?.(`dsh-messenger-gateway: ${adapter.name} start failed: ${err.message}`)
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
    for (const a of this.adapters) { try { a.stop() } catch {} }
    this.adapters = []
    for (const c of this.chats.values()) c.dispose().catch(() => {})
    this.chats.clear()
    this.pending.clear()
  }

  isAllowed(platform, userId) {
    if (platform !== 'telegram') return true
    const allow = (this.config.telegram?.allowedUserIds || []).map(String)
    return allow.length === 0 || allow.includes(String(userId))
  }

  async handleMessage(input) {
    const { platform, chatId, userId, text, reply } = input
    const key = `${platform}:${chatId}`
    const body = String(text || '').trim()
    if (!body) return
    if (!this.isAllowed(platform, userId)) { await reply('Access denied.'); return }
    if (body.startsWith('/')) { await this.handleCommand(key, body, input); return }
    if (body === '[voice]' || body === '[photo]') {
      await reply('Media is not supported in v0.1. Send text for now.')
      return
    }
    const chat = await this.getOrCreateChat(key)
    const run = chat.busy.then(() => this.runTurn(chat, input))
    chat.busy = run.catch(() => {})
    await run
  }

  async handleCommand(key, text, input) {
    const cmd = text.split(/\s+/)[0]
    const { reply, userId } = input
    if (cmd === '/start') return reply('Connected. Send a message to talk to your agent. /help for commands.')
    if (cmd === '/help') return reply('/help — commands\n/new — new session\n/whoami — your user id')
    if (cmd === '/new') {
      const chat = this.chats.get(key)
      if (chat) { this.chats.delete(key); await chat.dispose(); return reply('Session cleared.') }
      return reply('No active session.')
    }
    if (cmd === '/whoami') return reply(`Your user id: ${userId}`)
    return reply(`Unknown command ${cmd}. Try /help`)
  }

  async getOrCreateChat(key) {
    let chat = this.chats.get(key)
    if (!chat) { chat = await this.createChat(key); this.chats.set(key, chat) }
    chat.lastUsed = Date.now()
    return chat
  }

  async createChat(key) {
    const selection = this.ctx.get('agentDefaultModel')?.currentSelection?.()
    if (!selection) throw new Error('Pick a default model in Settings → Models')
    const agentCfg = this.config.agent || {}
    const provider = agentCfg.provider || selection.provider
    const model = agentCfg.model || selection.model
    const cwd = agentCfg.cwd || process.cwd()
    const handle = await this.ctx.agents.create({
      sessionId: SessionId(`msgw-${randomUUID()}`),
      meta: { cwd },
      agentOptions: { provider, model },
      setup: (agentCtx) => installModelSelection(agentCtx, { current: { provider, model }, assembled: undefined }),
    })
    await handle.agent.whenIdle()
    return { key, agent: handle.agent, dispose: handle.dispose, busy: Promise.resolve(), lastUsed: Date.now() }
  }

  async runTurn(chat, input) {
    const { reply, typing, text } = input
    const sessionId = chat.agent.session.id
    const collector = { parts: [], reason: undefined }
    this.pending.set(sessionId, collector)
    try {
      if (typing) await typing()
      const prefix = String(this.config.agent?.instructionPrefix || '').trim()
      const messageText = [prefix, String(text || '').trim()].filter(Boolean).join('\n\n')
      chat.agent.followup(createUserMessage({
        content: [{ type: 'text', text: messageText }],
        source: { kind: 'plugin', plugin: PLUGIN, form: 'relay' },
      }))
      await chat.agent.whenIdle()
      await this.ctx.sessions.flush(chat.agent.session)
      const answer = collector.parts.join('\n\n').trim()
      if (collector.reason?.kind === 'error') {
        const err = collector.reason.error
        return reply(`Agent error: ${err?.code || 'error'}: ${err?.message || 'unknown'}`)
      }
      if (!answer) return reply('(no text reply)')
      const maxLen = Number(this.config.agent?.maxMessageLength) || 4000
      for (const chunk of splitText(answer, maxLen)) await reply(chunk)
    } catch (err) {
      try { await reply(`Failed: ${err.message}`) } catch {}
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
    return { adapters: () => this.adapters.map((a) => a.name), activeChats: () => this.chats.size }
  }
}
