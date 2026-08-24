import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTarget, normalizeAskBody, normalizeSendBody, normalizeButtons,
  dispatchMessenger, httpStatusForError, resolveAskTimeoutMs,
} from '../lib/messenger-api.js'

test('validateTarget requires platform and chatId', () => {
  assert.throws(() => validateTarget({}), /platform/)
  assert.throws(() => validateTarget({ platform: 'telegram' }), /chatId/)
  assert.deepEqual(validateTarget({ platform: 'telegram', chatId: 42 }), { platform: 'telegram', chatId: 42 })
})

test('normalizeAskBody requires text and buttons', () => {
  assert.throws(() => normalizeAskBody({}), /text/)
  assert.throws(() => normalizeAskBody({ text: 'hi' }), /button/)
  const body = normalizeAskBody({ text: 'ok?', buttons: [[{ id: 'yes', text: 'Yes' }]] })
  assert.equal(body.text, 'ok?')
  assert.equal(body.buttons[0][0].id, 'yes')
})

test('normalizeSendBody accepts text or files', () => {
  assert.throws(() => normalizeSendBody({}), /text or files/)
  assert.deepEqual(normalizeSendBody({ text: ' hi ' }), { text: 'hi' })
  const body = normalizeSendBody({ files: [{ dataBase64: 'AQID', mime: 'image/png', kind: 'photo', name: 'a.png' }] })
  assert.equal(body.files[0].bytes.length, 3)
})

test('normalizeButtons validates shape', () => {
  assert.throws(() => normalizeButtons('x'), /2d array/)
  assert.throws(() => normalizeButtons([[{ id: 'a' }]]), /id and text/)
})

test('dispatchMessenger returns 503 without gateway', async () => {
  await assert.rejects(() => dispatchMessenger(undefined, 'send', { target: { platform: 'telegram', chatId: 1 }, text: 'x' }), /not running/)
})

test('dispatchMessenger send delegates to gateway', async () => {
  const calls = []
  const gw = { messenger: { send: async (t, p) => calls.push([t, p]) } }
  await dispatchMessenger(gw, 'send', { target: { platform: 'telegram', chatId: 9 }, text: 'ping' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].chatId, 9)
})

test('httpStatusForError maps timeout', () => {
  assert.equal(httpStatusForError(new Error('messenger.ask timed out')), 504)
})

test('resolveAskTimeoutMs clamps invalid', () => {
  assert.equal(resolveAskTimeoutMs(undefined), 300_000)
  assert.equal(resolveAskTimeoutMs(999999999), 3_600_000)
})
