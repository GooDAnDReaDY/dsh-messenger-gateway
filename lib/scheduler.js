import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export function parseRelativeTime(input) {
  if (!input) return null
  const raw = String(input).trim().toLowerCase()
  const match = /^(\d+)\s*(s|sec|сек|m|min|мин|h|hr|ч|час|d|day|д|день|дня|дней)?$/i.exec(raw)
  if (!match) return null

  const val = parseInt(match[1], 10)
  if (!Number.isFinite(val) || val <= 0) return null

  const unit = (match[2] || 'm').toLowerCase()
  if (['s', 'sec', 'сек'].includes(unit)) return val * 1000
  if (['m', 'min', 'мин'].includes(unit)) return val * 60 * 1000
  if (['h', 'hr', 'ч', 'час'].includes(unit)) return val * 3600 * 1000
  if (['d', 'day', 'д', 'день', 'дня', 'дней'].includes(unit)) return val * 86400 * 1000

  return null
}

export function formatRemaining(ms) {
  if (ms <= 0) return 'сейчас'
  const sec = Math.ceil(ms / 1000)
  if (sec < 60) return `${sec} сек`
  const min = Math.ceil(sec / 60)
  if (min < 60) return `${min} мин`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin ? `${hr} ч ${remMin} мин` : `${hr} ч`
}

export function createScheduler(filePath, onDue) {
  let tasks = []
  let loaded = false
  let timer = null

  async function load() {
    try {
      const raw = await readFile(filePath, 'utf8')
      tasks = JSON.parse(raw)
    } catch {
      tasks = []
    }
    loaded = true
  }

  const RETENTION_MS = 7 * 86400 * 1000

  async function save() {
    try {
      const now = Date.now()
      tasks = tasks.filter((t) => {
        if (t.status === 'pending') return true
        const finishTime = t.firedAt || t.createdAt || 0
        return (now - finishTime) < RETENTION_MS
      })
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify(tasks, null, 2), 'utf8')
    } catch {}
  }

  async function checkDue() {
    if (!loaded) await load()
    const now = Date.now()
    const due = tasks.filter((t) => t.status === 'pending' && t.dueAt <= now)

    for (const task of due) {
      task.status = 'fired'
      task.firedAt = now
      if (typeof onDue === 'function') {
        try { await onDue(task) } catch {}
      }
    }

    if (due.length > 0) {
      await save()
    }
  }

  function start(intervalMs = 5000) {
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      checkDue().catch(() => {})
    }, intervalMs)
    timer.unref?.()
    checkDue().catch(() => {})
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
      dueAt: taskData.dueAt,
      createdAt: Date.now(),
      status: 'pending',
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
    cancel,
    checkDue,
    getTasks: () => tasks,
  }
}
