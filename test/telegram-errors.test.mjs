import test from 'node:test'
import assert from 'node:assert/strict'
import { isResendSafeNetworkError, isPollingConflict, isTopicGoneError } from '../lib/telegram-errors.js'

const net = (message, code) => ({ message: 'fetch failed', cause: { message, code } })

test('resend-safe: connect timeout', () => {
  assert.equal(isResendSafeNetworkError(net('Connect Timeout', 'UND_ERR_CONNECT_TIMEOUT')), true)
})

test('resend-safe: pool timeout (request not sent)', () => {
  assert.equal(isResendSafeNetworkError(net('Pool timeout: All connections occupied. Request was *not* sent to Telegram.', 'UND_ERR_POOL_TIMEOUT')), true)
})

test('resend-safe: ECONNRESET', () => {
  assert.equal(isResendSafeNetworkError(net('read ECONNRESET', 'ECONNRESET')), true)
})

test('not resend-safe: generic timeout that may have reached server', () => {
  assert.equal(isResendSafeNetworkError(net('The operation was timed out', 'UND_ERR_HEADERS_TIMEOUT')), false)
})

test('not resend-safe: Telegram 4xx', () => {
  assert.equal(isResendSafeNetworkError(new Error('telegram sendMessage: 400 Bad Request: chat not found')), false)
})

test('polling conflict detected', () => {
  assert.equal(isPollingConflict(new Error('telegram getUpdates: 409 Conflict: terminated by other getUpdates request; make sure that only one bot instance is running')), true)
})

test('polling conflict not false-positive on send error', () => {
  assert.equal(isPollingConflict(new Error('telegram sendMessage: 400 Bad Request')), false)
})

test('topic-gone: thread not found', () => {
  assert.equal(isTopicGoneError(new Error('telegram sendMessage: 400 Bad Request: thread not found')), true)
})

test('topic-gone: topic deleted', () => {
  assert.equal(isTopicGoneError(new Error('telegram editMessageText: 400 Bad Request: topic_closed')), true)
})

test('topic-gone: false on unrelated bad request', () => {
  assert.equal(isTopicGoneError(new Error('telegram sendMessage: 400 Bad Request: PEER_ID_INVALID')), false)
})
