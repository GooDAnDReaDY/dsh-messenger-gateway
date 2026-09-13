import test from 'node:test'
import assert from 'node:assert/strict'
import { toDiscordComponents } from '../lib/adapters/discord.js'
import { toSlackBlocks } from '../lib/adapters/slack.js'

test('multi-messenger: toDiscordComponents formats action row buttons with limits', () => {
  const buttons = [
    [
      { id: 'btn_1', text: 'Approve' },
      { id: 'btn_2', text: 'Reject' },
    ],
    [
      { id: 'btn_3', text: 'Cancel' },
    ]
  ]
  const rows = toDiscordComponents(buttons)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].type, 1) // ACTION_ROW
  assert.equal(rows[0].components.length, 2)
  assert.equal(rows[0].components[0].type, 2) // BUTTON
  assert.equal(rows[0].components[0].custom_id, 'btn_1')
  assert.equal(rows[0].components[0].label, 'Approve')
})

test('multi-messenger: toSlackBlocks creates Block Kit actions with buttons', () => {
  const buttons = [
    [
      { id: 'allow_once', text: 'Allow Once' },
      { id: 'deny', text: 'Deny' },
    ]
  ]
  const blocks = toSlackBlocks('Security check', buttons)
  assert.ok(Array.isArray(blocks))
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].type, 'section')
  assert.equal(blocks[0].text.text, 'Security check')

  const actions = blocks[1]
  assert.equal(actions.type, 'actions')
  assert.equal(actions.elements.length, 2)
  assert.equal(actions.elements[0].type, 'button')
  assert.equal(actions.elements[0].action_id, 'allow_once')
  assert.equal(actions.elements[0].text.text, 'Allow Once')
})
