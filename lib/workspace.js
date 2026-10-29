import { resolve, normalize, basename } from 'node:path'
import { statSync, realpathSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
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
import { writeJsonAtomicSync } from "./storage-atomic.js"

export function resolveTopicWorkspacesStoragePath(config = {}) {
  if (config.topicWorkspacesStoragePath) return config.topicWorkspacesStoragePath
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh")
  return path.join(dshHome, "storages", "topic-workspaces.json")
}

export function inspectGitWorkspace(dirPath) {
  try {
    const gitPath = path.join(dirPath, ".git")
    if (existsSync(gitPath)) {
      const st = statSync(gitPath)
      if (st.isDirectory()) {
        return { isGit: true, isWorktree: false }
      }
      if (st.isFile()) {
        const content = readFileSync(gitPath, "utf8")
        const match = content.match(/gitdir:\s*(.+)/i)
        return { isGit: true, isWorktree: true, gitdir: match ? match[1].trim() : null }
      }
    }
  } catch {
    // not a git repo
  }
  return { isGit: false, isWorktree: false }
}

export function createTopicWorkspaceStore(filePath, { logger } = {}) {
  let cache = { workspaces: {} }
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf8"))
      if (raw && typeof raw === "object" && raw.workspaces) {
        cache = raw
      } else if (raw && typeof raw === "object") {
        cache = { workspaces: raw }
      }
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      logger?.warn?.(`[dsh-messenger-gateway] topic-workspaces load error: ${err?.message || err}`)
    }
  }

  function save() {
    try {
      writeJsonAtomicSync(filePath, cache)
    } catch (err) {
      logger?.warn?.(`[dsh-messenger-gateway] topic-workspaces save error: ${err?.message || err}`)
    }
  }

  function makeKey(chatId, threadId = 0) {
    const tid = Number(threadId) || 0
    return tid > 0 ? `${chatId}:${tid}` : String(chatId)
  }

  return {
    get(chatId, threadId = 0) {
      if (chatId === undefined || chatId === null) return null
      const key = makeKey(chatId, threadId)
      if (cache.workspaces[key]) return { ...cache.workspaces[key] }
      if (threadId) {
        const baseKey = String(chatId)
        if (cache.workspaces[baseKey]) return { ...cache.workspaces[baseKey] }
      }
      return null
    },
    set(chatId, threadId = 0, binding = {}) {
      if (chatId === undefined || chatId === null) return
      const key = makeKey(chatId, threadId)
      cache.workspaces[key] = {
        path: binding.path,
        name: binding.name || basename(binding.path),
        role: binding.role || null,
        worktree: Boolean(binding.worktree),
        boundAt: binding.boundAt || new Date().toISOString(),
      }
      save()
    },
    delete(chatId, threadId = 0) {
      if (chatId === undefined || chatId === null) return false
      const key = makeKey(chatId, threadId)
      if (cache.workspaces[key]) {
        delete cache.workspaces[key]
        save()
        return true
      }
      return false
    },
    list(chatId) {
      if (chatId === undefined || chatId === null) return []
      const prefix = `${chatId}:`
      const baseKey = String(chatId)
      const results = []
      for (const [key, val] of Object.entries(cache.workspaces)) {
        if (key === baseKey || key.startsWith(prefix)) {
          const parts = key.split(":")
          const tid = parts[1] ? Number(parts[1]) : 0
          results.push({ threadId: tid, ...val })
        }
      }
      return results
    },
    all() {
      return { ...cache.workspaces }
    },
  }
}
