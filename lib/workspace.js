import { resolve, normalize, basename } from 'node:path'
import { statSync, realpathSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomic } from './storage-atomic.js'

/**
 * Validates configured cwd path and returns an error description if invalid.
 * Empty or unconfigured cwd returns null (defaults to host launch dir).
 */
export function getCwdWarning(configuredCwd) {
  const trimmed = typeof configuredCwd === 'string' ? configuredCwd.trim() : ''
  if (!trimmed) return null
  try {
    const resolved = resolve(trimmed)
    const st = statSync(resolved)
    if (!st.isDirectory()) {
      return `Path "${trimmed}" is not a directory`
    }
    return null
  } catch (err) {
    const code = err?.code || err?.message || String(err)
    return `Directory "${trimmed}" does not exist or is not accessible (${code})`
  }
}

/**
 * Resolves effective working directory for agent sessions and file operations.
 * Falls back to process.cwd() if configured cwd is empty or invalid.
 */
export function resolveEffectiveCwd(configuredCwd, logger) {
  const trimmed = typeof configuredCwd === 'string' ? configuredCwd.trim() : ''
  if (!trimmed) return process.cwd()
  const warning = getCwdWarning(trimmed)
  if (warning) {
    logger?.warn?.(`[dsh-messenger-gateway] ${warning}, falling back to process.cwd()`)
    return process.cwd()
  }
  try {
    return realpathSync(resolve(trimmed))
  } catch {
    return resolve(trimmed)
  }
}

/**
 * Registers an agent session in the corresponding DSH workspace so it appears
 * in the sidebar under its project instead of "Ungrouped" (未分组).
 */
export async function registerSessionInWorkspace(ctx, sessionId, cwd, logger) {
  if (!sessionId || !cwd) return false
  const targetSessionId = String(sessionId)
  let realCwd = cwd
  try {
    realCwd = realpathSync(resolve(cwd))
  } catch {
    realCwd = resolve(cwd)
  }

  // 1. Try Cordis service ctx.workspaceRegistry first
  const registry = ctx?.get?.('workspaceRegistry') || ctx?.workspaceRegistry
  if (registry) {
    try {
      let ws = null
      if (typeof registry.resolveByPath === 'function') {
        ws = await registry.resolveByPath(realCwd).catch(() => null)
        if (!ws && realCwd !== cwd) {
          ws = await registry.resolveByPath(cwd).catch(() => null)
        }
      }
      if (!ws && typeof registry.create === 'function') {
        ws = await registry.create(realCwd).catch((err) => {
          logger?.debug?.(`[dsh-messenger-gateway] workspaceRegistry.create('${realCwd}') failed: ${err?.message || err}`)
          return null
        })
      }
      if (ws && typeof ws.attachSession === 'function') {
        await ws.attachSession(targetSessionId)
        logger?.debug?.(`[dsh-messenger-gateway] attached session '${targetSessionId}' to workspace '${ws.path || realCwd}' via workspaceRegistry`)
        return true
      }
    } catch (err) {
      logger?.debug?.(`[dsh-messenger-gateway] workspaceRegistry attach error: ${err?.message || err}`)
    }
  }

  // 2. Fallback to atomic file write in ~/.dsh/storages/workspace.json
  try {
    const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    const wsFile = path.join(dshHome, 'storages', 'workspace.json')
    if (existsSync(wsFile)) {
      const raw = await readFile(wsFile, 'utf8')
      const data = JSON.parse(raw)
      if (data && data.tables && data.tables.workspaces) {
        let matchedId = null
        for (const [id, w] of Object.entries(data.tables.workspaces)) {
          if (!w || !w.path) continue
          try {
            if (realpathSync(resolve(w.path)) === realCwd) {
              matchedId = id
              break
            }
          } catch {
            if (w.path === realCwd || w.path === cwd) {
              matchedId = id
              break
            }
          }
        }

        const now = new Date().toISOString()
        if (matchedId) {
          const w = data.tables.workspaces[matchedId]
          if (!Array.isArray(w.sessionIds)) w.sessionIds = []
          if (!w.sessionIds.includes(targetSessionId)) {
            w.sessionIds.push(targetSessionId)
            w.updatedAt = now
            await writeJsonAtomic(wsFile, data)
            logger?.debug?.(`[dsh-messenger-gateway] registered session '${targetSessionId}' in workspace '${matchedId}' (${w.path}) via storage file`)
            return true
          }
          return true
        } else {
          const newId = randomUUID()
          const title = basename(realCwd) || realCwd
          data.tables.workspaces[newId] = {
            path: realCwd,
            title,
            sessionIds: [targetSessionId],
            createdAt: now,
            updatedAt: now,
          }
          if (data.global && Array.isArray(data.global.workspaceIds)) {
            data.global.workspaceIds.push(newId)
          }
          await writeJsonAtomic(wsFile, data)
          logger?.debug?.(`[dsh-messenger-gateway] created workspace '${newId}' (${realCwd}) and registered session '${targetSessionId}'`)
          return true
        }
      }
    }
  } catch (err) {
    logger?.debug?.(`[dsh-messenger-gateway] fallback workspace registration error: ${err?.message || err}`)
  }

  return false
}