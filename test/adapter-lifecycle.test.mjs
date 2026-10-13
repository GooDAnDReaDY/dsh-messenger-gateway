// Duplicate answers: Telegram redelivers updates that were not acknowledged, and
// a Gateway restart used to leak the previous polling loop (adapters were
// registered only after `await adapter.start()`), so several loops fought over
// the same update. These tests cover the guards that prevent it.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { TelegramAdapter } from '../lib/adapters/telegram.js'

const here = dirname(fileURLToPath(import.meta.url))
const logger = { info() {}, warn() {}, error() {}, debug() {} }

test('the same update is never handled twice', async () => {
  const handled = []
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', logger })
  const update = {
    update_id: 5,
    message: { message_id: 1, chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/lang' },
  }
  adapter.onMessage = async (input) => { handled.push(input) }
  // Telegram repeats the same update (restart, conflicting long polls, redelivery)
  adapter.apiFetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: [update] }) })
  await adapter.poll()
  await adapter.poll()
  adapter.stop()
  assert.equal(handled.length, 1)
  assert.equal(adapter.offset, 6)
})

test('an adapter stopped during start() never begins polling', async () => {
  const calls = []
  const adapter = new TelegramAdapter({ botToken: 'TOKEN', logger })
  adapter.apiFetch = async (url) => {
    calls.push(String(url).split('/').pop())
    await new Promise((resolve) => setTimeout(resolve, 60))
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: 1, username: 'x' } }) }
  }
  const started = adapter.start()
  adapter.stop()
  await started
  assert.equal(adapter.stopped, true)
  assert.equal(calls.filter((method) => method === 'getUpdates').length, 0)
})

test('gateway registers adapters before awaiting their start (leak guard)', async () => {
  // Gateway builds its adapters through an internal factory, so the invariant is
  // checked on the source: an adapter must be reachable by stop() *while* it is
  // still starting, otherwise its polling loop outlives the gateway.
  const source = await readFile(join(here, '..', 'lib', 'gateway.js'), 'utf8')
  const pushAt = source.indexOf('this.adapterList.push(adapter)')
  const awaitAt = source.indexOf('await adapter.start()\n')
  assert.ok(pushAt > 0 && awaitAt > 0, 'both statements present')
  assert.ok(pushAt < awaitAt, 'adapter must be registered before await adapter.start()')
  assert.match(source, /stop\(\) \{\n\s+this\.stopped = true/)
  assert.ok(source.includes('if (this.stopped) {'), 'start() must bail out when stopped during the await')
})
