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
