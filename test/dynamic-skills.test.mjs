import test from 'node:test'
import assert from 'node:assert/strict'
import { collectDynamicSkills, syncTelegramCommands } from '../lib/forum-mirror.js'
import { truncateSafe } from '../lib/text.js'
import { mergeDynamicCommands } from '../lib/commands.js'

test('Issue #161 (GitHub #7): truncateSafe handles strings, maxLen, and UTF-16 surrogates safely', () => {
  // Short string
  assert.equal(truncateSafe('hello', 80), 'hello')
  assert.equal(truncateSafe(null, 80), '')
  assert.equal(truncateSafe(undefined, 80), '')

  // String at boundary
  const exact = 'a'.repeat(80)
  assert.equal(truncateSafe(exact, 80), exact)

  // Long string truncated to 80
  const longStr = 'a'.repeat(100)
  assert.equal(truncateSafe(longStr, 80).length, 80)

  // Astral character (emoji) on surrogate boundary
  // '🚀' consists of \uD83D (high surrogate) and \uDE80 (low surrogate), length 2
  const atCut = 'a'.repeat(79) + '🚀'
  assert.equal(atCut.length, 81)
  const slicedRaw = atCut.slice(0, 80)
  assert.equal(slicedRaw.length, 80)
  if (typeof slicedRaw.isWellFormed === 'function') {
    assert.equal(slicedRaw.isWellFormed(), false, 'slice(0, 80) produces ill-formed surrogate')
  }

  const safeRes = truncateSafe(atCut, 80)
  assert.equal(safeRes.length, 79, 'drops broken high surrogate at boundary')
  if (typeof safeRes.isWellFormed === 'function') {
    assert.equal(safeRes.isWellFormed(), true, 'safeRes must be well-formed UTF-16')
  }
})

test('Issue #161 (GitHub #7): collectDynamicSkills awaits async skillsService.list()', async () => {
  const mockSkills = [
    { name: 'asyncSkill1', description: 'Async skill description', invocation: { userInvocable: true } },
    { name: 'asyncSkill2', title: 'Title for skill 2', invocation: {} },
  ]
  const ctx = {
    get: (key) => key === 'skills' ? {
      list: async () => mockSkills,
    } : null,
    logger: { debug: () => {} },
  }

  const skills = await collectDynamicSkills(ctx)
  assert.equal(skills.length, 2)
  assert.equal(skills[0].name, 'asyncSkill1')
  assert.equal(skills[0].description, 'Async skill description')
  assert.equal(skills[1].name, 'asyncSkill2')
  assert.equal(skills[1].description, 'Title for skill 2')
})

test('Issue #161 (GitHub #7): collectDynamicSkills filters out non-userInvocable skills', async () => {
  const mockSkills = [
    { name: 'visible1', description: 'Allowed 1', invocation: { userInvocable: true } },
    { name: 'hidden1', description: 'Hidden by invocation', invocation: { userInvocable: false } },
    { name: 'hidden2', description: 'Hidden legacy property', userInvocable: false },
    { name: 'visible2', description: 'Allowed 2' },
  ]
  const ctx = {
    skills: {
      list: async () => mockSkills,
    },
    logger: { debug: () => {} },
  }

  const skills = await collectDynamicSkills(ctx)
  assert.equal(skills.length, 2)
  assert.deepEqual(skills.map(s => s.name), ['visible1', 'visible2'])
})

test('Issue #161 (GitHub #7): collectDynamicSkills enforces 80 char description budget and safe surrogate truncation', async () => {
  const longDescWithEmoji = 'x'.repeat(79) + '🚀' + 'y'.repeat(50)
  const mockSkills = [
    { name: 'emojiSkill', description: longDescWithEmoji, invocation: { userInvocable: true } }
  ]
  const ctx = {
    skills: {
      list: async () => mockSkills,
    },
    logger: { debug: () => {} },
  }

  const skills = await collectDynamicSkills(ctx)
  assert.equal(skills.length, 1)
  assert.equal(skills[0].description.length, 79)
  if (typeof skills[0].description.isWellFormed === 'function') {
    assert.equal(skills[0].description.isWellFormed(), true)
  }
})

test('Issue #161 (GitHub #7): syncTelegramCommands awaits collectDynamicSkills and registers merged list', async () => {
  let registered = null
  const fakeGw = {
    adapters: new Map([
      ['telegram', {
        registerCommands: async (cmds) => { registered = cmds }
      }]
    ]),
    config: { telegram: { commands: [{ command: 'start', description: 'Start bot' }] } },
    ctx: {
      get: (key) => key === 'skills' ? {
        list: async () => [
          { name: 'dynamicOne', description: 'Dynamic skill one', invocation: { userInvocable: true } }
        ]
      } : null,
      logger: { info: () => {}, warn: () => {} }
    }
  }

  await syncTelegramCommands(fakeGw)
  assert.ok(Array.isArray(registered))
  const foundDynamic = registered.find(c => c.command === 'dynamicone')
  assert.ok(foundDynamic, 'dynamicone should be in registered commands')
  assert.equal(foundDynamic.description, 'Dynamic skill one')
})
