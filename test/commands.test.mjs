import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TELEGRAM_COMMANDS, normalizeTelegramCommands } from '../lib/commands.js'

test('normalizeTelegramCommands uses defaults when empty', () => {
  assert.deepEqual(normalizeTelegramCommands([]), DEFAULT_TELEGRAM_COMMANDS)
})

test('normalizeTelegramCommands strips slash and dedupes', () => {
  const out = normalizeTelegramCommands([
    { command: '/ping', description: 'Ping' },
    { command: 'ping', description: 'Dup' },
    { command: 'help', description: 'Help override' },
  ])
  assert.deepEqual(out, [
    { command: 'ping', description: 'Ping' },
    { command: 'help', description: 'Help override' },
  ])
})
