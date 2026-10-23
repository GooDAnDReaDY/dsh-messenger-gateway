import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realpathSync, readFileSync } from 'node:fs'
import { resolveEffectiveCwd, getCwdWarning, registerSessionInWorkspace } from '../lib/workspace.js'
import { handleGatewayCommand } from '../lib/gateway-commands.js'
import { DEFAULT_TELEGRAM_COMMANDS, normalizeTelegramCommands, HELP_TEXT } from '../lib/commands.js'

test('resolveEffectiveCwd & getCwdWarning handle empty and valid paths', async (t) => {
  // Empty inputs
  assert.equal(resolveEffectiveCwd(''), process.cwd())
  assert.equal(resolveEffectiveCwd(null), process.cwd())
  assert.equal(resolveEffectiveCwd(undefined), process.cwd())
  assert.equal(getCwdWarning(''), null)
  assert.equal(getCwdWarning(null), null)

  // Valid existing directory
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-gw-cwd-'))
  try {
    const realTmp = realpathSync(tmp)
    assert.equal(resolveEffectiveCwd(tmp), realTmp)
    assert.equal(getCwdWarning(tmp), null)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('resolveEffectiveCwd & getCwdWarning detect invalid directories and fallback safely', async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-gw-cwd-inv-'))
  const nonExistent = join(tmp, 'does_not_exist_xyz')
  const filePath = join(tmp, 'regular_file.txt')
  await writeFile(filePath, 'hello', 'utf8')

  try {
    // Non-existent path
    const warnNonExistent = getCwdWarning(nonExistent)
    assert.ok(warnNonExistent && warnNonExistent.includes('does not exist or is not accessible'))
    
    let loggedWarn = ''
    const fakeLogger = { warn: (msg) => { loggedWarn = msg } }
    assert.equal(resolveEffectiveCwd(nonExistent, fakeLogger), process.cwd())
    assert.ok(loggedWarn.includes('falling back to process.cwd()'))

    // File path (not a directory)
    const warnFile = getCwdWarning(filePath)
    assert.ok(warnFile && warnFile.includes('is not a directory'))
    assert.equal(resolveEffectiveCwd(filePath, fakeLogger), process.cwd())
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('registerSessionInWorkspace uses ctx.workspaceRegistry when available', async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-gw-ws-reg-'))
  try {
    const attached = []
    let created = null

    const mockWorkspace = {
      path: realpathSync(tmp),
      attachSession: async (sid) => { attached.push(sid) },
    }

    const mockRegistry = {
      resolveByPath: async (p) => (p === realpathSync(tmp) ? mockWorkspace : null),
      create: async (p) => {
        created = p
        return mockWorkspace
      },
    }

    const fakeCtx = {
      workspaceRegistry: mockRegistry,
      logger: { debug: () => {} },
    }

    // 1. Existing workspace resolution
    const ok1 = await registerSessionInWorkspace(fakeCtx, 'msgw-session-1', tmp)
    assert.equal(ok1, true)
    assert.deepEqual(attached, ['msgw-session-1'])

    // 2. Creation path when resolveByPath returns null
    mockRegistry.resolveByPath = async () => null
    const ok2 = await registerSessionInWorkspace(fakeCtx, 'msgw-session-2', tmp)
    assert.equal(ok2, true)
    assert.equal(created, realpathSync(tmp))
    assert.deepEqual(attached, ['msgw-session-1', 'msgw-session-2'])
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
})

test('registerSessionInWorkspace falls back to workspace.json storage file', async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), 'dsh-gw-ws-file-'))
  const storagesDir = join(tmp, 'storages')
  await mkdir(storagesDir, { recursive: true })
  const wsFile = join(storagesDir, 'workspace.json')

  const initialWorkspaceDir = await mkdtemp(join(tmpdir(), 'dsh-gw-ws-target-'))
  const realWsDir = realpathSync(initialWorkspaceDir)

  const initialData = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: ['ws-123'] },
    tables: {
      workspaces: {
        'ws-123': {
          path: realWsDir,
          title: 'test-project',
          sessionIds: ['existing-session-abc'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  }
  await writeFile(wsFile, JSON.stringify(initialData, null, 2), 'utf8')

  const oldEnv = process.env.DSH_HOME
  process.env.DSH_HOME = tmp

  try {
    const fakeCtx = { logger: { debug: () => {} } }

    // 1. Register in existing workspace
    const ok = await registerSessionInWorkspace(fakeCtx, 'msgw-session-999', realWsDir)
    assert.equal(ok, true)

    const updated = JSON.parse(readFileSync(wsFile, 'utf8'))
    assert.ok(updated.tables.workspaces['ws-123'].sessionIds.includes('msgw-session-999'))
    assert.ok(updated.tables.workspaces['ws-123'].sessionIds.includes('existing-session-abc'))

    // 2. Idempotent registration: duplicate should not add twice
    const okDuplicate = await registerSessionInWorkspace(fakeCtx, 'msgw-session-999', realWsDir)
    assert.equal(okDuplicate, true)
    const afterDup = JSON.parse(readFileSync(wsFile, 'utf8'))
    const count = afterDup.tables.workspaces['ws-123'].sessionIds.filter((s) => s === 'msgw-session-999').length
    assert.equal(count, 1)

    // 3. New workspace creation path
    const newWsDir = await mkdtemp(join(tmpdir(), 'dsh-gw-ws-brandnew-'))
    const realNewWsDir = realpathSync(newWsDir)
    try {
      const okNew = await registerSessionInWorkspace(fakeCtx, 'msgw-session-brandnew', realNewWsDir)
      assert.equal(okNew, true)

      const afterNew = JSON.parse(readFileSync(wsFile, 'utf8'))
      const allWs = Object.values(afterNew.tables.workspaces)
      const foundNew = allWs.find((w) => w.path === realNewWsDir)
      assert.ok(foundNew)
      assert.deepEqual(foundNew.sessionIds, ['msgw-session-brandnew'])
      assert.ok(afterNew.global.workspaceIds.length >= 2)
    } finally {
      await rm(newWsDir, { recursive: true, force: true })
    }
  } finally {
    process.env.DSH_HOME = oldEnv
    await rm(tmp, { recursive: true, force: true })
    await rm(initialWorkspaceDir, { recursive: true, force: true })
  }
})

test('DEFAULT_TELEGRAM_COMMANDS and /cwd command are recognized', async (t) => {
  // Commands list contains cwd
  const hasCwd = DEFAULT_TELEGRAM_COMMANDS.some((c) => c.command === 'cwd')
  assert.equal(hasCwd, true)
  assert.ok(HELP_TEXT.includes('/cwd'))

  const normalized = normalizeTelegramCommands(DEFAULT_TELEGRAM_COMMANDS)
  assert.ok(normalized.some((c) => c.command === 'cwd'))

  // handleGatewayCommand /cwd response
  let repliedText = ''
  const fakeGw = {
    chats: new Map(),
    config: { agent: { cwd: '/home/custom/project' } },
    resolveLocale: () => 'en',
    ctx: { logger: { debug: () => {} } },
  }
  const fakeInput = {
    reply: (t) => { repliedText = t },
    userId: '123',
    chatId: '456',
    platform: 'telegram',
  }

  await handleGatewayCommand(fakeGw, 'chat-key', '/cwd', fakeInput)
  assert.ok(repliedText.includes('Working Directory:'))
  assert.ok(repliedText.includes('Configured:'))
  assert.ok(repliedText.includes('/home/custom/project'))
})