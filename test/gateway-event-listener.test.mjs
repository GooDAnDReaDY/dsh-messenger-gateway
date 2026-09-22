import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assistantText } from '../lib/text.js'
import { collectAssistantParts } from '../lib/outbound.js'
import { extractTextDelta, extractToolName } from '../lib/stream.js'
import { listHomes } from '../lib/homes.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const gatewaySrc = readFileSync(join(root, 'lib/gateway.js'), 'utf8')

test('Issue #88: gateway.js imports required helpers for session/event and messenger.homes', () => {
  // Verify required imports are present
  assert.match(gatewaySrc, /import\s*\{[^}]*\bassistantText\b[^}]*\}\s*from\s*['"]\.\/text\.js['"]/)
  assert.match(gatewaySrc, /import\s*\{[^}]*\bcollectAssistantParts\b[^}]*\}\s*from\s*['"]\.\/outbound\.js['"]/)
  assert.match(gatewaySrc, /import\s*\{[^}]*\bextractTextDelta\b[^}]*\}\s*from\s*['"]\.\/stream\.js['"]/)
  assert.match(gatewaySrc, /import\s*\{[^}]*\bextractToolName\b[^}]*\}\s*from\s*['"]\.\/stream\.js['"]/)
  assert.match(gatewaySrc, /import\s*\{[^}]*\blistHomes\b[^}]*\}\s*from\s*['"]\.\/homes\.js['"]/)

  // Verify dead/unused imports are removed
  assert.doesNotMatch(gatewaySrc, /import\s*\{[^}]*\breadFile\b[^}]*\}\s*from\s*['"]node:fs\/promises['"]/)
  assert.doesNotMatch(gatewaySrc, /import\s*\{[^}]*\bdirname\b[^}]*\}\s*from\s*['"]node:path['"]/)
  assert.doesNotMatch(gatewaySrc, /import\s*\{[^}]*\bfileURLToPath\b[^}]*\}\s*from\s*['"]node:url['"]/)
  assert.doesNotMatch(gatewaySrc, /transcribeVoice/)
  assert.doesNotMatch(gatewaySrc, /attachInboundPhoto/)
  assert.doesNotMatch(gatewaySrc, /photoOnlyHint/)
})

test('Issue #88: listHomes called by messenger.homes() returns home list', () => {
  const tgConfig = {
    homeChatId: '100200300',
    homeThreadId: 77,
    homes: [
      { name: 'ops', chatId: '100200400', threadId: 88 },
    ],
  }
  const homes = listHomes(tgConfig)
  assert.ok(Array.isArray(homes))
  assert.equal(homes.length, 2)
  assert.equal(homes[0].name, 'ops')
  assert.equal(homes[0].chatId, '100200400')
  assert.equal(homes[0].threadId, 88)
  assert.equal(homes[1].name, 'default')
  assert.equal(homes[1].chatId, '100200300')
  assert.equal(homes[1].threadId, 77)
})

test('Issue #88: session/event collector helpers process events correctly', () => {
  const streamCalls = []
  const collector = {
    streamText: '',
    toolName: '',
    images: [],
    lastText: '',
    reason: undefined,
    onStream: (text, tool) => streamCalls.push({ text, tool }),
  }

  // Simulate assistant/chunk
  const chunkDelta = extractTextDelta({ type: 'text-delta', text: 'Processing...' })
  assert.equal(chunkDelta, 'Processing...')
  collector.streamText += chunkDelta
  collector.onStream(collector.streamText, collector.toolName)
  assert.equal(collector.streamText, 'Processing...')
  assert.equal(streamCalls.length, 1)

  // Simulate tool/call
  const toolName = extractToolName({ tool: { name: 'bash' } })
  assert.equal(toolName, 'bash')
  collector.toolName = toolName
  collector.onStream(collector.streamText, collector.toolName)
  assert.equal(collector.toolName, 'bash')
  assert.equal(streamCalls.length, 2)

  // Simulate tool/result
  collector.toolName = ''
  collector.onStream(collector.streamText, '')
  assert.equal(collector.toolName, '')
  assert.equal(streamCalls.length, 3)

  // Simulate assistant/message
  const msg = {
    content: [
      { type: 'text', text: 'Task completed successfully.' },
      { type: 'image', attachment: { id: 'img-100', name: 'result.png' } },
    ],
  }
  const text = assistantText(msg)
  assert.equal(text, 'Task completed successfully.')
  collector.lastText = text
  const extra = collectAssistantParts(msg)
  for (const img of extra.images) collector.images.push(img)
  assert.equal(collector.images.length, 1)
  assert.equal(collector.images[0].id, 'img-100')

  // Simulate turn/end
  collector.reason = 'stop'
  assert.equal(collector.reason, 'stop')
})
