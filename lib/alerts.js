import { escapeHtml } from './telegram-format.js'
import { normalizeThreadId } from './topics.js'

export function formatAlertMessage(type, payload = {}) {
  const timestamp = new Date().toLocaleTimeString()

  if (type === 'pairing') {
    const { userId, username, code } = payload
    const userStr = username ? `@${username} (id: <code>${userId}</code>)` : `id: <code>${userId}</code>`
    return [
      `🔐 <b>[Запрос сопряжения]</b> <i>(${timestamp})</i>`,
      '',
      `Пользователь: ${userStr}`,
      `Код доступа: <code>${code}</code>`,
      '',
      `Для одобрения отправьте боту:`,
      `<code>/pair ${code}</code>`,
    ].join('\n')
  }

  if (type === 'error') {
    const { message, code, sessionId, chatId, threadId } = payload
    const location = chatId ? `Чат: <code>${chatId}</code>${threadId ? ` / топик <code>${threadId}</code>` : ''}` : ''
    const sess = sessionId ? `Сессия: <code>${sessionId}</code>` : ''
    const meta = [location, sess].filter(Boolean).join('\n')

    return [
      `🚨 <b>[Ошибка шлюза]</b> <i>(${timestamp})</i>`,
      meta ? `\n${meta}` : '',
      `Ошибка: <b>${escapeHtml(String(code || 'error'))}</b>`,
      `<code>${escapeHtml(String(message || 'unknown error'))}</code>`,
    ].filter(Boolean).join('\n')
  }

  if (type === 'status') {
    const { title, details } = payload
    return [
      `⚡ <b>[Шлюз: ${escapeHtml(title || 'Статус')}]</b> <i>(${timestamp})</i>`,
      details ? `\n${escapeHtml(details)}` : '',
    ].filter(Boolean).join('\n')
  }

  return `🔔 <b>[Алерт: ${type}]</b> <i>(${timestamp})</i>\n${escapeHtml(JSON.stringify(payload))}`
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
