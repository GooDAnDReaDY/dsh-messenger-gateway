import test from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createScheduler } from '../lib/scheduler.js'

test('cron-scheduler: recurring tasks reschedule next execution upon firing', async () => {
  const file = join(tmpdir(), `cron-sched-${randomUUID()}.json`)
  const fired = []
  const sched = createScheduler(file, async (task) => {
    fired.push(task)
  })

  const task = await sched.schedule({
    chatId: 12345,
    prompt: 'Check server load and disk space',
    dueAt: Date.now() - 100, // already due
    recurring: true,
    intervalMs: 60_000,
  })

  assert.equal(task.status, 'pending')
  assert.equal(task.recurring, true)

  await sched.checkDue()

  assert.equal(fired.length, 1)
  assert.equal(fired[0].prompt, 'Check server load and disk space')

  // Must remain pending with updated dueAt for recurring tasks
  const tasks = sched.getTasks()
  const updated = tasks.find(t => t.id === task.id)
  assert.equal(updated.status, 'pending')
  assert.ok(updated.dueAt > Date.now())
  assert.ok(updated.lastFiredAt > 0)
})

test('cron-scheduler: listRecurring filters only recurring active tasks', async () => {
  const file = join(tmpdir(), `cron-list-${randomUUID()}.json`)
  const sched = createScheduler(file)

  await sched.schedule({
    chatId: 100,
    text: 'one-shot reminder',
    dueAt: Date.now() + 100_000,
    recurring: false,
  })

  await sched.schedule({
    chatId: 100,
    prompt: 'cron heartbeat',
    dueAt: Date.now() + 100_000,
    recurring: true,
    intervalMs: 300_000,
  })

  const recurring = await sched.listRecurring(100)
  assert.equal(recurring.length, 1)
  assert.equal(recurring[0].prompt, 'cron heartbeat')
})

test('cron-scheduler: cancel cancels recurring task', async () => {
  const file = join(tmpdir(), `cron-cancel-${randomUUID()}.json`)
  const sched = createScheduler(file)

  const task = await sched.schedule({
    chatId: 200,
    prompt: 'daily report',
    dueAt: Date.now() + 50_000,
    recurring: true,
    intervalMs: 86400_000,
  })

  const ok = await sched.cancel(task.id, 200)
  assert.equal(ok, true)

  const recurring = await sched.listRecurring(200)
  assert.equal(recurring.length, 0)
})
