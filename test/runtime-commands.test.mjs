import test from 'node:test'
import assert from 'node:assert/strict'
import { Gateway } from '../lib/gateway.js'

test('Issue #165 (GitHub #10): Gateway.handleMessage executes DSH runtime commands directly without runTurn', async () => {
  const executed = []
  const replies = []
  const turns = []

  const mockCommandsService = {
    execute: async (agent, line, attachments, signal) => {
      executed.push({ line, attachments, signal })
      if (line.startsWith('/compact')) {
        return {
          commandId: 'cmd-1',
          result: { kind: 'success', text: 'Session history successfully compacted.' }
        }
      }
      if (line.startsWith('/done_no_text')) {
        return {
          commandId: 'cmd-2',
          result: { kind: 'success' }
        }
      }
      // Unknown command returns undefined in DSH commands service
      return undefined
    }
  }

  const fakeCtx = {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: (k) => k === 'commands' ? mockCommandsService : null,
  }
  const config = {
    telegram: { enabled: true },
    agent: { photoOnlyMode: 'prompt', sessionScope: 'user' }
  }
  const gw = new Gateway(fakeCtx, config)

  const fakeChat = {
    turnActive: false,
    busy: Promise.resolve(),
    agent: { session: { id: 'sess-1' } },
  }
  gw.getOrCreateChat = async () => fakeChat
  gw.runTurn = async (chat, turnInput, signal) => {
    turns.push(turnInput)
    return Promise.resolve()
  }

  // 1. Send /compact -> executes via commands.execute, replies with result text, no agent turn
  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/compact',
    reply: async (msg) => { replies.push(msg) },
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(executed.length, 1)
  assert.equal(executed[0].line, '/compact')
  assert.equal(replies.length, 1)
  assert.equal(replies[0], 'Session history successfully compacted.')
  assert.equal(turns.length, 0, 'No LLM turn should be executed for runtime commands')

  // 2. Command with no explicit result text -> uses localized msg.command_done
  replies.length = 0
  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/done_no_text',
    reply: async (msg) => { replies.push(msg) },
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(executed.length, 2)
  assert.equal(replies.length, 1)
  assert.equal(replies[0], 'Command /done_no_text completed.')
  assert.equal(turns.length, 0)

  // 3. Command not in runtime commands service (e.g. skill gesture /code-review) -> falls through to runTurn
  replies.length = 0
  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/code-review file.js',
    reply: async (msg) => { replies.push(msg) },
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(executed.length, 3)
  assert.equal(turns.length, 1)
  assert.equal(turns[0].text, '/code-review file.js')
})

test('Issue #165 (GitHub #10): Runtime command errors are caught and replied safely', async () => {
  const replies = []
  const mockCommandsService = {
    execute: async () => {
      throw new Error('Attachment admission failed: quota exceeded')
    }
  }
  const fakeCtx = {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: (k) => k === 'commands' ? mockCommandsService : null,
  }
  const gw = new Gateway(fakeCtx, {
    telegram: { enabled: true },
    agent: { photoOnlyMode: 'prompt', sessionScope: 'user' }
  })
  gw.getOrCreateChat = async () => ({
    turnActive: false,
    busy: Promise.resolve(),
    agent: { session: { id: 'sess-1' } },
  })

  await gw.handleMessage({
    platform: 'telegram',
    chatId: '1001',
    userId: 'u1',
    text: '/boom',
    reply: async (msg) => { replies.push(msg) },
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(replies.length, 1)
  assert.ok(replies[0].includes('Attachment admission failed: quota exceeded'))
})

test('Issue #167 (GitHub #11): Gateway.handleMessage passes valid AbortSignal when chat.abort is undefined (idle chat)', async () => {
  const replies = []
  let receivedSignal = null

  const mockCommandsService = {
    execute: async (agent, line, attachments, signal) => {
      // @deepseek-ai/dsh-commands unconditionally accesses signal.aborted:
      // if (signal.aborted) throw abortError(signal)
      assert.ok(signal, "signal must not be undefined or null")
      assert.equal(typeof signal.aborted, "boolean", "signal.aborted must be a boolean")
      if (signal.aborted) {
        throw new Error("This operation was aborted")
      }
      receivedSignal = signal
      return {
        commandId: "cmd-compact",
        result: { kind: "text", text: "Compacted history successfully." }
      }
    }
  }

  const fakeCtx = {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: (k) => k === "commands" ? mockCommandsService : null,
  }
  const gw = new Gateway(fakeCtx, {
    telegram: { enabled: true },
    agent: { photoOnlyMode: "prompt", sessionScope: "user" }
  })

  // Explicitly simulate an idle chat where chat.abort is undefined
  const fakeChat = {
    turnActive: false,
    busy: Promise.resolve(),
    agent: { session: { id: "sess-idle" } },
    abort: undefined,
  }
  gw.getOrCreateChat = async () => fakeChat

  await gw.handleMessage({
    platform: "telegram",
    chatId: "1002",
    userId: "u2",
    text: "/compact",
    reply: async (msg) => { replies.push(msg) },
  })

  await new Promise(r => setTimeout(r, 10))
  assert.equal(replies.length, 1)
  assert.equal(replies[0], "Compacted history successfully.")
  assert.ok(receivedSignal, "Mock command received valid signal")
  assert.equal(receivedSignal.aborted, false)
  assert.equal(fakeChat.abort, undefined, "chat.abort must be cleaned up to undefined after execution")
})

test('Issue #167 (GitHub #11): Runtime command can be aborted via chat.abort without sending error to user', async () => {
  const replies = []
  let commandStartedResolve
  const commandStarted = new Promise(r => { commandStartedResolve = r })

  const fakeChat = {
    turnActive: false,
    busy: Promise.resolve(),
    agent: { session: { id: "sess-abort" } },
    abort: undefined,
  }

  const mockCommandsService = {
    execute: async (agent, line, attachments, signal) => {
      commandStartedResolve()
      return new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"))
        })
      })
    }
  }

  const fakeCtx = {
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    get: (k) => k === "commands" ? mockCommandsService : null,
  }
  const gw = new Gateway(fakeCtx, {
    telegram: { enabled: true },
    agent: { photoOnlyMode: "prompt", sessionScope: "user" }
  })
  gw.getOrCreateChat = async () => fakeChat

  const handlePromise = gw.handleMessage({
    platform: "telegram",
    chatId: "1003",
    userId: "u3",
    text: "/long_running",
    reply: async (msg) => { replies.push(msg) },
  })

  // Wait for command to start and attach signal to fakeChat.abort
  await commandStarted
  assert.ok(fakeChat.abort, "chat.abort must be bound during command execution")
  fakeChat.abort.abort()

  await handlePromise
  await new Promise(r => setTimeout(r, 10))

  assert.equal(replies.length, 0, "No error message should be sent to user when aborted")
  assert.equal(fakeChat.abort, undefined, "chat.abort must be restored to undefined")
})
