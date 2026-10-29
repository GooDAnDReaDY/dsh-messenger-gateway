/**
 * Companion client for dsh-memory-brain service (#152).
 *
 * Implements persistent user memory and profile context over memory-brain's
 * JSON-RPC /mcp and REST interface:
 * - Scoped strictly to `user:<userId>` to prevent cross-user context leakage.
 * - Non-blocking, fail-open: gateway turns never fail if memory-brain is offline.
 * - Native Node 20 fetch without external dependencies.
 */

export function resolveMemoryConfig(config) {
  const cfg = config || {}
  const tokenEnv = cfg.tokenEnv || 'MEMORY_BRAIN_TOKEN'
  const token = cfg.token || (typeof process !== 'undefined' && process.env ? process.env[tokenEnv] : '') || ''
  const baseUrl = (cfg.baseUrl || (typeof process !== 'undefined' && process.env ? process.env.MEMORY_BRAIN_URL : '') || 'http://127.0.0.1:28080').replace(/\/+$/, '')
  return {
    enabled: cfg.enabled !== false,
    baseUrl,
    token,
    tokenEnv,
    autoInject: cfg.autoInject !== false,
    budget: Number(cfg.budget) || 2000,
    timeoutMs: Number(cfg.timeoutMs) || 3500,
  }
}

export function parseMemoryListText(text) {
  if (!text || typeof text !== 'string') return []
  const items = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const idMatch = trimmed.match(/\[id:([0-9a-fA-F-]+)\]/)
    if (!idMatch) continue
    const id = idMatch[1]
    let content = trimmed
    const dashIdx = trimmed.indexOf('—')
    if (dashIdx !== -1) {
      content = trimmed.slice(dashIdx + 1).trim()
    } else {
      content = trimmed.replace(/^-?\s*\[id:[^\]]+\]\s*/, '').trim()
    }
    items.push({ id, content, raw: trimmed })
  }
  return items
}

export function cleanRecalledMemories(text) {
  if (!text || typeof text !== 'string') return ''
  const lines = text.split('\n')
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('[protocol') || trimmed.startsWith('Index not fully ready')) continue
    const idMatch = trimmed.match(/\[id:([0-9a-fA-F-]+)\]\s*(.*?)(?:\s+—\s+written by.*)?$/)
    if (idMatch) {
      const fact = idMatch[2].replace(/\s+—\s+written by.*$/, '').trim()
      if (fact) out.push(`- ${fact}`)
    } else if (trimmed.startsWith('- ')) {
      out.push(trimmed)
    }
  }
  return out.join('\n')
}

export function formatMemoryContext(recalledText, userId) {
  const clean = cleanRecalledMemories(recalledText)
  if (!clean) return ''
  return `[User Memory Profile (userId: ${userId})]:\n${clean}`
}

export function extractConversationalPreferences(text) {
  if (!text || typeof text !== 'string') return null
  const s = text.trim()
  if (s.startsWith('/')) return null
  const patterns = [
    /^(?:запомни|сохрани в память)(?:\s*[:,]\s*|\s+)(.+)$/i,
    /^(?:remember|note that)(?:\s*[:,]\s*|\s+)(.+)$/i,
    /(?:я предпочитаю|мое предпочтение|мой выбор)\s+(.+)/i,
    /(?:i prefer|my preference is)\s+(.+)/i,
    /(?:всегда отвечай|всегда пиши|всегда используй)\s+(.+)/i,
    /(?:always answer|always reply|always use)\s+(.+)/i,
    /(?:меня зовут|мое имя)\s+([A-Za-zА-Яа-яЁё0-9_-]+)/i,
    /(?:my name is|call me)\s+([A-Za-z0-9_-]+)/i,
  ]
  for (const pat of patterns) {
    const m = s.match(pat)
    if (m && m[1]) return m[1].trim()
  }
  return null
}

export async function callMemoryMcp(rawConfig, toolName, args, signal) {
  const cfg = resolveMemoryConfig(rawConfig)
  if (!cfg.enabled) {
    return { ok: false, error: 'memory_disabled' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs)
  let onAbort = null
  if (signal) {
    onAbort = () => controller.abort()
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (cfg.token) {
      headers.Authorization = `Bearer ${cfg.token}`
    }

    const res = await fetch(`${cfg.baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `msgw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args || {},
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }

    const data = await res.json()
    if (data?.error) {
      return { ok: false, error: data.error.message || `error code ${data.error.code}` }
    }

    const text = data?.result?.content?.[0]?.text
    return { ok: true, text: typeof text === 'string' ? text : JSON.stringify(data?.result ?? {}) }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  } finally {
    clearTimeout(timeoutId)
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export async function listUserMemories({ config, userId, limit = 20, signal }) {
  if (!userId) return { ok: false, error: 'missing_user_id', items: [] }
  const scope = `user:${userId}`
  const res = await callMemoryMcp(config, 'brain_list', { scope, limit }, signal)
  if (!res.ok) {
    return { ok: false, error: res.error, items: [] }
  }
  const items = parseMemoryListText(res.text)
  return { ok: true, items, raw: res.text }
}

export async function recallUserMemories({ config, userId, query = '', budget, signal }) {
  if (!userId) return ''
  const scope = `user:${userId}`
  const cleanQ = String(query || '').trim()

  // If query is trivial or empty, recall user profile by listing memories
  if (!cleanQ || cleanQ.length < 3) {
    const listRes = await listUserMemories({ config, userId, limit: 10, signal })
    if (!listRes.ok || !listRes.items.length) return ''
    const facts = listRes.items.map((it) => `- ${it.content}`).join('\n')
    return formatMemoryContext(facts, userId)
  }

  const res = await callMemoryMcp(config, 'brain_recall', {
    query: cleanQ,
    scope,
    limit: 10,
    budget: budget || 2000,
  }, signal)

  if (!res.ok || !res.text) return ''
  return formatMemoryContext(res.text, userId)
}

export async function rememberUserFact({ config, userId, content, category = 'preference', signal }) {
  if (!userId) return { ok: false, error: 'missing_user_id' }
  const text = String(content || '').trim()
  if (!text) return { ok: false, error: 'empty_content' }
  const scope = `user:${userId}`

  const res = await callMemoryMcp(config, 'brain_remember', {
    content: text,
    scope,
    category,
    permanent: true,
  }, signal)

  if (!res.ok) return res

  // Try extracting memoryId from json response if present
  let memoryId = null
  try {
    const parsed = JSON.parse(res.text)
    memoryId = parsed.memoryId || parsed.id || parsed.memoryIds?.[0] || null
  } catch {
    /* raw string response is fine */
  }

  return { ok: true, memoryId, text: res.text }
}

export async function forgetUserMemory({ config, userId, memoryId, signal }) {
  if (!userId) return { ok: false, error: 'missing_user_id' }
  const target = String(memoryId || '').trim()
  if (!target) return { ok: false, error: 'missing_memory_id' }

  if (target.toLowerCase() === 'all') {
    const listRes = await listUserMemories({ config, userId, limit: 100, signal })
    if (!listRes.ok) return listRes
    let forgotten = 0
    for (const item of listRes.items) {
      const delRes = await callMemoryMcp(config, 'brain_forget', {
        memory_id: item.id,
        confirm: true,
      }, signal)
      if (delRes.ok) forgotten++
    }
    return { ok: true, count: forgotten }
  }

  // Support short prefix matches (e.g. 8 chars)
  let resolvedId = target
  if (target.length < 36) {
    const listRes = await listUserMemories({ config, userId, limit: 50, signal })
    if (listRes.ok && listRes.items) {
      const match = listRes.items.find((it) => it.id.toLowerCase().startsWith(target.toLowerCase()))
      if (match) resolvedId = match.id
    }
  }

  const res = await callMemoryMcp(config, 'brain_forget', {
    memory_id: resolvedId,
    confirm: true,
  }, signal)

  return res
}

export async function recordTurnMemory({ config, userId, userText, assistantText, signal, logger }) {
  const extracted = extractConversationalPreferences(userText)
  if (!extracted) return { ok: true, skipped: true }

  try {
    const res = await rememberUserFact({
      config,
      userId,
      content: extracted,
      category: 'preference',
      signal,
    })
    if (res.ok && logger) {
      logger.debug?.(`[memory-brain] auto-recorded user preference: "${extracted}" for user ${userId}`)
    }
    return res
  } catch (err) {
    if (logger) {
      logger.debug?.(`[memory-brain] recordTurnMemory failed: ${err?.message || err}`)
    }
    return { ok: false, error: err?.message || String(err) }
  }
}
