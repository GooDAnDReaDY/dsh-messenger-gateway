import { escapeHtml } from './telegram-format.js'

/** Helpers for Telegram streaming edits + progress. */

export function extractTextDelta(chunk) {
  if (typeof chunk === 'string') return chunk
  if (!chunk || typeof chunk !== 'object') return ''
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') return chunk.text
  if (chunk.type === 'text' && typeof chunk.text === 'string') return chunk.text
  if (!chunk.type && typeof chunk.text === 'string') return chunk.text
  if (!chunk.type && typeof chunk.delta === 'string') return chunk.delta
  return ''
}

export function extractToolName(eventData) {
  if (typeof eventData === 'string') return eventData
  const name = eventData?.tool?.name || eventData?.toolName || eventData?.name || eventData?.tool
  return name ? String(name) : ''
}

export function formatProgressLine(toolName, locale = 'en') {
  if (!toolName) {
    return String(locale || '').toLowerCase().startsWith('zh') ? '⏳ 思考中…' : '⏳ Thinking…'
  }
  return `🔧 ${toolName}…`
}

export function extractReasoningDelta(chunk) {
  if (!chunk || typeof chunk !== 'object') return ''
  if ((chunk.type === 'reasoning-delta' || chunk.type === 'thought-delta') && typeof chunk.text === 'string') return chunk.text
  if (chunk.type === 'reasoning' && typeof chunk.text === 'string') return chunk.text
  if (typeof chunk.reasoning_content === 'string') return chunk.reasoning_content
  if (typeof chunk.reasoning === 'string') return chunk.reasoning
  if (typeof chunk.thought === 'string') return chunk.thought
  return ''
}

export function parseReasoningStream(streamText = '', deltaReasoning = '') {
  const raw = String(streamText || '')
  let thought = String(deltaReasoning || '')
  let content = raw
  let isThinking = false
  let isComplete = false

  const completeTagRegex = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>|\[THOUGHT\]([\s\S]*?)\[\/THOUGHT\]|\|begin_of_thought\|([\s\S]*?)\|end_of_thought\|/gi

  let match
  const thoughtsFromTags = []
  while ((match = completeTagRegex.exec(raw)) !== null) {
    const t = match[1] ?? match[2] ?? match[3] ?? ''
    thoughtsFromTags.push(t)
  }

  if (thoughtsFromTags.length > 0) {
    content = raw.replace(completeTagRegex, '')
    thought = (thought ? thought + '\n' : '') + thoughtsFromTags.join('\n')
  }

  const openTagRegex = /<(?:think|thought)>([\s\S]*)$|\[THOUGHT\]([\s\S]*)$|\|begin_of_thought\|([\s\S]*)$/i
  const openMatch = content.match(openTagRegex)
  if (openMatch) {
    const unclosedThought = openMatch[1] ?? openMatch[2] ?? openMatch[3] ?? ''
    thought = (thought ? thought + '\n' : '') + unclosedThought
    content = content.replace(openTagRegex, '')
    isThinking = true
    isComplete = false
  } else if (deltaReasoning && !content.trim()) {
    isThinking = true
    isComplete = false
  } else {
    isComplete = Boolean(thought.trim()) && Boolean(content.trim())
  }

  return {
    thought: thought.trim(),
    content: content.trim(),
    isThinking,
    isComplete: !isThinking && isComplete,
    hasThought: Boolean(thought.trim()),
  }
}

export function buildStreamPreview(streamText, toolName, maxLen = 3500, options = {}) {
  const parsed = parseReasoningStream(streamText, options?.reasoningText)
  const showReasoning = options?.showReasoning !== false
  const thoughtCollapse = options?.thoughtCollapse !== false
  const locale = options?.locale || 'en'
  const elapsedSec = options?.startTime ? Math.max(1, Math.round((Date.now() - options.startTime) / 1000)) : 0
  const timeStr = elapsedSec > 0 ? ` (${elapsedSec}s)` : ''

  const toolHead = toolName ? `${formatProgressLine(toolName, locale)}\n\n` : ''

  if (parsed.isThinking) {
    if (!showReasoning || !parsed.thought) {
      const thinkingHeader = toolName
        ? formatProgressLine(toolName, locale)
        : (String(locale).toLowerCase().startsWith('zh') ? `⏳ 思考中…${timeStr}` : `⏳ Thinking…${timeStr}`)
      const combined = `${thinkingHeader}\n\n${parsed.content || '…'}`.trim()
      return combined.length <= maxLen ? combined : combined.slice(0, maxLen - 1) + '…'
    }
    const header = toolName
      ? `🔧 <b>${escapeHtml(toolName)}…</b>`
      : (String(locale).toLowerCase().startsWith('zh') ? `🧠 <b>思考中…</b><i>${timeStr}</i>` : `🧠 <b>Thinking…</b><i>${timeStr}</i>`)
    const available = Math.max(200, maxLen - header.length - 100)
    let thoughtText = parsed.thought
    if (thoughtText.length > available) {
      thoughtText = '…' + thoughtText.slice(-(available - 1))
    }
    const quote = `<blockquote>${escapeHtml(thoughtText)}</blockquote>`
    const body = parsed.content ? `\n\n${escapeHtml(parsed.content)}` : ''
    const combined = `${header}\n${quote}${body}`
    return combined.length <= maxLen ? combined : combined.slice(0, maxLen - 1) + '…'
  }

  if (parsed.hasThought) {
    if (showReasoning) {
      const quoteTag = thoughtCollapse ? '<blockquote expandable>' : '<blockquote>'
      const thoughtHeader = String(locale).toLowerCase().startsWith('zh') ? `🧠 <i>思考过程${timeStr}:</i>` : `🧠 <i>Thought process${timeStr}:</i>`
      const contentText = parsed.content || '…'
      const contentBudget = Math.min(2500, maxLen - 300)
      const thoughtBudget = Math.max(200, maxLen - contentBudget - 150)
      let thoughtText = parsed.thought
      if (thoughtText.length > thoughtBudget) {
        thoughtText = thoughtText.slice(0, thoughtBudget - 1) + '…'
      }
      const quote = `${quoteTag}${thoughtHeader}\n${escapeHtml(thoughtText)}</blockquote>`
      const combined = `${toolHead}${quote}\n\n${escapeHtml(contentText)}`.trim()
      return combined.length <= maxLen ? combined : combined.slice(0, maxLen - 1) + '…'
    } else {
      const contentText = parsed.content || '…'
      const combined = `${toolHead}${escapeHtml(contentText)}`.trim()
      return combined.length <= maxLen ? combined : combined.slice(0, maxLen - 1) + '…'
    }
  }

  const body = String(streamText || '').trimEnd()
  const combined = toolHead + (body || '…')
  if (combined.length <= maxLen) return combined
  return combined.slice(0, maxLen - 1) + '…'
}

export function formatReasoningFinal(rawText, deltaReasoning, options = {}) {
  const showReasoning = options?.showReasoning !== false
  const thoughtCollapse = options?.thoughtCollapse !== false
  const locale = options?.locale || 'en'
  const parsed = parseReasoningStream(rawText, deltaReasoning)

  if (!parsed.hasThought || !showReasoning) {
    return parsed.content || String(rawText || '')
  }

  const quoteTag = thoughtCollapse ? '<blockquote expandable>' : '<blockquote>'
  const thoughtHeader = String(locale).toLowerCase().startsWith('zh') ? '🧠 <i>思考过程:</i>' : '🧠 <i>Thought process:</i>'
  const thoughtBlock = `${quoteTag}${thoughtHeader}\n${escapeHtml(parsed.thought)}</blockquote>\n\n`
  return `${thoughtBlock}${parsed.content}`
}

export function parseRetryAfter(err) {
  if (!err) return 0
  const msg = err.message || String(err)
  const match = /retry after (\d+)/i.exec(msg)
  if (match) return parseInt(match[1], 10) * 1000
  return 0
}

export function createEditScheduler(editFn, intervalMs = 1200, firstChunkDelayMs = 250, logger = null) {
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
        logger?.debug?.('stream chunk edit failed:', err?.message || err)
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
      // Fast first chunk: when lastSent is empty, dispatch quickly so user sees immediate response.
      // Subsequent edits throttle to intervalMs to respect Telegram rate limits.
      const delay = !lastSent ? Math.min(firstChunkDelayMs, intervalMs) : Math.max(200, intervalMs)
      timer = setTimeout(flush, delay)
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
        } catch (err) {
          logger?.debug?.('stream final flush error:', err?.message || err)
        }
      }
    },
  }
}

export function startTypingHeartbeat(typingFn, intervalMs = 4000, logger = null) {
  if (typeof typingFn !== 'function') return () => {}
  let active = true
  const safeInvoke = () => {
    if (!active) return
    try {
      typingFn()?.catch?.((err) => { logger?.debug?.('typing indicator error:', err?.message || err) })
    } catch (err) { logger?.debug?.('typing indicator invoke error:', err?.message || err) }
  }
  safeInvoke()
  const timer = setInterval(safeInvoke, intervalMs)
  timer.unref?.()
  return () => {
    active = false
    clearInterval(timer)
  }
}
