import test from 'node:test'
import assert from 'node:assert/strict'
import { SlackAdapter, splitSlackText } from '../lib/adapters/slack.js'

test('splitSlackText splits text exceeding limit', () => {
  assert.deepEqual(splitSlackText(''), [])
  assert.deepEqual(splitSlackText('hello slack'), ['hello slack'])

  const longText = 'paragraph\n'.repeat(500)
  const chunks = splitSlackText(longText, 200)
  assert.ok(chunks.length > 1)
  for (const c of chunks) {
    assert.ok(c.length <= 200)
  }
})

test('SlackAdapter sends via webhook when configured', async (t) => {
  let webhookCall = null
  const origFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = origFetch })

  globalThis.fetch = async (url, opts) => {
    webhookCall = { url, opts, body: JSON.parse(opts.body) }
    return { ok: true, status: 200 }
  }

  const adapter = new SlackAdapter({
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00',
  })
  await adapter.start()

  const res = await adapter.sendTo('webhook', { text: 'Hello Slack Webhook!' })
  assert.equal(res.ok, true)
  assert.ok(webhookCall)
  assert.equal(webhookCall.url, 'https://hooks.slack.com/services/T00/B00/X00')
  assert.equal(webhookCall.body.text, 'Hello Slack Webhook!')
})

test('SlackAdapter sends via chat.postMessage with channel and thread', async (t) => {
  let apiCall = null
  const origFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = origFetch })

  globalThis.fetch = async (url, opts) => {
    apiCall = { url, opts, body: JSON.parse(opts.body) }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, ts: '123456.789' }),
    }
  }

  const adapter = new SlackAdapter({
    botToken: 'xoxb-slack-token',
  })
  await adapter.start()

  const res = await adapter.sendTo('C123456', { text: 'Threaded reply' }, { threadId: '111111.222' })
  assert.equal(res.ok, true)
  assert.ok(apiCall)
  assert.equal(apiCall.url, 'https://slack.com/api/chat.postMessage')
  assert.equal(apiCall.opts.headers.Authorization, 'Bearer xoxb-slack-token')
  assert.equal(apiCall.body.channel, 'C123456')
  assert.equal(apiCall.body.text, 'Threaded reply')
  assert.equal(apiCall.body.thread_ts, '111111.222')
})
