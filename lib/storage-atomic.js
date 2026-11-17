import { writeFile, rename, mkdir, unlink } from 'node:fs/promises'
import { writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

// State files carry message texts, approved user ids and pairing data: they
// must not be world-readable (#204). Directories are created 0o700 so the
// contents stay private even when the parent is shared.
const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * Write JSON atomically via temporary file and rename.
 * Guarantees that readers never observe partially written files.
 */
export async function writeJsonAtomic(filePath, data) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true, mode: DIR_MODE })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  const serialized = JSON.stringify(data, null, 2)
  try {
    await writeFile(tmpPath, serialized, { encoding: 'utf8', mode: FILE_MODE })
    await rename(tmpPath, filePath)
  } catch (err) {
    await unlink(tmpPath).catch((e) => { void e })
    throw err
  }
}

/**
 * Synchronous atomic JSON write via temporary file and rename.
 */
export function writeJsonAtomicSync(filePath, data) {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: FILE_MODE })
    renameSync(tmpPath, filePath)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw err
  }
}
