import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreSkillGesture, syncTelegramCommands } from '../lib/forum-mirror.js'
import { Gateway } from '../lib/gateway.js'

test('Issue #164 (GitHub #9): restoreSkillGesture rewrites sanitized underscore commands back to hyphenated gesture', () => {
  const fakeGw = {
    skillNameMap: new Map([
      ['code_review', 'code-review'],
      ['univer_sheet', 'univer-sheet'],
      ['hindsight_coding_agent', 'hindsight-coding-agent'],
    ]),
    rawSkillNames: new Set([
      'code-review',
      'univer-sheet',
      'hindsight-coding-agent',
      'legacy_underscore_skill', // Literally named with underscore
    ]),
  }

  // 1. Basic tap from Telegram menu
  assert.equal(restoreSkillGesture(fakeGw, '/code_review'), '/code-review')
  assert.equal(restoreSkillGesture(fakeGw, '/univer_sheet'), '/univer-sheet')
  assert.equal(restoreSkillGesture(fakeGw, '/hindsight_coding_agent'), '/hindsight-coding-agent')

  // 2. With arguments
  assert.equal(restoreSkillGesture(fakeGw, '/code_review file.js'), '/code-review file.js')
  assert.equal(restoreSkillGesture(fakeGw, '/univer_sheet create budget'), '/univer-sheet create budget')

  // 3. With Telegram group @BotName mention
  assert.equal(restoreSkillGesture(fakeGw, '/code_review@TestBot'), '/code-review')
  assert.equal(restoreSkillGesture(fakeGw, '/code_review@TestBot file.js'), '/code-review file.js')

  // 4. Literal underscore skill must NOT be rewritten
  assert.equal(restoreSkillGesture(fakeGw, '/legacy_underscore_skill'), '/legacy_underscore_skill')
  assert.equal(restoreSkillGesture(fakeGw, '/legacy_underscore_skill@TestBot'), '/legacy_underscore_skill')

  // 5. Already hyphenated (typed manually by user)
  assert.equal(restoreSkillGesture(fakeGw, '/code-review'), '/code-review')

  // 6. Normal slash command (e.g. /compact) strips bot mention but leaves name
  assert.equal(restoreSkillGesture(fakeGw, '/compact@TestBot'), '/compact')
  assert.equal(restoreSkillGesture(fakeGw, '/compact'), '/compact')
})

test('Issue #164 (GitHub #9): syncTelegramCommands and collectDynamicSkills populate skillNameMap', async () => {
  const mockSkills = [
    { name: 'code-review', description: 'Review code', invocation: { userInvocable: true } },
    { name: 'tdd-workflow', description: 'TDD helper', invocation: { userInvocable: true } },
    { name: 'single', description: 'Single word', invocation: { userInvocable: true } },
  ]
  const fakeCtx = {
    get: (k) => k === 'skills' ? { list: async () => mockSkills } : null,
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }
  const gw = new Gateway(fakeCtx, {
    telegram: { commands: [] }
  })
  gw.adapters = new Map([
    ['telegram', { registerCommands: async () => {} }]
  ])

  await gw.syncTelegramCommands()
  assert.equal(gw.skillNameMap.get('code_review'), 'code-review')
  assert.equal(gw.skillNameMap.get('tdd_workflow'), 'tdd-workflow')
  assert.equal(gw.skillNameMap.has('single'), false) // No hyphen, no mapping needed
  assert.ok(gw.rawSkillNames.has('code-review'))
  assert.ok(gw.rawSkillNames.has('single'))
})
