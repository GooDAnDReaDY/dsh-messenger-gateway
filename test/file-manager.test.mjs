import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  formatFileSize,
  resolveSafePath,
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
  assert.ok(dirDownload.error.includes('является каталогом'))

  // Missing file
  const missing = await getFileForDownload(testDir, 'nonexistent.txt')
  assert.equal(missing.ok, false)
  assert.ok(missing.error.includes('Файл не найден'))
})
