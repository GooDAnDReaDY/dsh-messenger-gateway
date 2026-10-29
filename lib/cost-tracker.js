/**
 * Token usage and cost tracker in messenger sessions (dsh-cost-meter bridge, #156).
 *
 * Provides:
 * - Accurate token extraction from turn events and DSH session projections.
 * - Model cost estimation using standard rate cards and dsh-cost-meter tariffs.
 * - Compact response footer (e.g. ⏱️ 2.4s · 1.8k tokens (~$0.004) · deepseek-chat).
 * - Detailed `/cost` command with session breakdown and daily budget tracking.
 * - Budget threshold alerts when nearing session limits.
 */

import { escapeHtml } from './telegram-format.js'

export const DEFAULT_MODEL_RATES = {
  'deepseek-chat': { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 },
  'deepseek-v3': { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: 0.44 },
  'deepseek-reasoner': { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 1.32 },
  'deepseek-r1': { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 1.32 },
  'gpt-4o': { input: 2.50, output: 10.00, cacheRead: 1.25, cacheWrite: 2.50 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cacheRead: 0.075, cacheWrite: 0.15 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'fallback': { input: 0.50, output: 1.50, cacheRead: 0.05, cacheWrite: 0.50 },
}

export function resolveModelRates(modelId) {
  if (!modelId || typeof modelId !== 'string') return DEFAULT_MODEL_RATES.fallback
  const clean = modelId.toLowerCase().split('/').pop()
  for (const [key, rates] of Object.entries(DEFAULT_MODEL_RATES)) {
    if (clean.includes(key)) return rates
  }
  return DEFAULT_MODEL_RATES.fallback
}

export function normalizeUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    }
  }

  const inputTokens = Number(rawUsage.inputTokens || rawUsage.prompt_tokens || rawUsage.promptTokens || rawUsage.input || 0)
  const outputTokens = Number(rawUsage.outputTokens || rawUsage.completion_tokens || rawUsage.completionTokens || rawUsage.output || 0)
  const cacheReadTokens = Number(rawUsage.cacheReadTokens || rawUsage.cache_read_tokens || rawUsage.cached_tokens || 0)
  const cacheWriteTokens = Number(rawUsage.cacheWriteTokens || rawUsage.cache_creation_input_tokens || 0)
  const totalTokens = Number(rawUsage.totalTokens || rawUsage.total_tokens || (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens))

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
  }
}

export function calculateEstimatedCostUsd(usage, modelId) {
  const norm = normalizeUsage(usage)
  const rates = resolveModelRates(modelId)

  const inputCost = (norm.inputTokens * rates.input) / 1_000_000
  const outputCost = (norm.outputTokens * rates.output) / 1_000_000
  const cacheReadCost = (norm.cacheReadTokens * rates.cacheRead) / 1_000_000
  const cacheWriteCost = (norm.cacheWriteTokens * rates.cacheWrite) / 1_000_000

  return inputCost + outputCost + cacheReadCost + cacheWriteCost
}

export function formatTokenCount(n) {
  const count = Number(n) || 0
  if (count < 1000) return String(count)
  const k = count / 1000
  return (k >= 10 ? k.toFixed(0) : k.toFixed(1)) + 'k'
}

export function formatDurationSeconds(ms) {
  const sec = Math.max(0.1, (Number(ms) || 0) / 1000)
  return sec >= 10 ? `${sec.toFixed(0)}s` : `${sec.toFixed(1)}s`
}

export function formatCostUsd(usd) {
  const val = Number(usd) || 0
  if (val <= 0) return '$0.00'
  if (val < 0.001) return '<$0.001'
  return `~$${val.toFixed(4)}`
}

export function formatCostFooter({ durationMs, usage, model }) {
  const norm = normalizeUsage(usage)
  if (!norm.totalTokens && !durationMs) return ''

  const durStr = formatDurationSeconds(durationMs)
  const tokenStr = formatTokenCount(norm.totalTokens)
  const cost = calculateEstimatedCostUsd(norm, model)
  const costStr = formatCostUsd(cost)
  const modelName = (model || 'model').split('/').pop()

  return `\n\n<i>⏱️ ${durStr} · ${tokenStr} tokens (${costStr}) · ${escapeHtml(modelName)}</i>`
}

export function extractSessionStats(chat) {
  let promptTokens = 0
  let completionTokens = 0
  let cachedTokens = 0
  let totalTokens = 0
  let turnsCount = 0

  // 1. Try DSH session projections if available
  const session = chat?.agent?.session
  let projection = null
  try {
    if (typeof session?.projection === 'function') {
      projection = session.projection('costByModel')
    }
  } catch {
    /* projection not registered or session closed */
  }

  if (projection?.models && Array.isArray(projection.models)) {
    for (const m of projection.models) {
      if (m.slots && typeof m.slots === 'object') {
        for (const slot of Object.values(m.slots)) {
          promptTokens += Number(slot.uncachedInputTokens || 0)
          completionTokens += Number(slot.outputTokens || 0)
          cachedTokens += Number(slot.cacheReadTokens || 0)
        }
      }
    }
    if (Array.isArray(projection.turns)) {
      turnsCount = projection.turns.length
    }
  }

  // 2. Accumulate chat turn metrics if projection empty
  if (!promptTokens && !completionTokens && chat?.turnStats) {
    promptTokens = chat.turnStats.inputTokens || 0
    completionTokens = chat.turnStats.outputTokens || 0
    cachedTokens = chat.turnStats.cacheReadTokens || 0
    turnsCount = chat.turnStats.turnsCount || 0
  }

  // 3. Fallback to last turn usage if available
  if (!promptTokens && !completionTokens && chat?.lastTurnUsage) {
    const lastNorm = normalizeUsage(chat.lastTurnUsage)
    promptTokens = lastNorm.inputTokens
    completionTokens = lastNorm.outputTokens
    cachedTokens = lastNorm.cacheReadTokens
    turnsCount = 1
  }

  totalTokens = promptTokens + completionTokens + cachedTokens

  return {
    promptTokens,
    completionTokens,
    cachedTokens,
    totalTokens,
    turnsCount,
  }
}

export function formatSessionCostReport({ chat, config, model }) {
  const stats = extractSessionStats(chat)
  const activeModel = model || config?.agent?.model || 'deepseek-chat'
  const costUsd = calculateEstimatedCostUsd({
    inputTokens: stats.promptTokens,
    outputTokens: stats.completionTokens,
    cacheReadTokens: stats.cachedTokens,
  }, activeModel)

  const budgetThreshold = Number(config?.telegram?.budgetAlertThresholdUsd || 0)

  const lines = [
    '📊 <b>Session Token & Cost Meter:</b>',
    `• Active Model: <code>${escapeHtml(activeModel)}</code>`,
    `• Total Tokens: <b>${formatTokenCount(stats.totalTokens)}</b> (${stats.totalTokens.toLocaleString()})`,
    `  ├─ Prompt (input): ${formatTokenCount(stats.promptTokens)}`,
    `  ├─ Completion (output): ${formatTokenCount(stats.completionTokens)}`,
    `  └─ Cached read: ${formatTokenCount(stats.cachedTokens)}`,
    `• Completed Turns: <b>${stats.turnsCount}</b>`,
    `• Estimated Cost: <b>${formatCostUsd(costUsd)}</b> USD`,
  ]

  if (budgetThreshold > 0) {
    const remaining = Math.max(0, budgetThreshold - costUsd)
    const pct = Math.min(100, (costUsd / budgetThreshold) * 100).toFixed(1)
    lines.push(
      '',
      '🎯 <b>Budget Tracking:</b>',
      `• Budget Threshold: <b>$${budgetThreshold.toFixed(2)}</b>`,
      `• Consumed: <b>${pct}%</b>`,
      `• Remaining: <b>$${remaining.toFixed(4)}</b>`,
    )
    if (costUsd >= budgetThreshold) {
      lines.push('⚠️ <b>Budget threshold reached!</b> Consider using `/new` to reset context.')
    }
  }

  lines.push('', '<i>Run <code>/cost</code> anytime to check current session spend.</i>')
  return lines.join('\n')
}

export function checkBudgetThreshold({ currentSpendUsd, thresholdUsd }) {
  const threshold = Number(thresholdUsd) || 0
  if (threshold <= 0) return null
  const spend = Number(currentSpendUsd) || 0

  if (spend >= threshold) {
    return {
      alert: true,
      level: 'limit',
      message: `Session cost ($${spend.toFixed(4)}) has exceeded the configured budget ($${threshold.toFixed(2)}).`,
    }
  }

  if (spend >= threshold * 0.8) {
    return {
      alert: true,
      level: 'warning',
      message: `Session cost ($${spend.toFixed(4)}) has reached 80% of budget limit ($${threshold.toFixed(2)}).`,
    }
  }

  return null
}
