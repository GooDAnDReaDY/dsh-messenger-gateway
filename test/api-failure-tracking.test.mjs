import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ApiHealthTracker } from '../lib/api-health.js'
import { createScheduler } from '../lib/scheduler.js'

test('ApiHealthTracker records failures, error details, and resets on success', () => {
  const tracker = new ApiHealthTracker()

  assert.equal(tracker.consecutiveFailures, 0)
  assert.equal(tracker.lastError, null)
  assert.equal(tracker.isDegraded(), false)

  tracker.recordFailure('sendMessage', new Error('ETIMEDOUT'))
  assert.equal(tracker.consecutiveFailures, 1)
  assert.equal(tracker.lastError.op, 'sendMessage')
  assert.equal(tracker.lastError.message, 'ETIMEDOUT')
  assert.ok(typeof tracker.lastError.time === 'number')
  assert.equal(tracker.isDegraded(), false)

  tracker.recordFailure('editMessage', new Error('message not modified'))
  assert.equal(tracker.consecutiveFailures, 2)
  assert.equal(tracker.lastError.op, 'editMessage')
  assert.equal(tracker.isDegraded(), false)

  // 3rd failure reaches degraded threshold (default 3)
  tracker.recordFailure('sendChatAction', new Error('network unreachable'))
  assert.equal(tracker.consecutiveFailures, 3)
  assert.equal(tracker.isDegraded(), true)

  const snapshot = tracker.getSnapshot()
  assert.equal(snapshot.degraded, true)
  assert.equal(snapshot.consecutiveFailures, 3)
  assert.equal(snapshot.lastError.op, 'sendChatAction')

  // Reset on success
  tracker.recordSuccess()
  assert.equal(tracker.consecutiveFailures, 0)
  assert.equal(tracker.isDegraded(), false)
  assert.equal(tracker.getSnapshot().degraded, false)
})

test('ApiHealthTracker logs debug on every failure and escalates to warn at threshold', () => {
  const debugMessages = []
  const warnMessages = []
  const logger = {
    debug: (...args) => debugMessages.push(args.join(' ')),
    info: () => {},
    warn: (...args) => warnMessages.push(args.join(' ')),
    error: () => {},
  }

  const tracker = new ApiHealthTracker({ logger, warnThreshold: 5 })

  for (let i = 1; i <= 4; i++) {
    tracker.recordFailure('op_' + i, new Error('fail_' + i))
  }

  assert.equal(tracker.consecutiveFailures, 4)
  assert.equal(debugMessages.length, 4)
  assert.equal(warnMessages.length, 0)

  // 5th failure triggers warning
  tracker.recordFailure('op_5', new Error('fail_5'))
  assert.equal(tracker.consecutiveFailures, 5)
  assert.equal(debugMessages.length, 5)
  assert.equal(warnMessages.length, 1)
  assert.ok(warnMessages[0].includes('repeated failures'))
  assert.ok(warnMessages[0].includes('5 in a row'))

  // 6th-9th do not trigger additional warning
  for (let i = 6; i <= 9; i++) {
    tracker.recordFailure('op_' + i, new Error('fail_' + i))
  }
  assert.equal(warnMessages.length, 1)

  // 10th failure triggers second warning
  tracker.recordFailure('op_10', new Error('fail_10'))
  assert.equal(tracker.consecutiveFailures, 10)
  assert.equal(warnMessages.length, 2)
  assert.ok(warnMessages[1].includes('10 in a row'))
})

test('Scheduler logs warnings on task execution failure', async () => {
  const warned = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: (...args) => warned.push(args.join(' ')),
  }

  const testFile = join(tmpdir(), 'test-sched-' + String(Date.now()) + '.json')
  const sched = createScheduler(testFile, async () => {
    throw new Error('cron action failed')
  }, { logger })

  await sched.schedule({
    chatId: 100,
    text: 'due now',
    dueAt: Date.now() - 1000,
  })

  // Start will check due immediately
  sched.start(10000)
  // Give async task check a tick
  await new Promise((r) => setTimeout(r, 150))
  sched.stop()

  assert.ok(warned.length > 0, 'Should log a warning on task execution failure')
  assert.ok(warned[0].includes('scheduler task execution failed'))
})
