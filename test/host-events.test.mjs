import test from 'node:test'
import assert from 'node:assert/strict'
import { Gateway } from '../lib/gateway.js'

test('Issue #125: Gateway subscribes to both session/event and direct host lifecycle events', async () => {
  const listeners = new Map()
  const fakeCtx = {
    on: (eventName, cb) => {
      listeners.set(eventName, cb)
      return () => listeners.delete(eventName)
    },
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }

  const gw = new Gateway(fakeCtx, {
    telegram: { enabled: false },
    discord: { enabled: false },
    slack: { enabled: false },
  })

  await gw.start()

  // Verify all expected host lifecycle and session events are registered
  assert.ok(listeners.has('session/event'), 'must listen to session/event')
  assert.ok(listeners.has('turn/end'), 'must listen to turn/end')
  assert.ok(listeners.has('turn/start'), 'must listen to turn/start')
  assert.ok(listeners.has('assistant/message'), 'must listen to assistant/message')
  assert.ok(listeners.has('assistant/chunk'), 'must listen to assistant/chunk')

  // Verify direct host event routing to pending collectors
  const collector = {
    lastText: '',
    streamText: '',
    images: [],
    toolName: '',
  }
  gw.pending.set('sess-1', collector)

  // Test direct assistant/chunk event
  const chunkHandler = listeners.get('assistant/chunk')
  chunkHandler({ id: 'sess-1' }, 'hello world')
  assert.equal(collector.streamText, 'hello world')

  // Test direct turn/end event
  const turnEndHandler = listeners.get('turn/end')
  turnEndHandler({ id: 'sess-1' }, { reason: { kind: 'completed' } })
  assert.equal(collector.reason?.kind, 'completed')

  // Verify stop() cleans up all listeners
  gw.stop()
  assert.equal(listeners.size, 0)
})
