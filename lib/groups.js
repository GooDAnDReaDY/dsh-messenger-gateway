/** Group/supergroup mention & reply gating for Telegram. */

export function isPrivateChat(chatType) {
  return !chatType || chatType === 'private'
}

export function isGroupChat(chatType) {
  return chatType === 'group' || chatType === 'supergroup'
}

/** True if text entities mention @botUsername or /cmd@botUsername. */
export function textMentionsBot(text, entities, botUsername) {
  const uname = String(botUsername || '').replace(/^@/, '').toLowerCase()
  if (!uname) return false
  const body = String(text || '')
  if (Array.isArray(entities)) {
    for (const ent of entities) {
      if (!ent || typeof ent.offset !== 'number' || typeof ent.length !== 'number') continue
      const slice = body.slice(ent.offset, ent.offset + ent.length)
      if (ent.type === 'mention' && slice.replace(/^@/, '').toLowerCase() === uname) return true
      if (ent.type === 'text_mention' && ent.user?.is_bot && String(ent.user?.username || '').toLowerCase() === uname) return true
      if (ent.type === 'bot_command') {
        const cmd = slice.toLowerCase()
        if (cmd.includes('@') && cmd.endsWith('@' + uname)) return true
      }
    }
  }
  const lower = body.toLowerCase()
  if (lower.includes('@' + uname)) return true
  return false
}

export function isReplyToBot(replyTo, botId) {
  if (!replyTo?.from) return false
  const id = Number(botId)
  if (Number.isFinite(id) && Number(replyTo.from.id) === id) return true
  return Boolean(replyTo.from.is_bot)
}

/**
 * Decide whether the gateway should process this inbound message.
 * Private: always. Groups: only if enabled + (mention | reply-to-bot | command).
 */
export function shouldProcessTelegramMessage({
  chatType,
  text,
  entities,
  replyTo,
  botId,
  botUsername,
  groupsEnabled = true,
  requireMention = true,
}) {
  if (isPrivateChat(chatType)) return { ok: true, reason: 'private' }
  if (!isGroupChat(chatType)) return { ok: false, reason: 'unsupported-chat' }
  if (!groupsEnabled) return { ok: false, reason: 'groups-disabled' }
  const body = String(text || '').trim()
  if (body.startsWith('/')) return { ok: true, reason: 'command' }
  if (isReplyToBot(replyTo, botId)) return { ok: true, reason: 'reply-to-bot' }
  if (!requireMention) return { ok: true, reason: 'groups-open' }
  if (textMentionsBot(body, entities, botUsername)) return { ok: true, reason: 'mention' }
  return { ok: false, reason: 'no-mention' }
}

/** Strip @bot from /cmd@bot for command parsing. */
export function stripBotCommandSuffix(text, botUsername) {
  const raw = String(text || '')
  const uname = String(botUsername || '').replace(/^@/, '')
  if (!uname) return raw
  const escaped = uname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return raw.replace(new RegExp('^(/[a-z0-9_]+)@' + escaped + '\\b', 'i'), '$1')
}
