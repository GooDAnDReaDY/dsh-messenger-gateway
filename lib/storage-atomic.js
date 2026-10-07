import { writeFile, rename, mkdir, unlink } from 'node:fs/promises'
import { writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Write JSON atomically via temporary file and rename.
 * Guarantees that readers never observe partially written files.
 */
export async function writeJsonAtomic(filePath, data) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  const serialized = JSON.stringify(data, null, 2)
  try {
    await writeFile(tmpPath, serialized, 'utf8')
    await rename(tmpPath, filePath)
  } catch (err) {
    await unlink(tmpPath).catch(() => {})
    throw err
  }
}

/**
 * Synchronous atomic JSON write via temporary file and rename.
 */
export function writeJsonAtomicSync(filePath, data) {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8')
    renameSync(tmpPath, filePath)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw err
  }
}