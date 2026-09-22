import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldProcessTelegramMessage, textMentionsBot, stripBotCommandSuffix,
} from '../lib/groups.js'

test('private always ok', () => {
  assert.equal(shouldProcessTelegramMessage({ chatType: 'private', text: 'hi' }).ok, true)
})

test('group requires mention by default', () => {
  const r = shouldProcessTelegramMessage({
    chatType: 'supergroup', text: 'hello', botUsername: 'mybot', groupsEnabled: true, requireMention: true,
  })
  assert.equal(r.ok, false)
})

test('group mention via entity', () => {
  const text = 'hey @mybot do it'
  const r = shouldProcessTelegramMessage({
    chatType: 'group',
    text,
    entities: [{ type: 'mention', offset: 4, length: 6 }],
    botUsername: 'mybot',
    groupsEnabled: true,
    requireMention: true,
  })
  assert.equal(r.ok, true)
  assert.equal(r.reason, 'mention')
})

test('group reply to bot', () => {
  const r = shouldProcessTelegramMessage({
    chatType: 'supergroup',
    text: 'continue',
    replyTo: { from: { id: 99, is_bot: true } },
    botId: 99,
    botUsername: 'mybot',
  })
  assert.equal(r.ok, true)
  assert.equal(r.reason, 'reply-to-bot')
})

test('group command ok', () => {
  assert.equal(shouldProcessTelegramMessage({
    chatType: 'group', text: '/status@mybot', botUsername: 'mybot',
  }).ok, true)
})

test('groups disabled', () => {
  assert.equal(shouldProcessTelegramMessage({
    chatType: 'group', text: '@mybot hi', botUsername: 'mybot', groupsEnabled: false,
  }).ok, false)
})

test('strip bot suffix', () => {
  assert.equal(stripBotCommandSuffix('/help@MyBot please', 'MyBot'), '/help please')
})

test('textMentionsBot fallback', () => {
  assert.equal(textMentionsBot('ping @CoolBot now', null, 'CoolBot'), true)
})
