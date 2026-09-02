import test from 'node:test'
import assert from 'node:assert/strict'
import { DiscordAdapter, splitDiscordText } from '../lib/adapters/discord.js'

test('splitDiscordText splits text exceeding limit at whitespace', () => {
  assert.deepEqual(splitDiscordText(''), [])
  assert.deepEqual(splitDiscordText('hello world'), ['hello world'])

  const longText = 'word '.repeat(500)
  const chunks = splitDiscordText(longText, 100)
  assert.ok(chunks.length > 1)
  for (const c of chunks) {
    assert.ok(c.length <= 100)
  }
})

test('DiscordAdapter sends via webhook when configured', async (t) => {
  let webhookCall = null
  const origFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = origFetch })

  globalThis.fetch = async (url, opts) => {
    webhookCall = { url, opts, body: JSON.parse(opts.body) }
    return { ok: true, status: 200 }
  }

  const adapter = new DiscordAdapter({
    webhookUrl: 'https://discord.com/api/webhooks/123/abc',
  })
  await adapter.start()

  const res = await adapter.sendTo('webhook', { text: 'Hello from DSH!' })
  assert.equal(res.ok, true)
  assert.ok(webhookCall)
  assert.equal(webhookCall.url, 'https://discord.com/api/webhooks/123/abc')
  assert.equal(webhookCall.body.content, 'Hello from DSH!')
})

test('DiscordAdapter sends to specific channel via Bot API', async (t) => {
  let restCall = null
  const origFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = origFetch })

  globalThis.fetch = async (url, opts) => {
    restCall = { url, opts, body: JSON.parse(opts.body) }
    return { ok: true, status: 200 }
  }

  const adapter = new DiscordAdapter({
    botToken: 'secret-discord-token',
  })
  await adapter.start()

  const res = await adapter.sendTo('123456789', { text: 'Bot message' })
  assert.equal(res.ok, true)
  assert.ok(restCall)
  assert.equal(restCall.url, 'https://discord.com/api/v10/channels/123456789/messages')
  assert.equal(restCall.opts.headers.Authorization, 'Bot secret-discord-token')
  assert.equal(restCall.body.content, 'Bot message')
})
