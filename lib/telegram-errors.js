// Network error classification for Telegram sends (mirrors Hermes adapter policy).
//
// The key distinction: some network failures mean the request NEVER left the
// process (connect/pool timeout, ECONNRESET before send) → resending is safe.
// Others (a generic timeout after the request may have reached Telegram) could
// duplicate a message if we resend → do NOT retry.

function rootCause(err) {
  let e = err
  let depth = 0
  while (e && e.cause && e.cause !== e && depth < 10) {
    e = e.cause
    depth++
  }
  return e || err
}

// True when a resend cannot duplicate a message: the request did not reach Telegram.
export function isResendSafeNetworkError(err) {
  const c = rootCause(err)
  const msg = String(c?.message || err?.message || '').toLowerCase()
  if (/not sent to telegram|connect timeout|und_err_connect|econnreset|enotfound|econnrefused|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return true
  }
  // undici PoolTimeout message: "Request was *not* sent to Telegram."
  if (/pool timeout|request was \*?not\*? sent/i.test(msg)) return true
  return false
}

// True for a 409 from getUpdates: a second bot instance polls the same token.
export function isPollingConflict(err) {
  const msg = String(err?.message || '').toLowerCase()
  return /terminated by other getupdates request|another bot instance is running|getupdates.*conflict|conflict.*getupdates/i.test(msg)
}

// Build the adapter's API error with the structured Telegram response fields
// attached (#219): a 429 response carries `parameters.retry_after`, and callers
// must not have to recover it from the description string. The message format
// is unchanged (`telegram <method>: <description|status>`).
export function telegramApiError(method, description, status, parameters) {
  const err = /** @type {Error & { parameters?: Record<string, any>, statusCode?: number }} */ (
    new Error(`telegram ${method}: ${description || status}`)
  )
  if (parameters && typeof parameters === 'object') err.parameters = parameters
  err.statusCode = status
  return err
}

// Structured retry_after extraction: prefer the attached `parameters` object
// (set by telegramApiError), fall back to the description text (#219).
export function retryAfterSecondsOf(err) {
  if (!err) return null
  const direct = err.parameters?.retry_after
  if (Number.isFinite(direct) && direct > 0) return direct
  const match = String(err.message || '').match(/retry after (\d+)/i)
  if (match) {
    const val = parseInt(match[1], 10)
    if (!Number.isNaN(val) && val > 0) return val
  }
  return null
}

// True when Telegram throttled the request (HTTP 429). The request was
// rejected BEFORE processing, so honoring retry_after and resending cannot
// duplicate a message (#219). The direct send path previously failed fast and
// doubled requests during throttle windows.
export function isRateLimitError(err) {
  if (!err) return false
  const seconds = retryAfterSecondsOf(err)
  if (Number.isFinite(seconds) && seconds > 0) return true
  return String(err?.message || '').toLowerCase().includes('too many requests')
}

// True when the FORMATTED message was rejected at parse time: it was never
// delivered, so resending the plain-text variant cannot duplicate it (#219).
// Other failures (rate limits, network, chat errors) must propagate instead
// of triggering the plain fallback and doubling the request.
export function isParseModeError(err) {
  const msg = String(err?.message || '').toLowerCase()
  return msg.includes("can't parse entities") || msg.includes('message text is empty')
}

// True when the target chat/topic no longer exists (deleted/closed/upgraded).
// Such sends should not be retried and any pending ask binding must be pruned.
export function isTopicGoneError(err) {
  const msg = String(err?.message || '').toLowerCase()
  return /thread not found|message thread not found|topic[_ ]?(not found|closed|deleted)|chat (not found|was (upgraded|deleted))|group chat was (upgraded|deleted)/i.test(msg)
}

/**
 * Calculates exponential backoff with max cap for polling retries.
 * errorCount is 1-indexed.
 */
export function computePollBackoffMs(baseIntervalMs, errorCount, maxDelayMs = 30_000) {
  const count = Math.max(1, Math.min(10, Number(errorCount) || 1))
  const base = Math.max(100, Number(baseIntervalMs) || 500)
  return Math.min(maxDelayMs, base * Math.pow(2, count - 1))
}
