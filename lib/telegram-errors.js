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

// True when the target chat/topic no longer exists (deleted/closed/upgraded).
// Such sends should not be retried and any pending ask binding must be pruned.
export function isTopicGoneError(err) {
  const msg = String(err?.message || '').toLowerCase()
  return /thread not found|message thread not found|topic[_ ]?(not found|closed|deleted)|chat (not found|was (upgraded|deleted))|group chat was (upgraded|deleted)/i.test(msg)
}
