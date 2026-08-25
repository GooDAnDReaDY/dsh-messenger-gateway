import { normalizeThreadId } from './topics.js'

const DEFAULT_ASK_TIMEOUT_MS = 300_000

export const messengerApiSchema = {
  version: 1,
  service: 'messenger',
  http: {
    send: {
      method: 'POST',
      path: '/dsh-messenger-gateway/messenger/send',
      body: {
        target: { platform: 'telegram', chatId: 'number|string', threadId: 'optional number' },
        text: 'optional string',
        files: 'optional [{ dataBase64, mime, kind, name }]',
        replyMarkup: 'optional Telegram inline_keyboard object',
      },
    },
    ask: {
      method: 'POST',
      path: '/dsh-messenger-gateway/messenger/ask',
      body: {
        target: { platform: 'telegram', chatId: 'number|string' },
        text: 'string (required)',
        buttons: '[[{ id, text }]] (required, at least one button)',
        timeoutMs: 'optional number (default 300000)',
      },
    },
    progress: {
      method: 'POST',
      path: '/dsh-messenger-gateway/messenger/progress',
      body: {
        target: { platform: 'telegram', chatId: 'number|string' },
        text: 'string (required)',
      },
    },
  },
}

export function parseMessengerBody(raw) {
  try {
    return JSON.parse(String(raw || '{}') || '{}')
  } catch {
    const err = new Error('invalid json')
    err.status = 400
    throw err
  }
}

export function validateTarget(target) {
  if (!target || typeof target !== 'object') {
    const err = new Error('target is required')
    err.status = 400
    throw err
  }
  const platform = String(target.platform || '').trim()
  if (!platform) {
    const err = new Error('target.platform is required')
    err.status = 400
    throw err
  }
  const chatId = target.chatId
  const out = { platform }
  if (chatId !== undefined && chatId !== null && String(chatId).trim() !== '') {
    out.chatId = chatId
  }
  const threadId = normalizeThreadId(target.threadId)
  if (threadId > 0) out.threadId = threadId
  return out
}

export function normalizeButtons(buttons) {
  if (buttons === undefined || buttons === null) return []
  if (!Array.isArray(buttons)) {
    const err = new Error('buttons must be a 2d array')
    err.status = 400
    throw err
  }
  return buttons.map((row, ri) => {
    if (!Array.isArray(row)) {
      const err = new Error(`buttons[${ri}] must be an array`)
      err.status = 400
      throw err
    }
    return row.map((btn, bi) => {
      const id = String(btn?.id ?? btn?.buttonId ?? '').trim()
      const text = String(btn?.text ?? '').trim()
      if (!id || !text) {
        const err = new Error(`buttons[${ri}][${bi}] requires id and text`)
        err.status = 400
        throw err
      }
      return { id, text }
    })
  })
}

export function normalizeFiles(files) {
  if (!files) return []
  if (!Array.isArray(files)) {
    const err = new Error('files must be an array')
    err.status = 400
    throw err
  }
  return files.map((file, i) => {
    if (!file || typeof file !== 'object') {
      const err = new Error(`files[${i}] must be an object`)
      err.status = 400
      throw err
    }
    if (file.bytes) return file
    if (typeof file.dataBase64 === 'string') {
      return {
        bytes: Buffer.from(file.dataBase64, 'base64'),
        mime: file.mime || 'application/octet-stream',
        kind: file.kind || 'document',
        name: file.name || 'file',
      }
    }
    const err = new Error(`files[${i}] needs bytes or dataBase64`)
    err.status = 400
    throw err
  })
}

export function normalizeSendBody(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const files = normalizeFiles(payload?.files)
  if (!text && !files.length) {
    const err = new Error('text or files required')
    err.status = 400
    throw err
  }
  const body = {}
  if (text) body.text = text
  if (files.length) body.files = files
  if (payload?.replyMarkup) body.replyMarkup = payload.replyMarkup
  return body
}

export function normalizeAskBody(payload) {
  const text = String(payload?.text || '').trim()
  if (!text) {
    const err = new Error('text is required for ask')
    err.status = 400
    throw err
  }
  const buttons = normalizeButtons(payload?.buttons)
  if (!buttons.length || !buttons.some((row) => row.length > 0)) {
    const err = new Error('ask requires at least one button')
    err.status = 400
    throw err
  }
  return { text, buttons }
}

export function normalizeProgressBody(payload) {
  const text = String(payload?.text || '').trim()
  if (!text) {
    const err = new Error('text is required for progress')
    err.status = 400
    throw err
  }
  return { text }
}

export function resolveAskTimeoutMs(timeoutMs) {
  const n = Number(timeoutMs)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ASK_TIMEOUT_MS
  return Math.min(n, 3_600_000)
}

export function httpStatusForError(err) {
  if (err?.status) return err.status
  const msg = String(err?.message || '')
  if (msg.includes('timed out')) return 504
  if (msg.includes('not running') || msg.includes('unavailable')) return 503
  return 502
}

export async function dispatchMessenger(gw, action, payload) {
  if (!gw) {
    const err = new Error('gateway not running')
    err.status = 503
    throw err
  }
  const target = validateTarget(payload?.target)
  if (action === 'send') {
    await gw.messenger.send(target, normalizeSendBody(payload))
    return { ok: true }
  }
  if (action === 'progress') {
    await gw.messenger.progress(target, normalizeProgressBody(payload))
    return { ok: true }
  }
  if (action === 'ask') {
    const result = await gw.messenger.ask(target, normalizeAskBody(payload), resolveAskTimeoutMs(payload?.timeoutMs))
    return { ok: true, result }
  }
  const err = new Error(`unknown messenger action: ${action}`)
  err.status = 400
  throw err
}

export function createMessengerService(getGw) {
  return {
    adapters: () => getGw()?.messenger.adapters() ?? [],
    activeChats: () => getGw()?.messenger.activeChats() ?? 0,
    send: async (target, payload) => {
      const gw = getGw()
      await dispatchMessenger(gw, 'send', { target, ...payload })
    },
    progress: async (target, payload) => {
      const gw = getGw()
      await dispatchMessenger(gw, 'progress', { target, ...payload })
    },
    ask: async (target, payload, timeoutMs) => {
      const gw = getGw()
      const out = await dispatchMessenger(gw, 'ask', { target, ...payload, timeoutMs })
      return out.result
    },
  }
}
