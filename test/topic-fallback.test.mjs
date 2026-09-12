import test from 'node:test'
import assert from 'node:assert/strict'
import { TelegramAdapter } from '../lib/adapters/telegram.js'

test('startStreamMessage falls back to main chat when topic is deleted', async () => {
  const calls = []
  const adapter = new TelegramAdapter({ botToken: '123:abc' })
  adapter.call = async (method, params) => {
    calls.push({ method, params })
    if (params?.message_thread_id === 999) {
      throw new Error('telegram sendMessage: 400 Bad Request: message thread not found')
    }
    return { message_id: 42 }
  }

  const stream = await adapter.startStreamMessage(100, undefined, 999)
  assert.ok(stream, 'stream should be created via fallback')
  assert.equal(stream.messageId, 42)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].params.message_thread_id, 999)
  assert.equal(calls[1].params.message_thread_id, undefined)
})

test('sendFormattedMessage falls back to main chat when topic is deleted', async () => {
  const sends = []
  const adapter = new TelegramAdapter({ botToken: '123:abc', textFormat: 'plain' })
  adapter.sendWithRetry = async (method, params) => {
    sends.push({ method, params: { ...params } })
    if (params?.message_thread_id === 888) {
      throw new Error('telegram sendMessage: 400 Bad Request: thread not found')
    }
    return { message_id: 101 }
  }

  await adapter.sendFormattedMessage(200, undefined, 'hello world', {}, 888)
  assert.equal(sends.length, 2)
  assert.equal(sends[0].params.message_thread_id, 888)
  assert.equal(sends[1].params.message_thread_id, undefined)
})

test('sendMedia falls back to main chat when topic is deleted', async () => {
  const forms = []
  const adapter = new TelegramAdapter({ botToken: '123:abc' })
  adapter.sendWithRetry = async (method, form) => {
    const threadId = form.get('message_thread_id')
    forms.push({ method, threadId })
    if (threadId === '777') {
      throw new Error('telegram sendDocument: 400 Bad Request: topic_closed')
    }
    return { message_id: 55 }
  }

  const file = { kind: 'document', bytes: new Uint8Array([1, 2, 3]), name: 'doc.txt' }
  const res = await adapter.sendMedia(300, file, 777)
  assert.equal(res.message_id, 55)
  assert.equal(forms.length, 2)
  assert.equal(forms[0].threadId, '777')
  assert.equal(forms[1].threadId, null)
})
