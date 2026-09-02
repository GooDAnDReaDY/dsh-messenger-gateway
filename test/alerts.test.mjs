import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAlertMessage,
  resolveAlertTarget,
} from '../lib/alerts.js'

test('formatAlertMessage formats pairing alerts with code and user info', () => {
  const msg = formatAlertMessage('pairing', {
    userId: 987654321,
    username: 'testuser',
    code: 'ABCD12',
  })
  assert.ok(msg.includes('🔐 <b>[Запрос сопряжения]</b>'))
  assert.ok(msg.includes('@testuser'))
  assert.ok(msg.includes('987654321'))
  assert.ok(msg.includes('ABCD12'))
  assert.ok(msg.includes('/pair ABCD12'))
})

test('formatAlertMessage formats error alerts with code and message', () => {
  const msg = formatAlertMessage('error', {
    code: 'TIMEOUT',
    message: 'Request timed out after 30s',
    sessionId: 'sess-999',
    chatId: -1001234567,
    threadId: 42,
  })
  assert.ok(msg.includes('🚨 <b>[Ошибка шлюза]</b>'))
  assert.ok(msg.includes('TIMEOUT'))
  assert.ok(msg.includes('Request timed out after 30s'))
  assert.ok(msg.includes('sess-999'))
  assert.ok(msg.includes('-1001234567'))
  assert.ok(msg.includes('42'))
})

test('formatAlertMessage formats status alerts', () => {
  const msg = formatAlertMessage('status', {
    title: 'Gateway Started',
    details: 'Uptime 0s',
  })
  assert.ok(msg.includes('⚡ <b>[Шлюз: Gateway Started]</b>'))
  assert.ok(msg.includes('Uptime 0s'))
})

test('resolveAlertTarget resolves target from config or named home', () => {
  const gwDisabled = { config: { telegram: { alerts: { enabled: false, chatId: 1234 } } } }
  assert.equal(resolveAlertTarget(gwDisabled), null)

  const gwDirect = {
    config: {
      telegram: {
        alerts: { enabled: true, chatId: -1001234, threadId: 10 },
      },
    },
  }
  const directTarget = resolveAlertTarget(gwDirect)
  assert.equal(directTarget.platform, 'telegram')
  assert.equal(directTarget.chatId, -1001234)
  assert.equal(directTarget.threadId, 10)

  const gwHome = {
    config: {
      telegram: {
        alerts: { enabled: true, home: 'admin' },
      },
    },
    resolveHomeTarget: (platform, name) => {
      if (name === 'admin') return { platform: 'telegram', chatId: -100999, threadId: 0 }
      return null
    },
  }
  const homeTarget = resolveAlertTarget(gwHome)
  assert.equal(homeTarget.chatId, -100999)
})
