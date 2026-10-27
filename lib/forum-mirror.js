import { mergeDynamicCommands } from './commands.js'
import { t } from './locales/index.js'
import { stripReasoningPreamble, splitText, truncateSafe } from './text.js'
import { stripImageUrls } from './outbound.js'

export async function collectDynamicSkills(ctx) {
  const skills = []
  try {
    const skillsService = ctx?.get ? ctx.get("skills") : ctx?.skills
    if (!skillsService) return skills
    const rawSkills = typeof skillsService.list === "function" ? skillsService.list() : []
    const allSkills = (rawSkills && typeof rawSkills.then === "function") ? await rawSkills : (rawSkills || [])
    for (const s of allSkills) {
      if (!s || !s.name) continue
      if (s.invocation?.userInvocable === false || s.userInvocable === false) continue
      const rawDesc = String(s.description || s.title || `Skill ${s.name}`).trim()
      skills.push({
        name: String(s.name),
        description: truncateSafe(rawDesc || `Skill ${s.name}`, 80),
      })
    }
  } catch (err) {
    ctx?.logger?.debug?.(`Failed to collect dynamic skills: ${err?.message || err}`)
  }
  return skills
}
/**
 * Restore original hyphenated skill name from Telegram sanitized underscore command.
 * E.g. /code_review -> /code-review
 * Does not rewrite if the skill literally exists with underscores.
 * Also strips optional @BotName mention.
 */
export function restoreSkillGesture(gw, body) {
  if (!body || !body.startsWith('/')) return body
  const parts = body.split(/\s+/)
  const firstToken = parts[0]
  const atIdx = firstToken.indexOf('@')
  const rawCmd = (atIdx !== -1 ? firstToken.slice(1, atIdx) : firstToken.slice(1)).toLowerCase()

  // If a skill literally named `rawCmd` exists, do NOT rewrite
  if (gw?.rawSkillNames?.has(rawCmd)) {
    return atIdx !== -1 ? `/${rawCmd}${body.slice(firstToken.length)}` : body
  }

  // If mapped from sanitized form (e.g. code_review -> code-review)
  const original = gw?.skillNameMap?.get(rawCmd)
  if (original) {
    return `/${original}${body.slice(firstToken.length)}`
  }

  // Just strip @bot if present
  if (atIdx !== -1) {
    return `/${rawCmd}${body.slice(firstToken.length)}`
  }

  return body
}

export async function syncTelegramCommands(gw) {
    const tgAdapter = gw.adapters.get('telegram')
    if (!tgAdapter || typeof tgAdapter.registerCommands !== 'function') return
    const baseCommands = gw.config.telegram?.commands || []
    const dynamicSkills = await collectDynamicSkills(gw.ctx)

    if (!gw.skillNameMap) gw.skillNameMap = new Map()
    if (!gw.rawSkillNames) gw.rawSkillNames = new Set()
    gw.skillNameMap.clear()
    gw.rawSkillNames.clear()

    for (const s of dynamicSkills) {
      const rawName = String(s.name || '').trim()
      if (!rawName) continue
      gw.rawSkillNames.add(rawName.toLowerCase())
      const sanitized = rawName.replace(/^\//, '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32)
      if (sanitized && sanitized !== rawName) {
        gw.skillNameMap.set(sanitized, rawName)
      }
    }
    const merged = mergeDynamicCommands(baseCommands, dynamicSkills, 100)
    try {
      await tgAdapter.registerCommands(merged)
      gw.ctx?.logger?.info?.(`Synced ${merged.length} Telegram commands (including ${dynamicSkills.length} dynamic skills)`)
    } catch (err) {
      gw.ctx?.logger?.warn?.(`Failed to sync Telegram commands: ${err?.message || err}`)
    }
  }
export async function mirrorSessionToForumTopic(gw, session) {
    if (!session || !session.id) return
    const sessionId = String(session.id)
    if (sessionId.startsWith('msgw-')) return
    if (gw.sessionToThread.has(sessionId)) return

    const tgCfg = gw.config.telegram || {}
    if (!tgCfg.forumMirrorEnabled || !tgCfg.forumMirrorChatId) return

    const tgAdapter = gw.adapters.get('telegram')
    if (!tgAdapter || typeof tgAdapter.createForumTopic !== 'function') return

    const forumChatId = tgCfg.forumMirrorChatId
    const title = String(session.title || session.meta?.name || `Session ${sessionId.slice(0, 8)}`).slice(0, 120)

    try {
      const topic = await tgAdapter.createForumTopic(forumChatId, title)
      const threadId = topic?.message_thread_id
      if (!threadId) return

      const threadKey = `${forumChatId}:${threadId}`
      gw.sessionToThread.set(sessionId, { chatId: forumChatId, threadId })
      gw.threadToSession.set(threadKey, sessionId)

      const text = t('mirror.created', { sessionId, title }, 'en')
      await tgAdapter.sendTo(forumChatId, { text }, { threadId })
      gw.ctx?.logger?.info?.(`Mirrored session ${sessionId} to Telegram forum topic ${threadId} in ${forumChatId}`)
    } catch (err) {
      gw.ctx?.logger?.warn?.(`Failed to mirror session ${sessionId} to forum topic: ${err?.message || err}`)
    }
  }
export async function relayTurnToForumMirror(gw, session, event) {
    if (!session || !session.id) return
    const sessionId = String(session.id)
    const threadInfo = gw.sessionToThread.get(sessionId)
    if (!threadInfo) return
    if (gw.pending.has(sessionId)) return

    const tgAdapter = gw.adapters.get('telegram')
    if (!tgAdapter) return

    const messages = Array.isArray(session.messages)
      ? session.messages
      : (Array.isArray(session.history) ? session.history : [])

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const role = msg.role || (msg.type === 'user' ? 'user' : 'assistant')
      if (role === 'assistant') {
        let text = ''
        if (typeof msg.content === 'string') text = msg.content
        else if (Array.isArray(msg.content)) {
          text = msg.content
            .map((p) => (typeof p === 'string' ? p : (p?.text || '')))
            .filter(Boolean)
            .join('\n')
        } else if (msg.text) text = msg.text
        const clean = stripReasoningPreamble(stripImageUrls(text)).trim()
        if (clean) {
          const maxLen = Number(gw.config.agent?.maxMessageLength) || 4000
          const chunks = splitText(clean, maxLen)
          for (const chunk of chunks) {
            await tgAdapter.sendTo(threadInfo.chatId, { text: chunk }, { threadId: threadInfo.threadId })
          }
        }
        break
      }
    }
  }
