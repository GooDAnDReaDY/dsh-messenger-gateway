import test from 'node:test'
import assert from 'node:assert/strict'
import { TelegramAdapter } from '../lib/adapters/telegram.js'

const mk = (opts) => new TelegramAdapter({ botToken: 'x', logger: { warn() {}, info() {}, error() {} }, ...opts })

test('status indicator disabled: no API call', async () => {
  const a = mk({})
  let called = 0
  a.call = async () => { called++; return {} }
  await a.setStatusIndicator('Online')
  assert.equal(called, 0)
})

test('status indicator enabled: calls setMyShortDescription', async () => {
  const a = mk({ statusIndicator: true })
  const calls = []
  a.call = async (m, p) => { calls.push([m, p]); return {} }
  await a.setStatusIndicator('Online')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'setMyShortDescription')
  assert.equal(calls[0][1].short_description, 'Online')
})

test('status indicator slices text to 120 chars', async () => {
  const a = mk({ statusIndicator: true })
  const calls = []
  a.call = async (m, p) => { calls.push([m, p]); return {} }
  await a.setStatusIndicator('x'.repeat(200))
  assert.equal(calls[0][1].short_description.length, 120)
})
