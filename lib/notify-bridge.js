// Notify → Telegram home bridge for non-messenger sessions (#187, #233).
// Extracted from the plugin entry point: the handler logic is unchanged,
// the gateway and the config source are injected by the caller.

function isExcludedSession(sessionId, prefixes) {
  const sid = String(sessionId || '')
  for (const p of prefixes || []) {
    if (typeof p === 'string' && p.length > 0 && sid.startsWith(p)) return true
  }
  return false
}

/**
 * Register the notify bridge listeners on the plugin context.
 * @param {any} ctx plugin context (ctx.on / ctx.logger)
 * @param {{ getSource: () => any, getGw: () => any }} io config source and
 *   live-gateway accessors
 */
export function setupNotifyBridge(ctx, { getSource, getGw }) {
  ctx.effect(() => {
    const turnStarts = new Map()
    const seenEvents = new Map()

    const cleanOldEntries = (map, maxAgeMs = 7_200_000, maxEntries = 500) => {
      const now = Date.now()
      if (map.size > maxEntries) {
        for (const [k, ts] of map.entries()) {
          if (now - ts > maxAgeMs) map.delete(k)
        }
      }
    }

    const handleNotify = (session, event) => {
      if (!session || !event) return
      const cfg = getSource().telegram?.notifyBridge
      if (!cfg?.enabled) return

      const sessionId = String(session.id || '')
      if (!sessionId) return

      const prefixes = cfg.excludeSessionPrefixes || ['msgw-']
      if (isExcludedSession(sessionId, prefixes)) return

      const now = Date.now()

      if (event.type === 'turn/start') {
        cleanOldEntries(turnStarts, 7_200_000, 100)
        turnStarts.set(sessionId, now)
        return
      }

      const configuredEvents = new Set(
        (cfg.events?.length ? cfg.events : ['task_done', 'error'])
          .map((e) => String(e).toLowerCase().replace(/-/g, '_'))
      )

      let kind = null
      let title = null
      let replayKey = null
      const lines = []

      if (event.type === 'approval/asked' || event.type === 'approval/request') {
        kind = 'approval'
        title = 'Action approval required'
        const data = event.data || {}
        const reqId = data.id || data.callId || ''
        replayKey = `${sessionId}:approval:${reqId}:${data.toolName || ''}`
        if (!configuredEvents.has('approval')) return

        lines.push(
          `【${title}】`,
          `session: ${sessionId}`,
        )
        if (data.toolName) lines.push(`tool: ${data.toolName}`)
        if (data.reason) lines.push(`reason: ${data.reason}`)
        if (reqId) lines.push(`id: ${reqId}`)
      } else if (event.type === 'turn/end') {
        const reason = event.data?.reason || event.reason || event.data
        const rawKind = String(reason?.kind || '').toLowerCase().replace(/-/g, '_')

        if (rawKind === 'completed') {
          kind = 'task_done'
          title = 'Task completed'
        } else if (rawKind === 'blocked') {
          kind = 'blocked'
          title = 'Agent blocked'
        } else if (rawKind === 'max_tokens' || rawKind === 'maxtokens') {
          kind = 'max_tokens'
          title = 'Max tokens reached'
        } else {
          kind = 'error'
          title = 'Agent error'
        }

        if (!configuredEvents.has(kind)) return

        const turn = event.data?.turn || event.turn || ''
        replayKey = `${sessionId}:turn_end:${turn}:${kind}`

        const started = turnStarts.get(sessionId)
        turnStarts.delete(sessionId)
        const dur = started ? Math.round((now - started) / 1000) : null

        lines.push(
          `【${title}】`,
          `session: ${sessionId}`,
        )
        if (dur != null) lines.push(`duration: ${dur}s`)

        if (kind === 'error') {
          const err = reason?.error
          lines.push(`error: ${err?.message || err?.code || 'unknown'}`)
        } else if (kind === 'blocked' && reason?.reason) {
          lines.push(`reason: ${reason.reason}`)
        }
      } else {
        return
      }

      // Replay prevention (no duplicate notifications on projection replay)
      cleanOldEntries(seenEvents, 3_600_000, 500)
      if (replayKey) {
        if (seenEvents.has(replayKey)) return
        seenEvents.set(replayKey, now)
      }

      const gw = getGw()
      if (!gw) return

      const homeName = cfg.home || 'default'
      const home = gw.messenger?.home?.(homeName) || gw.messenger?.home?.() || null
      if (!home || !home.chatId) {
        ctx.logger?.debug?.(`notify bridge: recipient home "${homeName}" not found or missing chatId`)
        return
      }
      if (gw.isMuted?.(home.chatId)) return

      // Non-blocking async dispatch so agent turn is never stalled
      Promise.resolve().then(async () => {
        try {
          await gw.messengerSend({ platform: 'telegram', home: homeName }, { text: lines.join('\n') })
        } catch (e) {
          ctx.logger?.warn?.(`notify bridge delivery failed: ${e?.message || e}`)
        }
      })
    }

    const un1 = ctx.on('session/event', handleNotify)
    const un2 = ctx.on('turn/end', (session, data) => handleNotify(session, { type: 'turn/end', data }))
    const un3 = ctx.on('turn/start', (session, data) => handleNotify(session, { type: 'turn/start', data }))
    const un4 = ctx.on('approval/asked', (session, data) => handleNotify(session, { type: 'approval/asked', data }))
    const un5 = ctx.on('approval/request', (session, data) => handleNotify(session, { type: 'approval/request', data }))
    return () => {
      if (typeof un1 === 'function') un1()
      if (typeof un2 === 'function') un2()
      if (typeof un3 === 'function') un3()
      if (typeof un4 === 'function') un4()
      if (typeof un5 === 'function') un5()
    }
  }, 'dsh-messenger-gateway: notify bridge')
}
