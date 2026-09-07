import { writeFile, rename, mkdir, unlink } from 'node:fs/promises'
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