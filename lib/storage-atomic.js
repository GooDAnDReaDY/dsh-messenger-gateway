import { open, rename, mkdir, unlink } from 'node:fs/promises'
import { renameSync, mkdirSync, unlinkSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

// State files carry message texts, approved user ids and pairing data: they
// must not be world-readable (#204). Directories are created 0o700 so the
// contents stay private even when the parent is shared.
const FILE_MODE = 0o600
const DIR_MODE = 0o700

/**
 * A state file could not be parsed and no usable backup existed (#227).
 * The corrupted bytes are never deleted: a preserved copy keeps the path in
 * `corruptBackup` so nothing is lost silently.
 */
export class StateCorruptError extends Error {
  constructor(filePath, cause) {
    super(`state file ${filePath} is corrupted and no valid backup exists`)
    this.name = 'StateCorruptError'
    this.code = 'STATE_CORRUPT'
    this.filePath = filePath
    this.corruptBackup = null
    this.cause = cause
  }
}

/** The state file was written by a NEWER schema version than this build supports. */
export class StateVersionError extends Error {
  constructor(filePath, fileVersion, supportedVersion) {
    super(`state file ${filePath} has schema version ${fileVersion}, newer than supported ${supportedVersion}`)
    this.name = 'StateVersionError'
    this.code = 'STATE_VERSION'
    this.filePath = filePath
  }
}

async function fsyncDir(dir) {
  let fh
  try {
    fh = await open(dir, 'r')
    await fh.sync()
  } catch { /* directory fsync is best-effort (some filesystems refuse it) */ }
  finally { try { await fh?.close() } catch { /* ignore */ } }
}

function fsyncDirSync(dir) {
  let fd
  try {
    fd = openSync(dir, 'r')
    fsyncSync(fd)
  } catch { /* best-effort */ }
  finally { try { if (fd !== undefined) closeSync(fd) } catch { /* ignore */ } }
}

/**
 * Write JSON atomically via temporary file and rename (#227):
 * - the temp file is fsynced BEFORE the rename, so a power cut right after
 *   the rename cannot leave an empty or partial state file;
 * - the directory is fsynced after the rename so the rename itself survives;
 * - the previous good version is kept as `<path>.bak` for recovery.
 * Guarantees that readers never observe partially written files.
 */
export async function writeJsonAtomic(filePath, data) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true, mode: DIR_MODE })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  const serialized = JSON.stringify(data, null, 2)
  let fh
  try {
    fh = await open(tmpPath, 'w', FILE_MODE)
    await fh.writeFile(serialized, { encoding: 'utf8' })
    await fh.sync()
    await fh.close()
    fh = undefined
    // Keep the last good version as a recovery sidecar; rotate, then move
    // the new file into place, restoring the backup if the rename fails.
    let hadPrevious = false
    try {
      await rename(filePath, `${filePath}.bak`)
      hadPrevious = true
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
    try {
      await rename(tmpPath, filePath)
    } catch (err) {
      if (hadPrevious) await rename(`${filePath}.bak`, filePath).catch(() => { void 0 })
      throw err
    }
    await fsyncDir(dir)
  } catch (err) {
    try { await fh?.close() } catch { /* ignore */ }
    await unlink(tmpPath).catch((e) => { void e })
    throw err
  }
}

/**
 * Synchronous atomic JSON write: fsync temp file, rotate previous version
 * to `<path>.bak`, rename, fsync directory (#227).
 */
export function writeJsonAtomicSync(filePath, data) {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  const tmpPath = `${filePath}.${randomUUID().slice(0, 8)}.tmp`
  let fd
  try {
    fd = openSync(tmpPath, 'w', FILE_MODE)
    writeSync(fd, JSON.stringify(data, null, 2), 0, 'utf8')
    fsyncSync(fd)
  } finally {
    try { if (fd !== undefined) closeSync(fd) } catch { /* ignore */ }
  }
  try {
    let hadPrevious = false
    try {
      renameSync(filePath, `${filePath}.bak`)
      hadPrevious = true
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
    try {
      renameSync(tmpPath, filePath)
    } catch (err) {
      if (hadPrevious) { try { renameSync(`${filePath}.bak`, filePath) } catch { /* ignore */ } }
      throw err
    }
    fsyncDirSync(dir)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
    throw err
  }
}

/**
 * Apply the schema version policy to a parsed state file (#227).
 * Legacy files (no `schemaVersion`) go through `migrate(raw, 0)`.
 * @param {any} parsed parsed JSON payload
 * @param {number} version the schema version this build supports
 * @param {((raw: any, fromVersion: number) => any) | undefined} migrate
 * @param {string} filePath only used for error messages
 */
function applySchemaVersion(parsed, version, migrate, filePath) {
  const fileVersion = Number(parsed?.schemaVersion)
  if (!Number.isFinite(fileVersion)) {
    // Legacy pre-versioning file: migrate from v0.
    if (typeof migrate !== 'function') return { ...parsed }
    return migrate(parsed, 0)
  }
  if (fileVersion > version) throw new StateVersionError(filePath, fileVersion, version)
  if (fileVersion < version) {
    if (typeof migrate !== 'function') throw new StateVersionError(filePath, fileVersion, version)
    return migrate(parsed, fileVersion)
  }
  return parsed
}

/**
 * Recover from a corrupted state file (#227): the corrupted bytes are moved
 * aside to a timestamped `<path>.corrupt-<ts>` copy (never deleted), then the
 * `<path>.bak` sidecar written by the previous save is tried. If the backup
 * parses, it self-heals the main file and is returned. Otherwise a
 * StateCorruptError is thrown — callers must NOT fall back to empty state
 * silently.
 */
function recoverCorrupt(filePath, version, migrate, cause) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const corruptPath = `${filePath}.corrupt-${stamp}`
  try { renameSync(filePath, corruptPath) } catch { /* best-effort preservation */ }
  const bakPath = `${filePath}.bak`
  if (existsSync(bakPath)) {
    try {
      const bakParsed = JSON.parse(readFileSync(bakPath, 'utf8'))
      if (bakParsed === null || typeof bakParsed !== 'object') throw new Error('backup is not an object')
      const data = applySchemaVersion(bakParsed, version, migrate, filePath)
      try { writeJsonAtomicSync(filePath, data) } catch { /* self-heal is best-effort */ }
      return { data, recovered: true, corruptBackup: corruptPath }
    } catch { /* backup unusable: fall through to the explicit error */ }
  }
  const err = new StateCorruptError(filePath, cause)
  err.corruptBackup = existsSync(corruptPath) ? corruptPath : null
  throw err
}

/**
 * Read a versioned JSON state file synchronously (#227).
 * - missing file: `{ data: null, recovered: false }`
 * - legacy/older schema: migrated through `migrate`
 * - corrupted file: recovered from `.bak` when possible, otherwise
 *   StateCorruptError (corrupted bytes preserved next to the file)
 * - newer schema than this build: StateVersionError
 *
 * @param {string} filePath state file path
 * @param {{ version?: number, migrate?: (raw: any, fromVersion: number) => any }} [opts]
 * @returns {{ data: any, recovered: boolean, corruptBackup: string | null }}
 */
export function readJsonStateSync(filePath, { version = 1, migrate } = {}) {
  if (!filePath || !existsSync(filePath)) return { data: null, recovered: false, corruptBackup: null }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    return recoverCorrupt(filePath, version, migrate, err)
  }
  if (parsed === null || typeof parsed !== 'object') {
    return recoverCorrupt(filePath, version, migrate, new Error(`unexpected payload type ${typeof parsed}`))
  }
  return { data: applySchemaVersion(parsed, version, migrate, filePath), recovered: false, corruptBackup: null }
}
