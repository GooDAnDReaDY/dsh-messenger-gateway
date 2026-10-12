import test from 'node:test'
import assert from 'node:assert/strict'
import { Gateway } from '../lib/gateway.js'
import { apply } from '../lib/index.js'

test('Issue #125 & #140: Gateway subscribes to core session/event and direct lifecycle events', async () => {
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
  assert.ok(listeners.has('tool/call'), 'must listen to tool/call')
  assert.ok(listeners.has('tool/result'), 'must listen to tool/result')

  // Verify direct host event routing to pending collectors
  const streamUpdates = []
  const collector = {
    lastText: '',
    streamText: '',
    images: [],
    toolName: '',
    onStream: (text, tool) => {
      streamUpdates.push({ text, tool })
    },
  }
  gw.pending.set('sess-1', collector)

  // Direct tool/call event
  const toolCallHandler = listeners.get('tool/call')
  toolCallHandler({ id: 'sess-1' }, { name: 'bash' })
  assert.equal(collector.toolName, 'bash')
  assert.equal(streamUpdates.at(-1)?.tool, 'bash')

  // Direct tool/result event
  const toolResultHandler = listeners.get('tool/result')
  toolResultHandler({ id: 'sess-1' }, {})
  assert.equal(collector.toolName, '')
  assert.equal(streamUpdates.at(-1)?.tool, '')

  // Direct assistant/chunk event
  const chunkHandler = listeners.get('assistant/chunk')
  chunkHandler({ id: 'sess-1' }, 'hello world')
  assert.equal(collector.streamText, 'hello world')

  // Direct turn/end event
  const turnEndHandler = listeners.get('turn/end')
  turnEndHandler({ id: 'sess-1' }, { reason: { kind: 'completed' } })
  assert.equal(collector.reason?.kind, 'completed')

  // Verify stop() cleans up all listeners
  gw.stop()
  assert.equal(listeners.size, 0)
})

test('Issue #140: Delivery of real DSH Core session/event sequence to Gateway collector', async () => {
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

  const onSessionEvent = listeners.get('session/event')
  assert.ok(typeof onSessionEvent === 'function', 'session/event handler must be registered')

  const streamUpdates = []
  const collector = {
    lastText: '',
    streamText: '',
    images: [],
    toolName: '',
    onStream: (text, tool) => {
      streamUpdates.push({ text, tool })
    },
  }
  gw.pending.set('core-sess-1', collector)
  const session = { id: 'core-sess-1' }

  // 1. Core event: turn/start
  onSessionEvent(session, {
    type: 'turn/start',
    seq: 1,
    time: 1000,
    data: { turn: 1 },
  })

  // 2. Core event: tool/call
  onSessionEvent(session, {
    type: 'tool/call',
    seq: 2,
    time: 1001,
    data: { turn: 1, step: 1, callId: 'call-1', name: 'shell', arguments: '{"cmd":"pwd"}' },
  })
  assert.equal(collector.toolName, 'shell')
  assert.equal(streamUpdates.at(-1)?.tool, 'shell')

  // 3. Core event: assistant/chunk with text-delta
  onSessionEvent(session, {
    type: 'assistant/chunk',
    seq: 3,
    time: 1002,
    data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'Working on it...' } },
  })
  assert.equal(collector.streamText, 'Working on it...')

  // 4. Core event: tool/result
  onSessionEvent(session, {
    type: 'tool/result',
    seq: 4,
    time: 1003,
    data: { turn: 1, step: 1, callId: 'call-1', message: { output: '/home/user' } },
  })
  assert.equal(collector.toolName, '')
  assert.equal(streamUpdates.at(-1)?.tool, '')

  // 5. Core event: assistant/message
  onSessionEvent(session, {
    type: 'assistant/message',
    seq: 5,
    time: 1004,
    data: {
      turn: 1,
      step: 1,
      message: {
        id: 'msg-final',
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is your directory: /home/user' }],
      },
    },
  })
  assert.equal(collector.lastText, 'Here is your directory: /home/user')

  // 6. Core event: turn/end
  onSessionEvent(session, {
    type: 'turn/end',
    seq: 6,
    time: 1005,
    data: { turn: 1, reason: { kind: 'completed' } },
  })
  assert.equal(collector.reason?.kind, 'completed')

  gw.stop()
})

test('Issue #140: Dynamic skills sync responds to DSH Core tools/change and related events', async () => {
  const registeredListeners = new Map()

  const fakeCtx = {
    on: (eventName, cb) => {
      registeredListeners.set(eventName, cb)
      return () => registeredListeners.delete(eventName)
    },
    effect: (fn) => fn(),
    provide: () => {},
    inject: () => ({}),
    get: () => null,
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    webServer: { register: () => () => {} },
  }

  const config = {
    telegram: { enabled: false },
    discord: { enabled: false },
    slack: { enabled: false },
  }

  apply(fakeCtx, config)

  // Verify all Core and plugin event names are subscribed
  assert.ok(registeredListeners.has('tools/change'), 'must subscribe to DSH core tools/change')
  assert.ok(registeredListeners.has('tools/update'), 'must subscribe to tools/update')
  assert.ok(registeredListeners.has('tools/updated'), 'must subscribe to tools/updated')
  assert.ok(registeredListeners.has('skills/change'), 'must subscribe to skills/change')
  assert.ok(registeredListeners.has('skills/updated'), 'must subscribe to skills/updated')
  assert.ok(registeredListeners.has('skills/update'), 'must subscribe to skills/update')

  const onToolsChange = registeredListeners.get('tools/change')
  assert.ok(typeof onToolsChange === 'function')
  assert.doesNotThrow(() => onToolsChange())
})

test('Issue #140: Notify bridge handles real DSH Core session/event payload', async () => {
  const registeredListeners = new Map()

  const fakeCtx = {
    on: (eventName, cb) => {
      registeredListeners.set(eventName, cb)
      return () => registeredListeners.delete(eventName)
    },
    effect: (fn) => fn(),
    provide: () => {},
    inject: () => ({}),
    get: () => null,
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
    webServer: { register: () => () => {} },
  }

  const config = {
    telegram: {
      enabled: false,
      notifyBridge: {
        enabled: true,
        home: 'main',
        events: ['task_done', 'error'],
        excludeSessionPrefixes: ['msgw-'],
      },
    },
  }

  apply(fakeCtx, config)

  const onSessionEvent = registeredListeners.get('session/event')
  assert.ok(typeof onSessionEvent === 'function', 'session/event must be registered on notify bridge')

  const session = { id: 'user-session-42' }

  // 1. Core turn/start event
  onSessionEvent(session, {
    type: 'turn/start',
    seq: 1,
    time: Date.now(),
    data: { turn: 1 },
  })

  // 2. Core turn/end event with completed status
  onSessionEvent(session, {
    type: 'turn/end',
    seq: 2,
    time: Date.now(),
    data: { turn: 1, reason: { kind: 'completed' } },
  })
})
