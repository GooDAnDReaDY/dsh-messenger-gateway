import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseRetryAfter,
  computeOutboxBackoffMs,
  isTerminalSendError,
  createOutboxQueue,
  resolveOutboxStoragePath,
} from '../lib/outbox.js'
import { handleGatewayCommand } from '../lib/gateway-commands.js'

test('parseRetryAfter extracts retry seconds from various error formats', () => {
  assert.equal(parseRetryAfter({ parameters: { retry_after: 14 } }), 14)
  assert.equal(parseRetryAfter({ response: { parameters: { retry_after: 42 } } }), 42)
  assert.equal(parseRetryAfter(new Error('telegram sendMessage: Too Many Requests: retry after 9')), 9)
  assert.equal(parseRetryAfter(new Error('ETIMEDOUT')), null)
  assert.equal(parseRetryAfter(null), null)
})

test('computeOutboxBackoffMs obeys retry_after and calculates exponential delay', () => {
  // With retry_after: ~5000ms (+ jitter < 400ms)
  const delayFrom429 = computeOutboxBackoffMs(1, 5)
  assert.ok(delayFrom429 >= 5000 && delayFrom429 <= 5400)

  // Without retry_after: 1000 * 2^(attempts-1) + jitter
  const delay1 = computeOutboxBackoffMs(1)
  assert.ok(delay1 >= 1000 && delay1 <= 1400)

  const delay3 = computeOutboxBackoffMs(3)
  assert.ok(delay3 >= 4000 && delay3 <= 4400)
})

test('isTerminalSendError identifies non-retryable 4xx client errors', () => {
  assert.equal(isTerminalSendError(new Error('Forbidden: bot was blocked by the user')), true)
  assert.equal(isTerminalSendError(new Error('Bad Request: chat not found')), true)
  assert.equal(isTerminalSendError(new Error('Bad Request: message is too long')), true)
  assert.equal(isTerminalSendError(new Error('Bad Request: message thread not found')), true)
  assert.equal(isTerminalSendError(new Error('Bad Request: message text is empty')), true)

  // Network drops and server errors are NOT terminal (must be retried)
  assert.equal(isTerminalSendError(new Error('Bad Gateway 502')), false)
  assert.equal(isTerminalSendError(new Error('connect ECONNRESET')), false)
  assert.equal(isTerminalSendError(new Error('ETIMEDOUT')), false)
})

test('createOutboxQueue enqueues, delivers, and persists to disk', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-outbox-test-'))
  const storagePath = join(tmpDir, 'outbox-queue.json')

  try {
    const delivered = []
    const queue = createOutboxQueue({
      storagePath,
      senderFn: async (job) => {
        delivered.push(job)
      },
      flushIntervalMs: 0, // manual flush
    })

    await queue.enqueue({
      target: { platform: 'telegram', chatId: 12345, threadId: 0 },
      payload: { text: 'Hello from Outbox!' },
    })

    assert.equal(delivered.length, 1)
    assert.equal(delivered[0].payload.text, 'Hello from Outbox!')
    assert.equal(queue.status().pendingCount, 0)
    assert.equal(queue.status().dlqCount, 0)
    assert.equal(existsSync(storagePath), true)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('createOutboxQueue retries on transient errors and moves to DLQ on max attempts', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-outbox-test-'))
  const storagePath = join(tmpDir, 'outbox-queue.json')

  try {
    let sendCalls = 0
    const dlqAlerts = []
    const queue = createOutboxQueue({
      storagePath,
      defaultMaxAttempts: 3,
      senderFn: async () => {
        sendCalls++
        throw new Error('502 Bad Gateway')
      },
      onDlq: (job, err) => {
        dlqAlerts.push({ job, err })
      },
      flushIntervalMs: 0,
    })

    // 1. Initial enqueue fails -> attempts = 1, nextRetryAt set in future
    await queue.enqueue({
      target: { platform: 'telegram', chatId: 999 },
      payload: { text: 'Reliable alert' },
    })

    assert.equal(sendCalls, 1)
    assert.equal(queue.status().pendingCount, 1)
    assert.equal(queue.status().dlqCount, 0)
    assert.equal(queue.status().pending[0].attempts, 1)

    // Fast-forward nextRetryAt for 2nd attempt
    queue.status().pending[0].nextRetryAt = Date.now() - 1000
    await queue.flush()
    assert.equal(sendCalls, 2)
    assert.equal(queue.status().pending[0].attempts, 2)
    assert.equal(queue.status().dlqCount, 0)

    // Fast-forward nextRetryAt for 3rd attempt -> reaches maxAttempts (3) -> moved to DLQ
    queue.status().pending[0].nextRetryAt = Date.now() - 1000
    await queue.flush()
    assert.equal(sendCalls, 3)
    assert.equal(queue.status().pendingCount, 0)
    assert.equal(queue.status().dlqCount, 1)
    assert.equal(dlqAlerts.length, 1)
    assert.equal(dlqAlerts[0].job.target.chatId, 999)

    // Test retryDlq: moves back from DLQ to pending
    const retriedCount = await queue.retryDlq()
    assert.equal(retriedCount, 1)
    assert.equal(queue.status().pendingCount, 1) // back in pending queue after 1st retry attempt
    assert.equal(queue.status().pending[0].attempts, 1)
    assert.equal(sendCalls, 4)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('createOutboxQueue moves terminal 4xx errors directly to DLQ without retries', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-outbox-test-'))
  const storagePath = join(tmpDir, 'outbox-queue.json')

  try {
    let sendCalls = 0
    const queue = createOutboxQueue({
      storagePath,
      defaultMaxAttempts: 5,
      senderFn: async () => {
        sendCalls++
        throw new Error('Forbidden: bot was blocked by the user')
      },
      flushIntervalMs: 0,
    })

    await queue.enqueue({
      target: { platform: 'telegram', chatId: 555 },
      payload: { text: 'Blocked message' },
    })

    assert.equal(sendCalls, 1)
    assert.equal(queue.status().pendingCount, 0)
    assert.equal(queue.status().dlqCount, 1)
    assert.equal(queue.status().dlq[0].terminal, true)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('createOutboxQueue recovers uncommitted pending jobs on process restart', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-outbox-test-'))
  const storagePath = join(tmpDir, 'outbox-queue.json')

  try {
    // 1. Process 1: Network fails, job queued to disk
    const queue1 = createOutboxQueue({
      storagePath,
      senderFn: async () => {
        throw new Error('Telegram network outage')
      },
      flushIntervalMs: 0,
    })

    await queue1.enqueue({
      id: 'job-recoverable-1',
      target: { platform: 'telegram', chatId: 777 },
      payload: { text: 'Message from before restart' },
    })

    assert.equal(queue1.status().pendingCount, 1)
    queue1.stop()

    // 2. Process 2: Gateway restarts, network is back up
    const recoveredDelivered = []
    const queue2 = createOutboxQueue({
      storagePath,
      senderFn: async (job) => {
        recoveredDelivered.push(job)
      },
      flushIntervalMs: 0,
    })

    assert.equal(queue2.status().pendingCount, 1)
    // Fast-forward retry and flush
    queue2.status().pending[0].nextRetryAt = Date.now() - 100
    await queue2.flush()

    assert.equal(recoveredDelivered.length, 1)
    assert.equal(recoveredDelivered[0].id, 'job-recoverable-1')
    assert.equal(recoveredDelivered[0].payload.text, 'Message from before restart')
    assert.equal(queue2.status().pendingCount, 0)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('handleGatewayCommand /outbox shows status and handles retry/clear', async () => {
  const replies = []
  const mockOutbox = {
    status: () => ({
      pendingCount: 2,
      dlqCount: 1,
      dlq: [{ id: 'deadbeef-1234', target: { chatId: 123 }, error: 'HTTP 502' }],
    }),
    retryDlq: async () => 1,
    clearDlq: async () => 1,
  }

  const gw = {
    outbox: mockOutbox,
    resolveLocale: () => 'en',
    chats: new Map(),
  }

  const input = {
    chatId: 100,
    userId: 42,
    reply: (msg) => replies.push(msg),
  }

  // /outbox status
  await handleGatewayCommand(gw, 'key', '/outbox', input)
  assert.ok(replies[replies.length - 1].includes('Outbox Transactional Queue'))
  assert.ok(replies[replies.length - 1].includes('Pending messages: <b>2</b>'))
  assert.ok(replies[replies.length - 1].includes('Dead Letter Queue (DLQ): <b>1</b>'))

  // /outbox retry
  await handleGatewayCommand(gw, 'key', '/outbox retry', input)
  assert.ok(replies[replies.length - 1].includes('Moved <b>1</b> DLQ items back to outbox'))

  // /outbox clear
  await handleGatewayCommand(gw, 'key', '/outbox clear', input)
  assert.ok(replies[replies.length - 1].includes('Cleared <b>1</b> items from Dead Letter Queue'))
})
