import { randomUUID } from 'node:crypto'

export const TELEGRAM_CALLBACK_DATA_MAX = 64

export function makeAskToken() {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

export function buildCallbackData(token, buttonId) {
  const data = `${token}:${buttonId}`
  if (data.length > TELEGRAM_CALLBACK_DATA_MAX) {
    const err = new Error(`callback_data too long (${data.length} > ${TELEGRAM_CALLBACK_DATA_MAX})`)
    err.status = 400
    throw err
  }
  return data
}

export function parseCallbackData(data) {
  const raw = String(data || '')
  const idx = raw.indexOf(':')
  if (idx <= 0) return { token: undefined, buttonId: raw }
  return { token: raw.slice(0, idx), buttonId: raw.slice(idx + 1) }
}

/** Build Telegram inline_keyboard rows and callback_data keys for an ask session. */
export function buildInlineKeyboard(token, buttons) {
  const callbackKeys = []
  const rows = (buttons || []).map((row) => row.map((btn) => {
    const callback_data = buildCallbackData(token, btn.id)
    callbackKeys.push(callback_data)
    return { text: btn.text, callback_data }
  }))
  return {
    replyMarkup: rows.length ? { inline_keyboard: rows } : undefined,
    callbackKeys,
  }
}

export function indexCallbacks(callbackIndex, keys, token) {
  for (const key of keys || []) callbackIndex.set(key, token)
}

export function releaseCallbacks(callbackIndex, keys) {
  for (const key of keys || []) callbackIndex.delete(key)
}

export function targetMatchesAsk(pending, cb) {
  const target = pending?.target
  if (!target) return false
  if (cb?.platform && target.platform && cb.platform !== target.platform) return false
  if (cb?.chatId !== undefined && String(target.chatId) !== String(cb.chatId)) return false
  return true
}

export function rejectPendingAsk(pending, err) {
  if (!pending) return
  clearTimeout(pending.timer)
  pending.reject(err)
}

export const REMOVE_KEYBOARD = { inline_keyboard: [] }
