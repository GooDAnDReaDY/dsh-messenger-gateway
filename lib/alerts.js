import { escapeHtml } from './telegram-format.js'
import { normalizeThreadId } from './topics.js'

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
