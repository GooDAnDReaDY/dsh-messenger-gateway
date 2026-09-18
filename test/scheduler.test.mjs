import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  parseRelativeTime,
  formatRemaining,
  createScheduler,
} from '../lib/scheduler.js'

test('parseRelativeTime parses seconds, minutes, hours, days', () => {
  assert.equal(parseRelativeTime('30s'), 30 * 1000)
  assert.equal(parseRelativeTime('15s'), 15 * 1000)
  assert.equal(parseRelativeTime('5m'), 5 * 60 * 1000)
  assert.equal(parseRelativeTime('10m'), 10 * 60 * 1000)
  assert.equal(parseRelativeTime('2h'), 2 * 3600 * 1000)
  assert.equal(parseRelativeTime('3h'), 3 * 3600 * 1000)
  assert.equal(parseRelativeTime('1d'), 24 * 3600 * 1000)
  assert.equal(parseRelativeTime('2d'), 2 * 86400 * 1000)

  assert.equal(parseRelativeTime(''), null)
  assert.equal(parseRelativeTime('abc'), null)
  assert.equal(parseRelativeTime('-5m'), null)
})

test('formatRemaining formats human-readable durations', () => {
  assert.equal(formatRemaining(0), 'now')
  assert.equal(formatRemaining(-1000), 'now')
  assert.equal(formatRemaining(45 * 1000), '45s')
  assert.equal(formatRemaining(5 * 60 * 1000), '5m')
  assert.equal(formatRemaining(2 * 3600 * 1000), '2h')
  assert.equal(formatRemaining(2 * 3600 * 1000 + 15 * 60 * 1000), '2h 15m')
})

test('createScheduler schedules, lists, cancels and executes tasks', async () => {
  const file = join(tmpdir(), `test-sched-${randomUUID()}.json`)
  const fired = []
  const sched = createScheduler(file, async (task) => {
    fired.push(task)
  })

  // Schedule task 1 (due in the future)
  const t1 = await sched.schedule({
    chatId: 100,
    text: 'Reminder 1',
    dueAt: Date.now() + 100000,
  })
  assert.ok(t1.id)
  assert.equal(t1.status, 'pending')

  // Schedule task 2 (due in the past / immediately)
  const t2 = await sched.schedule({
    chatId: 100,
    text: 'Immediate reminder',
    dueAt: Date.now() - 100,
  })

  // List tasks for chat 100
  const active = await sched.list(100)
  assert.equal(active.length, 1)
  assert.equal(active[0].id, t1.id)

  // Check due tasks
  await sched.checkDue()
  assert.equal(fired.length, 1)
  assert.equal(fired[0].id, t2.id)
  assert.equal(fired[0].text, 'Immediate reminder')

  // Cancel task 1
  const cancelled = await sched.cancel(t1.id, 100)
  assert.equal(cancelled, true)

  const emptyList = await sched.list(100)
  assert.equal(emptyList.length, 0)
})

test('scheduler prunes expired fired tasks older than retention limit', async () => {
  const file = join(tmpdir(), `test-sched-prune-${randomUUID()}.json`)
  const sched = createScheduler(file)
  const tOld = await sched.schedule({ chatId: 1, text: 'Old', dueAt: Date.now() - 100 })
  tOld.status = 'fired'
  tOld.firedAt = Date.now() - (8 * 86400 * 1000)
  await sched.save()
  assert.equal(sched.getTasks().length, 0)
})
