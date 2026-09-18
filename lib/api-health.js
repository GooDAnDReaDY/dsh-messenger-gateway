export class ApiHealthTracker {
  constructor(options = {}) {
    this.logger = options.logger || console
    this.degradedThreshold = Number(options.degradedThreshold) || 3
    this.warnThreshold = Number(options.warnThreshold) || 5
    this.consecutiveFailures = 0
    this.lastError = null
  }

  recordFailure(op, err) {
    this.consecutiveFailures++
    this.lastError = {
      op,
      message: err?.message || String(err),
      time: Date.now(),
    }
    this.logger?.debug?.(`dsh-messenger-gateway: Telegram API ${op} failed (${this.consecutiveFailures} consecutive):`, err?.message || err)
    if (this.consecutiveFailures >= this.warnThreshold && this.consecutiveFailures % this.warnThreshold === 0) {
      this.logger?.warn?.(`dsh-messenger-gateway: Telegram API experiencing repeated failures (${this.consecutiveFailures} in a row). Last op: ${op}, error: ${err?.message || err}`)
    }
  }

  recordSuccess() {
    this.consecutiveFailures = 0
  }

  isDegraded() {
    return this.consecutiveFailures >= this.degradedThreshold
  }

  getSnapshot() {
    return {
      degraded: this.isDegraded(),
      consecutiveFailures: this.consecutiveFailures,
      lastError: this.lastError,
    }
  }
}
