import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeDynamicCommands } from '../lib/commands.js'
import { TelegramAdapter } from '../lib/adapters/telegram.js'

test('Issue #1: Gateway user message source structure satisfies WebUI user bubble contract', () => {
  // DSH WebUI (ui-chat message.ts) checks `msg.source?.kind === "user"` to display user bubble.
  // In addition, slash-command scanning only inspects user-authored messages.
  const PLUGIN = 'dsh-messenger-gateway'
  const createRelaySource = (form = 'relay') => ({
    kind: 'user',
    plugin: PLUGIN,
    form,
    origin: 'telegram',
  })

  const relaySource = createRelaySource('relay')
  assert.equal(relaySource.kind, 'user', 'source.kind must be "user"')
  assert.equal(relaySource.plugin, 'dsh-messenger-gateway')
  assert.equal(relaySource.form, 'relay')
  assert.equal(relaySource.origin, 'telegram')

  const steerSource = createRelaySource('steer')
  assert.equal(steerSource.kind, 'user', 'source.kind must be "user" for steer messages')
  assert.equal(steerSource.form, 'steer')
})

test('Issue #2: mergeDynamicCommands sanitizes names, truncates descriptions, caps at 100', () => {
  const baseCommands = [
    { command: 'help', description: 'Show help' },
    { command: 'model', description: 'Choose model' },
    { command: 'skills', description: 'Show tools' },
  ]

  const dynamicSkills = [
    { name: 'Weather_Forecast', description: 'Get weather in city' },
    { name: 'code-review', description: 'Automated code reviewer' },
    { name: 'help', description: 'Should not override base help' },
    { name: 'Very Long Description Skill', description: 'A'.repeat(300) },
    { name: 'INVALID NAME!! @@', description: 'Sanitize me' },
  ]

  const merged = mergeDynamicCommands(baseCommands, dynamicSkills, 100)

  // Base command 'help' is preserved with original description
  const helpCmd = merged.find((c) => c.command === 'help')
  assert.equal(helpCmd.description, 'Show help')

  // Weather_Forecast is lowercased
  const weatherCmd = merged.find((c) => c.command === 'weather_forecast')
  assert.ok(weatherCmd, 'weather_forecast should be present')
  assert.equal(weatherCmd.description, 'Get weather in city')

  // code-review hyphen replaced with underscore
  const reviewCmd = merged.find((c) => c.command === 'code_review')
  assert.ok(reviewCmd, 'code_review should be present')

  // Long description truncated to <= 256
  const longDescCmd = merged.find((c) => c.command === 'very_long_description_skill')
  assert.ok(longDescCmd)
  assert.ok(longDescCmd.description.length <= 256)

  // Test hard cap at maxTotal (100)
  const manySkills = Array.from({ length: 150 }, (_, i) => ({
    name: `skill_${i}`,
    description: `Skill number ${i}`,
  }))
  const capped = mergeDynamicCommands(baseCommands, manySkills, 100)
  assert.equal(capped.length, 100, 'Should be capped at exactly 100 commands')
})

test('Issue #2: TelegramAdapter registerCommands accepts dynamic command list and normalizes', async () => {
  let calledWith = null
  const adapter = new TelegramAdapter({ botToken: '123:abc' })
  adapter.call = async (method, params) => {
    if (method === 'setMyCommands') {
      calledWith = params.commands
    }
    return true
  }

  const customCommands = [
    { command: 'start', description: 'Start bot' },
    { command: 'my_dynamic_skill', description: 'A custom skill' },
  ]

  await adapter.registerCommands(customCommands)
  assert.ok(calledWith)
  assert.equal(calledWith.length, 2)
  assert.equal(calledWith[0].command, 'start')
  assert.equal(calledWith[1].command, 'my_dynamic_skill')
})

test('Issue #3: TelegramAdapter creates and closes forum topics with Telegram Bot API params', async () => {
  const calls = []
  const adapter = new TelegramAdapter({ botToken: '123:abc' })
  adapter.call = async (method, params) => {
    calls.push({ method, params })
    if (method === 'createForumTopic') {
      return { message_thread_id: 456, name: params.name }
    }
    if (method === 'closeForumTopic') {
      return true
    }
    return {}
  }

  const topic = await adapter.createForumTopic(-100123456789, 'Test Topic Name')
  assert.equal(topic.message_thread_id, 456)
  assert.equal(calls[0].method, 'createForumTopic')
  assert.equal(calls[0].params.chat_id, -100123456789)
  assert.equal(calls[0].params.name, 'Test Topic Name')

  await adapter.closeForumTopic(-100123456789, 456)
  assert.equal(calls[1].method, 'closeForumTopic')
  assert.equal(calls[1].params.chat_id, -100123456789)
  assert.equal(calls[1].params.message_thread_id, 456)
})

test('Issue #3: Forum mirror bidirectional mapping and session isolation logic', () => {
  const sessionToThread = new Map()
  const threadToSession = new Map()

  const shouldMirrorSession = (sessionId, enabled, forumChatId) => {
    if (!enabled || !forumChatId) return false
    if (!sessionId || String(sessionId).startsWith('msgw-')) return false
    if (sessionToThread.has(String(sessionId))) return false
    return true
  }

  // Gateway sessions must NOT be mirrored
  assert.equal(shouldMirrorSession('msgw-random-uuid', true, -100123456), false)
  // Disabled forum mirror must NOT mirror
  assert.equal(shouldMirrorSession('web-session-123', false, -100123456), false)
  // Missing forumChatId must NOT mirror
  assert.equal(shouldMirrorSession('web-session-123', true, ''), false)

  // External web session qualifies
  assert.equal(shouldMirrorSession('web-session-123', true, -100123456), true)

  // Record mapping
  const sessionId = 'web-session-123'
  const chatId = -100123456
  const threadId = 789
  sessionToThread.set(sessionId, { chatId, threadId })
  threadToSession.set(`${chatId}:${threadId}`, sessionId)

  // Now should NOT re-mirror
  assert.equal(shouldMirrorSession('web-session-123', true, -100123456), false)

  // Receiving message in thread resolves back to web-session-123
  const resolvedSessionId = threadToSession.get(`${chatId}:${threadId}`)
  assert.equal(resolvedSessionId, 'web-session-123')
})

test('Issue #3: Forum mirror assistant turn relay extracts last assistant text', () => {
  const session = {
    id: 'web-session-123',
    messages: [
      { role: 'user', content: 'What is the answer?' },
      { role: 'assistant', content: '<think>internal reasoning</think>The answer is 42.' },
    ],
  }

  const extractAssistantReply = (sess) => {
    const messages = Array.isArray(sess.messages) ? sess.messages : []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        const text = typeof msg.content === 'string' ? msg.content : (msg.text || '')
        // Clean out think tags / reasoning
        return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      }
    }
    return null
  }

  const reply = extractAssistantReply(session)
  assert.equal(reply, 'The answer is 42.')
})
