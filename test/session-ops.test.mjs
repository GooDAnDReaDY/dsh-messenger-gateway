import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exportSessionToMarkdown,
  rewindSession,
} from '../lib/session-ops.js'

test('exportSessionToMarkdown exports user and assistant turns', () => {
  const session = {
    id: 'test-session-123',
    messages: [
      { role: 'user', content: 'Hello agent', createdAt: Date.now() },
      { role: 'assistant', content: 'Hello user, how can I help you?', createdAt: Date.now() },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', name: 'search_web' },
          { type: 'text', text: 'Here are the results.' },
        ],
      },
    ],
  }

  const result = exportSessionToMarkdown(session)
  assert.ok(result.filename.startsWith('session-test-session-123-'))
  assert.equal(result.messagesCount, 3)
  assert.ok(result.content.includes('# Export of Session: test-session-123'))
  assert.ok(result.content.includes('### 👤 User'))
  assert.ok(result.content.includes('Hello agent'))
  assert.ok(result.content.includes('### 🤖 Assistant'))
  assert.ok(result.content.includes('> 🛠️ **Tool call:** `search_web`'))
  assert.ok(result.content.includes('Here are the results.'))
})

test('rewindSession removes specified user turn and its response', () => {
  const session = {
    id: 'rewind-session',
    messages: [
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Answer 1' },
      { role: 'user', content: 'Turn 2' },
      { role: 'assistant', content: 'Answer 2' },
    ],
  }

  const res1 = rewindSession(session, 1)
  assert.equal(res1.removed, 2)
  assert.equal(res1.remaining, 2)
  assert.equal(session.messages.length, 2)
  assert.equal(session.messages[0].content, 'Turn 1')
  assert.equal(session.messages[1].content, 'Answer 1')

  const res2 = rewindSession(session, 1)
  assert.equal(res2.removed, 2)
  assert.equal(res2.remaining, 0)
  assert.equal(session.messages.length, 0)
})

test('rewindSession handles empty session gracefully', () => {
  const session = { id: 'empty', messages: [] }
  const res = rewindSession(session, 1)
  assert.equal(res.removed, 0)
  assert.equal(res.remaining, 0)
})
