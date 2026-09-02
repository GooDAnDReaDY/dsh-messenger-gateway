import { randomUUID } from 'node:crypto'
import { normalizeThreadId } from './topics.js'

export const TELEGRAM_CALLBACK_DATA_MAX = 64
export const DEFAULT_PAGE_SIZE = 6

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

export function parseAskCallback(data) {
  const raw = String(data || '')
  const parts = raw.split(':')
  if (parts.length < 2) return { token: undefined, kind: 'unknown', id: raw }
  const token = parts[0]
  const rest = parts.slice(1).join(':')

  if (rest === 'done') return { token, kind: 'done', id: 'done' }
  if (rest === 'cancel') return { token, kind: 'cancel', id: 'cancel' }
  if (rest.startsWith('t:')) return { token, kind: 'toggle', id: rest.slice(2) }
  if (rest.startsWith('p:')) return { token, kind: 'page', page: Number(rest.slice(2)) || 0 }

  return { token, kind: 'select', id: rest }
}

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

export function normalizeAskOptions(options = []) {
  if (Array.isArray(options)) {
    const flat = options.flat ? options.flat() : [].concat(...options)
    return flat.map((opt, i) => {
      if (typeof opt === 'string') return { id: String(i + 1), text: opt, selected: false }
      const id = String(opt?.id ?? opt?.buttonId ?? i + 1).trim()
      const text = String(opt?.text ?? opt?.label ?? id).trim()
      return { id, text, selected: Boolean(opt?.selected) }
    })
  }
  return []
}

export function buildMultiSelectKeyboard(token, options = [], selectedIds = new Set(), page = 0, pageSize = DEFAULT_PAGE_SIZE, opts = {}) {
  const normalized = normalizeAskOptions(options)
  const total = normalized.length
  const limit = Math.max(1, pageSize)
  const maxPages = Math.ceil(total / limit) || 1
  const curPage = Math.max(0, Math.min(page, maxPages - 1))
  const start = curPage * limit
  const end = Math.min(start + limit, total)
  const slice = normalized.slice(start, end)

  const callbackKeys = []
  const rows = []

  for (const opt of slice) {
    const isChecked = selectedIds.has(opt.id)
    const icon = isChecked ? '☑️' : '⬜️'
    const text = `${icon} ${opt.text}`
    const callback_data = buildCallbackData(token, `t:${opt.id}`)
    callbackKeys.push(callback_data)
    rows.push([{ text, callback_data }])
  }

  // Pagination row if more than one page
  if (maxPages > 1) {
    const navRow = []
    if (curPage > 0) {
      const prevData = buildCallbackData(token, `p:${curPage - 1}`)
      callbackKeys.push(prevData)
      navRow.push({ text: '⬅️ Назад', callback_data: prevData })
    }
    const indicatorData = buildCallbackData(token, `p:${curPage}`)
    callbackKeys.push(indicatorData)
    navRow.push({ text: `${curPage + 1}/${maxPages}`, callback_data: indicatorData })
    if (curPage < maxPages - 1) {
      const nextData = buildCallbackData(token, `p:${curPage + 1}`)
      callbackKeys.push(nextData)
      navRow.push({ text: 'Вперед ➡️', callback_data: nextData })
    }
    rows.push(navRow)
  }

  // Action buttons (Done / Cancel)
  const doneText = opts.doneText || '✅ Готово'
  const cancelText = opts.cancelText || '❌ Отмена'
  const doneData = buildCallbackData(token, 'done')
  const cancelData = buildCallbackData(token, 'cancel')
  callbackKeys.push(doneData, cancelData)
  rows.push([
    { text: doneText, callback_data: doneData },
    { text: cancelText, callback_data: cancelData },
  ])

  return {
    replyMarkup: { inline_keyboard: rows },
    callbackKeys,
    page: curPage,
    maxPages,
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
  if (normalizeThreadId(target.threadId) !== normalizeThreadId(cb?.threadId)) return false
  return true
}

export function rejectPendingAsk(pending, err) {
  if (!pending) return
  clearTimeout(pending.timer)
  pending.reject(err)
}

export const REMOVE_KEYBOARD = { inline_keyboard: [] }
