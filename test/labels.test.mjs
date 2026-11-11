import { test } from 'node:test'
import assert from 'node:assert/strict'

import { chatLabel, platformTag, truncateBytes } from '../lib/labels.js'

test('platform tags cover the known adapters', () => {
  assert.equal(platformTag('telegram'), 'TG')
  assert.equal(platformTag('discord'), 'DC')
  assert.equal(platformTag('slack'), 'SL')
  assert.equal(platformTag('unknown'), 'UN')
  assert.equal(platformTag(''), 'MSG')
})

test('a private chat prefers its handle', () => {
  assert.equal(
    chatLabel({ platform: 'telegram', chatType: 'private', userName: 'Vitya', userUsername: 'vi468' }),
    'TG · @vi468',
  )
  assert.equal(
    chatLabel({ platform: 'telegram', chatType: 'private', userName: 'Vitya' }),
    'TG · Vitya',
  )
})

test('a group names the chat and its forum topic', () => {
  assert.equal(
    chatLabel({ platform: 'telegram', chatType: 'supergroup', chatTitle: 'Argo Navis', threadId: 5122 }),
    'TG · Argo Navis › topic 5122',
  )
  assert.equal(
    chatLabel({ platform: 'telegram', chatType: 'group', chatTitle: 'Argo Navis' }),
    'TG · Argo Navis',
  )
})

test('labels stay single-line and inside the byte budget', () => {
  const label = chatLabel({
    platform: 'telegram', chatType: 'supergroup', chatTitle: 'a very long chat name '.repeat(6), threadId: 1,
  })
  assert.equal(label.includes('\n'), false)
  assert.equal(Buffer.byteLength(label, 'utf8') <= 60, true)
  assert.equal(label.endsWith('…'), true)
})

test('truncateBytes never splits a code point', () => {
  assert.equal(truncateBytes('абвгд', 5), 'а…')
  assert.equal(truncateBytes('abc', 10), 'abc')
  assert.equal(truncateBytes('abc'), 'abc')
})
