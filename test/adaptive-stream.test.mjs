import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditScheduler, startTypingHeartbeat } from '../lib/stream.js'

test('createEditScheduler dispatches fast first chunk before full interval', async () => {
  const sent = []
  const start = Date.now()
  // Interval is 400ms, first chunk delay is 60ms
  const scheduler = createEditScheduler(async (text) => {
    sent.push({ text, time: Date.now() - start })
  }, 400, 60)

  scheduler.push('chunk 1')
  // Wait 120ms (more than 60ms, but way less than 400ms)
  await new Promise((r) => setTimeout(r, 120))

  assert.equal(sent.length, 1, 'first chunk should be sent within fast delay')
  assert.equal(sent[0].text, 'chunk 1')

  // Now push second chunk; should throttle to 400ms
  scheduler.push('chunk 2')
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(sent.length, 1, 'second chunk should still be throttled by 400ms interval')

  await scheduler.flush()
  assert.equal(sent.length, 2, 'second chunk should be flushed')
  assert.equal(sent[1].text, 'chunk 2')
})

test('startTypingHeartbeat triggers immediately and repeats until stopped', async () => {
  let count = 0
  const stop = startTypingHeartbeat(async () => {
    count++
  }, 50)

  assert.equal(count, 1, 'typing should fire immediately on start')

  await new Promise((r) => setTimeout(r, 120))
  assert.ok(count >= 2, `typing should pulse periodically, got ${count}`)

  stop()
  const countAfterStop = count
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(count, countAfterStop, 'typing should not fire after stop')
})

test('startTypingHeartbeat handles non-function or throwing function gracefully', () => {
  assert.doesNotThrow(() => {
    const stop = startTypingHeartbeat(null)
    stop()
  })
  assert.doesNotThrow(() => {
    const stop = startTypingHeartbeat(() => { throw new Error('fail') }, 20)
    stop()
  })
})
