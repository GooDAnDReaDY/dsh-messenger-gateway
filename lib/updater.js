import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTrustedSettingsRequest } from './http.js'

const UPDATE_HEADER = 'x-dsh-plugin-update'
const UPDATE_TIMEOUT_MS = 180_000
const VERSION_CACHE_MS = 300_000

let latestCache = null

function header(request, name) {
  const value = request?.headers?.[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return typeof value === 'string' ? value : undefined
}

function isLoopback(value) {
  const address = value?.toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address?.startsWith('127.') === true
    || address?.startsWith('::ffff:127.') === true
}

export function isTrustedUpdateRequest(request) {
  if (header(request, UPDATE_HEADER) !== '1') return false
  if (!isLoopback(request?.socket?.remoteAddress)) return false
  const site = header(request, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin') return false
  const origin = header(request, 'origin')
  const host = header(request, 'host')
  if (origin === undefined || host === undefined) return false
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && isLoopback(url.hostname) && url.host === host
  } catch {
    return false
  }
}

function validProfileName(value) {
  return typeof value === 'string' && value !== '' && value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\') && !/[\0-\x1f\x7f]/.test(value)
}

function profileNameFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (item === '--profile' || item === '-p') {
      const next = argv[i + 1]
      return validProfileName(next) ? next : undefined
    }
    if (typeof item === 'string' && item.startsWith('--profile=')) {
      const value = item.slice('--profile='.length)
      return validProfileName(value) ? value : undefined
    }
  }
  return undefined
}

export function findDshCliEntry() {
  const value = process.argv[1]
  if (value === undefined || value === '') return undefined
  const entry = value.startsWith('file:') ? fileURLToPath(value) : resolve(process.cwd(), value)
  if (!existsSync(entry)) return undefined
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const bin = typeof manifest.bin === 'string'
          ? manifest.bin
          : typeof manifest.bin === 'object' && manifest.bin !== null
            ? manifest.bin.dsh
            : undefined
        if (manifest.name === '@deepseek-ai/dsh' && typeof bin === 'string'
          && !isAbsolute(bin) && resolve(directory, bin) === resolve(entry)) return entry
      } catch {
        // Continue searching parent directories
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
  }
}

export function runtime() {
  const profileDir = resolve(process.env.DSH_PROFILE_DIR
    ?? resolve(homedir(), '.dsh', 'profiles', 'web'))
  const selected = profileNameFromArgv(process.argv)
  const profileName = validProfileName(selected)
    ? selected
    : validProfileName(basename(profileDir)) ? basename(profileDir) : 'web'
  const cliEntry = findDshCliEntry()
  return cliEntry === undefined ? { profileName, profileDir } : { profileName, profileDir, cliEntry }
}

export function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value || '').trim())
  if (match === null) return undefined
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function comparePrerelease(left, right) {
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 0 : left.length === 0 ? 1 : -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const aNumber = BigInt(a)
      const bNumber = BigInt(b)
      if (aNumber !== bNumber) return aNumber > bNumber ? 1 : -1
      continue
    }
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a > b ? 1 : -1
  }
  return 0
}

export function isNewerVersion(currentValue, candidateValue) {
  const current = parseSemver(currentValue)
  const candidate = parseSemver(candidateValue)
  if (current === undefined || candidate === undefined) return false
  for (let index = 0; index < 3; index += 1) {
    if (candidate.core[index] !== current.core[index]) return candidate.core[index] > current.core[index]
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}

export async function fetchLatestVersion(packageName, registry = 'https://registry.npmjs.org') {
  if (latestCache?.packageName === packageName && latestCache.registry === registry && Date.now() < latestCache.expiresAt) {
    return latestCache.version
  }
  try {
    const cleanReg = registry.replace(/\/$/, '')
    const response = await fetch(`${cleanReg}/${encodeURIComponent(packageName)}/latest`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return undefined
    const value = await response.json()
    if (typeof value.version !== 'string' || value.version === '') return undefined
    latestCache = { packageName, registry, version: value.version, expiresAt: Date.now() + VERSION_CACHE_MS }
    return value.version
  } catch {
    return undefined
  }
}

export async function currentVersion(manifestPath) {
  const raw = await readFile(manifestPath, 'utf8')
  const value = JSON.parse(raw)
  if (typeof value.version !== 'string' || value.version === '') throw new Error('Cannot read current plugin version.')
  return value.version
}

export async function getUpdateStatus(options, target = runtime()) {
  const current = await currentVersion(options.manifestPath)
  const latest = await fetchLatestVersion(options.packageName, options.registry ?? 'https://registry.npmjs.org')
  return {
    packageName: options.packageName,
    currentVersion: current,
    ...(latest === undefined ? {} : { latestVersion: latest }),
    latestCheckFailed: latest === undefined,
    updateAvailable: latest !== undefined && isNewerVersion(current, latest),
    profileName: target.profileName,
    canAutoUpdate: target.cliEntry !== undefined,
  }
}

export async function installExact(target, packageSpec, options = {}) {
  if (target.cliEntry === undefined) throw new Error('Automatic update CLI entry is unavailable in this runtime.')
  return new Promise((resolvePromise, reject) => {
    const args = [
      target.cliEntry, 'plugin', '--profile', target.profileName, 'add',
      '--config.minimumReleaseAge=0', packageSpec,
      `--registry=${options.registry ?? 'https://registry.npmjs.org/'}`,
    ]
    const child = spawn(process.execPath, args, {
      cwd: target.profileDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    })
    let detail = ''
    child.stdout?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })
    child.stderr?.on('data', (chunk) => { detail = (detail + String(chunk)).slice(-4000) })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Update timed out; use the standard DSH update flow.'))
    }, UPDATE_TIMEOUT_MS)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise({ ok: true })
      else reject(new Error(detail.trim() || `Update exited with code ${String(code)}.`))
    })
  })
}

let isGlobalUpdating = false

export async function runDirectUpdate(options, target = runtime()) {
  if (isGlobalUpdating) {
    throw new Error('Update is already in progress.')
  }
  isGlobalUpdating = true
  try {
    const status = await getUpdateStatus(options, target)
    if (status.latestVersion === undefined) {
      throw new Error('Latest version information is temporarily unavailable.')
    }
    if (!status.updateAvailable) {
      return { ...status, updated: false, message: 'Already up to date.' }
    }
    await installExact(target, `${options.packageName}@${status.latestVersion}`, options)
    return {
      ...status,
      updated: true,
      updatedVersion: status.latestVersion,
      restartRequired: true,
    }
  } finally {
    isGlobalUpdating = false
  }
}

export function registerPluginUpdater(ctx, options) {
  const getWebServer = () => ctx.get?.('webServer') || ctx.webServer
  return getWebServer().register({
    kind: 'exact',
    path: options.endpoint || '/dsh-messenger-gateway/update',
    handler: async (request, response) => {
      try {
        const target = runtime()
        if (request.method === 'GET' || request.method === 'HEAD') {
          const payload = await getUpdateStatus(options, target)
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          response.end(request.method === 'HEAD' ? undefined : JSON.stringify(payload))
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'GET, HEAD, POST' })
          response.end()
          return
        }
        if (!isTrustedUpdateRequest(request)) {
          response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ ok: false, error: 'Rejected untrusted or cross-origin update request.' }))
          return
        }
        if (isGlobalUpdating) {
          response.writeHead(409, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ ok: false, error: 'This plugin is already updating.' }))
          return
        }
        isGlobalUpdating = true
        try {
          const before = await getUpdateStatus(options, target)
          if (before.latestVersion === undefined) {
            response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({ ok: false, error: 'The latest version is temporarily unavailable.' }))
            return
          }
          if (!before.updateAvailable) {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            response.end(JSON.stringify({ ...before, updated: false }))
            return
          }
          await installExact(target, `${options.packageName}@${before.latestVersion}`, options)
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({
            ...before,
            updated: true,
            updatedVersion: before.latestVersion,
            restartRequired: true,
          }))
        } finally {
          isGlobalUpdating = false
        }
      } catch (error) {
        ctx.logger?.warn?.(`plugin updater error: ${error?.message || String(error)}`)
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ ok: false, error: error?.message || 'Plugin update failed.' }))
      }
    },
  })
}
