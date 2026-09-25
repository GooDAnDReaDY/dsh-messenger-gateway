import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { writeJsonAtomic } from './storage-atomic.js'

export function parseRelativeTime(input) {
  if (!input) return null
  const raw = String(input).trim().toLowerCase()
  const match = /^(\d+)\s*(s|sec|m|min|h|hr|d|day|秒|分|小时|天)?$/i.exec(raw)
  if (!match) return null

  const val = parseInt(match[1], 10)
  if (!Number.isFinite(val) || val <= 0) return null

  const unit = (match[2] || 'm').toLowerCase()
  if (['s', 'sec', '秒'].includes(unit)) return val * 1000
  if (['m', 'min', '分'].includes(unit)) return val * 60 * 1000
  if (['h', 'hr', '小时'].includes(unit)) return val * 3600 * 1000
  if (['d', 'day', '天'].includes(unit)) return val * 86400 * 1000

  return null
}

export function formatRemaining(ms, locale = 'en') {
  const isZh = String(locale || '').toLowerCase().startsWith('zh')
  if (ms <= 0) return isZh ? '刚刚' : 'now'
  const sec = Math.ceil(ms / 1000)
  if (sec < 60) return isZh ? `${sec}秒` : `${sec}s`
  const min = Math.ceil(sec / 60)
  if (min < 60) return isZh ? `${min}分` : `${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  if (isZh) return remMin ? `${hr}小时 ${remMin}分` : `${hr}小时`
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`
}

export function createScheduler(filePath, onDue, options = {}) {
  const logger = options?.logger || console
  let tasks = []
  let loaded = false
  let timer = null

  async function load() {
    try {
      const raw = await readFile(filePath, 'utf8')
      tasks = JSON.parse(raw)
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        logger?.debug?.('[dsh-messenger-gateway] scheduler load error:', err?.message || err)
      }
      tasks = []
    }
    loaded = true
  }

  const RETENTION_MS = 7 * 86400 * 1000

  async function save() {
    if (!filePath) return
    try {
      const now = Date.now()
      tasks = tasks.filter((t) => {
        if (t.status === 'pending') return true
        const finishTime = t.firedAt || t.createdAt || 0
        return (now - finishTime) < RETENTION_MS
      })
      await writeJsonAtomic(filePath, tasks)
    } catch (err) {
      logger?.warn?.('[dsh-messenger-gateway] scheduler save failed:', err?.message || err)
    }
  }

  async function checkDue() {
    if (!loaded) await load()
    const now = Date.now()
    const due = tasks.filter((t) => t.status === 'pending' && t.dueAt <= now)

    for (const task of due) {
      if (task.recurring && Number(task.intervalMs) > 0) {
        task.dueAt = now + Number(task.intervalMs)
        task.lastFiredAt = now
      } else {
        task.status = 'fired'
        task.firedAt = now
      }
      if (typeof onDue === 'function') {
        try {
          await onDue(task)
        } catch (err) {
          logger?.warn?.('[dsh-messenger-gateway] scheduler task execution failed:', err?.message || err)
        }
      }
    }

    if (due.length > 0) {
      await save()
    }
  }

  function start(intervalMs = 5000) {
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      checkDue().catch((err) => { logger?.debug?.('[dsh-messenger-gateway] scheduler checkDue error:', err?.message || err) })
    }, intervalMs)
    timer.unref?.()
    checkDue().catch((err) => { logger?.debug?.('[dsh-messenger-gateway] scheduler checkDue error:', err?.message || err) })
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function schedule(taskData) {
    if (!loaded) await load()
    const id = taskData.id || randomUUID().slice(0, 8)
    const task = {
      id,
      platform: taskData.platform || 'telegram',
      chatId: taskData.chatId,
      threadId: taskData.threadId || 0,
      userId: taskData.userId,
      text: taskData.text,
      prompt: taskData.prompt || taskData.text || '',
      dueAt: taskData.dueAt,
      createdAt: Date.now(),
      status: 'pending',
      recurring: Boolean(taskData.recurring),
      intervalMs: taskData.intervalMs || 0,
      cronExpr: taskData.cronExpr || '',
    }
    tasks.push(task)
    await save()
    return task
  }

  async function list(chatId) {
    if (!loaded) await load()
    const now = Date.now()
    return tasks.filter((t) => (chatId ? t.chatId === chatId : true) && t.status === 'pending' && t.dueAt > now)
  }

  async function listRecurring(chatId) {
    if (!loaded) await load()
    return tasks.filter((t) => (chatId ? t.chatId === chatId : true) && t.status === 'pending' && t.recurring)
  }

  async function cancel(id, chatId) {
    if (!loaded) await load()
    const task = tasks.find((t) => t.id === id && (chatId ? t.chatId === chatId : true) && t.status === 'pending')
    if (!task) return false
    task.status = 'cancelled'
    await save()
    return true
  }

  return {
    load,
    save,
    start,
    stop,
    schedule,
    list,
    listRecurring,
    cancel,
    checkDue,
    getTasks: () => tasks,
  }
}