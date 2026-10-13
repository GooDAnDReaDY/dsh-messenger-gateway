// The settings card saves whole sections, but DSH never sends role('secret')
// values to the browser — saving anything (for example the proxy) would clear the
// bot token. lib/secret-guard.js restores secrets a write emptied.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readSecrets, restoreSecrets, SECRET_FIELDS } from '../lib/secret-guard.js'

test('readSecrets snapshots the configured secrets', () => {
  const snapshot = readSecrets({
    telegram: { botToken: '123:ABC', webhookSecret: 'whsec' },
    discord: { botToken: 'dc' },
    slack: { botToken: '' },
    webhooks: { secret: 'hook' },
  })
  assert.equal(snapshot['telegram.botToken'], '123:ABC')
  assert.equal(snapshot['slack.botToken'], '')
  assert.equal(Object.keys(snapshot).length, SECRET_FIELDS.length)
})

test('restoreSecrets puts back values cleared by a settings write', () => {
  const snapshot = readSecrets({
    telegram: { botToken: '123:ABC', webhookSecret: 'whsec' },
    discord: { botToken: 'dc' },
    webhooks: { secret: 'hook' },
  })
  const after = {
    telegram: { botToken: '', webhookSecret: '', enabled: true },
    discord: { botToken: '' },
    slack: { botToken: '' },
    webhooks: { secret: '' },
  }
  const { config, restored } = restoreSecrets(snapshot, after)
  assert.deepEqual(restored.sort(), [
    'discord.botToken', 'telegram.botToken', 'telegram.webhookSecret', 'webhooks.secret',
  ])
  assert.equal(config.telegram.botToken, '123:ABC')
  assert.equal(config.telegram.webhookSecret, 'whsec')
  assert.equal(config.telegram.enabled, true)
})

test('an explicitly changed secret always wins', () => {
  const snapshot = readSecrets({ telegram: { botToken: '123:ABC' } })
  const { config, restored } = restoreSecrets(snapshot, { telegram: { botToken: '999:NEW' } })
  assert.ok(!restored.includes('telegram.botToken'))
  assert.equal(config.telegram.botToken, '999:NEW')
})

test('nothing to restore when no secret was set', () => {
  const { restored } = restoreSecrets(readSecrets({}), { telegram: {}, discord: {}, slack: {}, webhooks: {} })
  assert.equal(restored.length, 0)
})
