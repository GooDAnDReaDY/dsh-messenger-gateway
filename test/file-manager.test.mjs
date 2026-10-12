import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  formatFileSize,
  resolveSafePath,
  resolveInside,
  listFiles,
  getFileForDownload,
} from '../lib/file-manager.js'

test('formatFileSize formats byte units correctly', () => {
  assert.equal(formatFileSize(0), '0 B')
  assert.equal(formatFileSize(512), '512 B')
  assert.equal(formatFileSize(1024), '1.0 KB')
  assert.equal(formatFileSize(1024 * 1024 * 2.5), '2.5 MB')
  assert.equal(formatFileSize(1024 * 1024 * 1024 * 3), '3.0 GB')
})

test('resolveSafePath enforces workspace confinement and blocks traversal', () => {
  const base = join(tmpdir(), 'workspace-safe-test')
  const inside = resolveSafePath(base, 'sub/file.txt')
  assert.equal(inside.base, base)
  assert.ok(inside.target.startsWith(base))

  assert.throws(() => {
    resolveSafePath(base, '../../etc/passwd')
  }, { code: 'ERR_PATH_TRAVERSAL' })

  assert.throws(() => {
    resolveSafePath(base, '../outside')
  }, { code: 'ERR_PATH_TRAVERSAL' })

  assert.throws(() => {
    resolveSafePath(base, '/etc/passwd')
  }, { code: 'ERR_PATH_TRAVERSAL' })

  assert.throws(() => {
    resolveSafePath(base, 'D:\\secret.txt')
  }, { code: 'ERR_PATH_TRAVERSAL' })
})

test('Issue #127: resolveInside resolves paths strictly inside workspace and prevents escape', () => {
  const base = join(tmpdir(), 'resolve-inside-test')
  const target = resolveInside(base, 'generated/images/output.png')
  assert.equal(target, join(base, 'generated', 'images', 'output.png'))

  assert.throws(() => {
    resolveInside(base, '../../etc/shadow')
  }, { code: 'ERR_PATH_TRAVERSAL' })

  assert.throws(() => {
    resolveInside(base, '/tmp/escape.txt')
  }, { code: 'ERR_PATH_TRAVERSAL' })

  assert.throws(() => {
    resolveInside(base, 'C:\\Windows\\System32')
  }, { code: 'ERR_PATH_TRAVERSAL' })
})

test('listFiles and getFileForDownload operate on real directory', async () => {
  const testDir = join(tmpdir(), `fm-test-${randomUUID()}`)
  await mkdir(testDir, { recursive: true })
  await mkdir(join(testDir, 'src'), { recursive: true })
  await writeFile(join(testDir, 'README.md'), '# Test Readme', 'utf8')
  await writeFile(join(testDir, 'src', 'index.js'), 'console.log("hi")', 'utf8')

  // List root
  const listRoot = await listFiles(testDir, '.')
  assert.equal(listRoot.ok, true)
  assert.equal(listRoot.isDirectory, true)
  assert.ok(listRoot.formattedText.includes('📁 <code>src/</code>'))
  assert.ok(listRoot.formattedText.includes('📄 <code>README.md</code>'))

  // List subfolder
  const listSub = await listFiles(testDir, 'src')
  assert.equal(listSub.ok, true)
  assert.ok(listSub.formattedText.includes('📄 <code>index.js</code>'))

  // Download file
  const file = await getFileForDownload(testDir, 'README.md')
  assert.equal(file.ok, true)
  assert.equal(file.name, 'README.md')
  assert.equal(file.mime, 'text/markdown')
  assert.equal(file.bytes.toString('utf8'), '# Test Readme')

  // Block downloading a directory
  const dirDownload = await getFileForDownload(testDir, 'src')
  assert.equal(dirDownload.ok, false)
  assert.ok(dirDownload.error.includes('is a directory'))

  // Missing file
  const missing = await getFileForDownload(testDir, 'nonexistent.txt')
  assert.equal(missing.ok, false)
  assert.ok(missing.error.includes('File not found'))
})

test('resolveSafePath blocks symlinks pointing outside workspace (Issue #115)', async () => {
  const { symlink } = await import('node:fs/promises')
  const root = join(tmpdir(), `fm-symlink-${randomUUID()}`)
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside')
  await mkdir(workspace, { recursive: true })
  await mkdir(outside, { recursive: true })

  const outsideFile = join(outside, 'secret.txt')
  await writeFile(outsideFile, 'TOP_SECRET', 'utf8')

  const insideFile = join(workspace, 'safe.txt')
  await writeFile(insideFile, 'SAFE_DATA', 'utf8')

  try {
    // Create symlink pointing outside
    await symlink(outsideFile, join(workspace, 'leak.txt'))
    // Create symlink pointing inside workspace
    await symlink(insideFile, join(workspace, 'safe-link.txt'))

    // 1. Symlink pointing outside must throw ERR_PATH_TRAVERSAL
    assert.throws(() => {
      resolveSafePath(workspace, 'leak.txt')
    }, { code: 'ERR_PATH_TRAVERSAL' })

    // 2. Symlink pointing inside workspace is allowed
    const safeRes = resolveSafePath(workspace, 'safe-link.txt')
    assert.equal(safeRes.relativePath, 'safe-link.txt')
  } catch (err) {
    if (err?.code === 'EPERM') {
      // Windows without developer mode / admin privileges cannot create symlinks
      return
    }
    throw err
  }
})
