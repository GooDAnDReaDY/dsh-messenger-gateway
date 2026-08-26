import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_TELEGRAM_COMMANDS, normalizeTelegramCommands } from '../lib/commands.js'

test('default commands include model and status', () => {
  const names = DEFAULT_TELEGRAM_COMMANDS.map((c) => c.command)
  assert.ok(names.includes('model'))
  assert.ok(names.includes('status'))
})

test('normalize fills defaults', () => {
  const n = normalizeTelegramCommands([])
  assert.ok(n.some((c) => c.command === 'help'))
})
