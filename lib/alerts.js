import { escapeHtml } from './telegram-format.js'
import { normalizeThreadId } from './topics.js'
import { t } from './locales/index.js'

export function formatAlertMessage(type, payload = {}) {
  const timestamp = new Date().toLocaleTimeString()

  if (type === 'pairing') {
    const { userId, username, code } = payload
    const userStr = username ? `@${username} (id: <code>${userId}</code>)` : `id: <code>${userId}</code>`
    return [
      `🔐 <b>[Pairing Request]</b> <i>(${timestamp})</i>`,
      '',
      `User: ${userStr}`,
      `Pairing Code: <code>${code}</code>`,
      '',
      `To approve, send to bot:`,
      `<code>/pair ${code}</code>`,
    ].join('\n')
  }

  if (type === 'error') {
    const { message, code, sessionId, chatId, threadId } = payload
    const location = chatId ? `Chat: <code>${chatId}</code>${threadId ? ` / thread <code>${threadId}</code>` : ''}` : ''
    const sess = sessionId ? `Session: <code>${sessionId}</code>` : ''
    const meta = [location, sess].filter(Boolean).join('\n')

    return [
      `🚨 <b>[Gateway Error]</b> <i>(${timestamp})</i>`,
      meta ? `\n${meta}` : '',
      `Error code: <b>${escapeHtml(String(code || 'error'))}</b>`,
      `<code>${escapeHtml(String(message || 'unknown error'))}</code>`,
    ].filter(Boolean).join('\n')
  }

  if (type === 'status') {
    const { title, details } = payload
    return [
      `⚡ <b>[Gateway: ${escapeHtml(title || 'Status')}]</b> <i>(${timestamp})</i>`,
      details ? `\n${escapeHtml(details)}` : '',
    ].filter(Boolean).join('\n')
  }

  return `🔔 <b>[Alert: ${type}]</b> <i>(${timestamp})</i>\n${escapeHtml(JSON.stringify(payload))}`
}

export function resolveAlertTarget(gateway) {
  const alertsCfg = gateway?.config?.telegram?.alerts
  if (!alertsCfg || alertsCfg.enabled === false) return null

  // If a named home is specified
  if (alertsCfg.home) {
    const home = gateway.resolveHomeTarget('telegram', alertsCfg.home)
    if (home) return home
  }

  const chatId = alertsCfg.chatId
  if (!chatId) return null

  return {
    platform: 'telegram',
    chatId,
    threadId: normalizeThreadId(alertsCfg.threadId),
  }
}

export async function handleSetAlertCommand(gw, input, locale) {
  const { reply, userId, chatId, threadId = 0 } = input
  if (!gw.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
  const nextTg = {
    ...gw.tg(),
    alerts: {
      ...(gw.tg().alerts || {}),
      enabled: true,
      chatId,
      threadId: threadId || 0,
    },
  }
  gw.config.telegram = nextTg
  try { await gw.hooks?.persistHomes?.(nextTg) } catch (err) { gw.logger?.warn?.('persistHomes error:', err?.message || err) }
  return reply(`🔔 This chat assigned as alert channel (chat: ${chatId}${threadId ? `, topic: ${threadId}` : ''}).`)
}

export async function handleAlertCommand(gw, input, parts) {
  const { reply, userId } = input
  const sub = parts[1]?.toLowerCase()
  if (sub === 'test') {
    const target = resolveAlertTarget(gw)
    if (!target) return reply('Alert channel not configured. Configure: /setalert')
    await gw.sendAlert('status', { title: 'Test Alert', details: `Sent by user ID ${userId}` })
    return reply('Test alert sent to alert channel.')
  }
  const target = resolveAlertTarget(gw)
  const alertsCfg = gw.tg().alerts || {}
  return reply([
    '🔔 <b>Alert Channel:</b>',
    `Status: ${alertsCfg.enabled ? 'enabled' : 'disabled'}`,
    `Chat: ${target ? `${target.chatId}${target.threadId ? ` (topic: ${target.threadId})` : ''}` : '(not assigned)'}`,
    `Events: ${(alertsCfg.events || ['error', 'pairing']).join(', ')}`,
    '',
    'Commands:',
    '/setalert — assign current chat as alert channel',
    '/alert test — send test alert',
  ].join('\n'))
}
