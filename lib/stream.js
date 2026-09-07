/** Helpers for Telegram streaming edits + progress. */

export function extractTextDelta(chunk) {
  if (!chunk || typeof chunk !== 'object') return ''
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') return chunk.text
  return ''
}

export function extractToolName(eventData) {
  const name = eventData?.tool?.name || eventData?.toolName || eventData?.name
  return name ? String(name) : ''
}

export function formatProgressLine(toolName) {
  if (!toolName) return '⏳ Думаю…'
  return `🔧 ${toolName}…`
}

export function buildStreamPreview(streamText, toolName, maxLen = 3500) {
  const body = String(streamText || '').trimEnd()
  const head = toolName ? `${formatProgressLine(toolName)}\n\n` : ''
  const combined = head + (body || '…')
  if (combined.length <= maxLen) return combined
  return combined.slice(0, maxLen - 1) + '…'
}

export function parseRetryAfter(err) {
  if (!err) return 0
  const msg = err.message || String(err)
  const match = /retry after (\d+)/i.exec(msg)
  if (match) return parseInt(match[1], 10) * 1000
  return 0
}

export function createEditScheduler(editFn, intervalMs = 1200) {
  let pending = null
  let timer = null
  let lastSent = ''
  let inFlight = Promise.resolve()
  let retryDelayMs = 0

  const flush = () => {
    timer = null
    if (pending === null || pending === lastSent) return
    const text = pending
    inFlight = inFlight.then(async () => {
      try {
        if (retryDelayMs > 0) {
          const delay = retryDelayMs
          retryDelayMs = 0
          await new Promise((r) => setTimeout(r, delay))
        }
        await editFn(text)
        lastSent = text
      } catch (err) {
        const retry = parseRetryAfter(err)
        if (retry > 0) {
          retryDelayMs = retry
          // Re-schedule flush with retry delay
          if (!timer) {
            timer = setTimeout(flush, retry + 100)
            timer.unref?.()
          }
        }
      }
    })
  }

  return {
    push(text) {
      pending = text
      if (timer) return
      timer = setTimeout(flush, Math.max(200, intervalMs))
      timer.unref?.()
    },
    async flush() {
      if (timer) { clearTimeout(timer); timer = null }
      flush()
      await inFlight
      // If there's still a pending difference (e.g. rate limit delay happened), wait and retry
      if (pending !== null && pending !== lastSent) {
        if (retryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, retryDelayMs + 50))
          retryDelayMs = 0
        }
        try {
          await editFn(pending)
          lastSent = pending
        } catch {}
      }
    },
  }
}

export function startTypingHeartbeat(typingFn, intervalMs = 4000) {
  if (typeof typingFn !== 'function') return () => {}
  typingFn().catch?.(() => {})
  const timer = setInterval(() => { typingFn().catch?.(() => {}) }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}