import test from 'node:test'
import assert from 'node:assert/strict'
import { t } from '../lib/locales/index.js'

// Test the Safety Gate 2.0 approval logic contract
function createApprovalHandler(gw) {
  return async function answerApproval(chatKeyValue, req, next) {
    try {
      const chat = gw.chats.get(chatKeyValue)
      if (!chat?.target) return next()
      const tool = req.toolName || 'tool'
      if (chat.sessionAllowlist?.has(tool)) {
        return 'allowed-once'
      }
      const locale = gw.resolveLocale ? gw.resolveLocale(chat.target) : 'en'
      const reason = req.reason ? `\n<i>${req.reason}</i>` : ''
      let detail = ''
      if (req.input && typeof req.input === 'object') {
        try {
          const jsonStr = JSON.stringify(req.input, null, 2)
          detail = `\n<pre><code>${jsonStr.slice(0, 500)}</code></pre>`
        } catch {}
      }
      const text = t('ask.confirm_title', { tool, reason: reason + detail }, locale)
      const buttons = [
        [
          { id: 'allow_once', text: t('ask.allow_once', {}, locale) },
          { id: 'allow_session', text: t('ask.allow_session', {}, locale) },
          { id: 'deny', text: t('ask.deny', {}, locale) },
        ],
      ]
      const result = await gw.messengerAsk(chat.target, { text, buttons }, 300_000)
      if (result?.buttonId === 'allow_once' || result?.buttonId === 'allow') return 'allowed-once'
      if (result?.buttonId === 'allow_session') {
        if (!chat.sessionAllowlist) chat.sessionAllowlist = new Set()
        chat.sessionAllowlist.add(tool)
        return 'allowed-once'
      }
      if (result?.buttonId === 'deny') return 'rejected'
      return next()
    } catch {
      return next()
    }
  }
}

test('approval-safety: sessionAllowlist skips prompt for already approved tools', async () => {
  const gw = {
    chats: new Map(),
    resolveLocale: () => 'en',
    messengerAsk: null,
  }
  const handler = createApprovalHandler(gw)
  const chatKey = 'tg:12345:0'
  const chat = {
    key: chatKey,
    sessionAllowlist: new Set(['bash']),
    target: { platform: 'telegram', chatId: 12345, threadId: 0 },
  }
  gw.chats.set(chatKey, chat)

  let asked = false
  gw.messengerAsk = async () => {
    asked = true
    return { buttonId: 'allow_once' }
  }

  // bash is already in sessionAllowlist
  const res1 = await handler(chatKey, { toolName: 'bash' }, () => 'next')
  assert.equal(res1, 'allowed-once')
  assert.equal(asked, false, 'Should not prompt if tool in sessionAllowlist')

  // curl is NOT in sessionAllowlist -> prompts
  const res2 = await handler(chatKey, { toolName: 'curl' }, () => 'next')
  assert.equal(res2, 'allowed-once')
  assert.equal(asked, true, 'Should prompt for tool not in sessionAllowlist')
})

test('approval-safety: allow_session adds tool to sessionAllowlist', async () => {
  const gw = {
    chats: new Map(),
    resolveLocale: () => 'en',
    messengerAsk: null,
  }
  const handler = createApprovalHandler(gw)
  const chatKey = 'tg:888:0'
  const chat = {
    key: chatKey,
    sessionAllowlist: new Set(),
    target: { platform: 'telegram', chatId: 888, threadId: 0 },
  }
  gw.chats.set(chatKey, chat)

  gw.messengerAsk = async () => {
    return { buttonId: 'allow_session' }
  }

  const res = await handler(chatKey, { toolName: 'write_file' }, () => 'next')
  assert.equal(res, 'allowed-once')
  assert.ok(chat.sessionAllowlist.has('write_file'), 'write_file must be added to sessionAllowlist')

  // Subsequent call should not prompt
  let promptedAgain = false
  gw.messengerAsk = async () => {
    promptedAgain = true
    return { buttonId: 'deny' }
  }
  const res2 = await handler(chatKey, { toolName: 'write_file' }, () => 'next')
  assert.equal(res2, 'allowed-once')
  assert.equal(promptedAgain, false)
})

test('approval-safety: deny decision returns rejected', async () => {
  const gw = {
    chats: new Map(),
    resolveLocale: () => 'en',
    messengerAsk: null,
  }
  const handler = createApprovalHandler(gw)
  const chatKey = 'tg:999:0'
  const chat = {
    key: chatKey,
    sessionAllowlist: new Set(),
    target: { platform: 'telegram', chatId: 999, threadId: 0 },
  }
  gw.chats.set(chatKey, chat)

  gw.messengerAsk = async () => {
    return { buttonId: 'deny' }
  }

  const res = await handler(chatKey, { toolName: 'dangerous_rm' }, () => 'next')
  assert.equal(res, 'rejected')
  assert.equal(chat.sessionAllowlist.has('dangerous_rm'), false)
})
