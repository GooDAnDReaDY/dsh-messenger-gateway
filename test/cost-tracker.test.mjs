import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveModelRates,
  normalizeUsage,
  calculateEstimatedCostUsd,
  formatTokenCount,
  formatDurationSeconds,
  formatCostFooter,
  extractSessionStats,
  formatSessionCostReport,
  checkBudgetThreshold,
} from '../lib/cost-tracker.js'
import { handleGatewayCommand } from '../lib/gateway-commands.js'

test('resolveModelRates resolves rates for known and custom models', () => {
  const dsChat = resolveModelRates('deepseek/deepseek-chat')
  assert.equal(dsChat.input, 0.44)
  assert.equal(dsChat.output, 1.32)

  const dsR1 = resolveModelRates('deepseek-reasoner')
  assert.equal(dsR1.input, 1.32)
  assert.equal(dsR1.output, 3.96)

  const gpt = resolveModelRates('openai/gpt-4o')
  assert.equal(gpt.input, 2.50)
  assert.equal(gpt.output, 10.00)

  const fallback = resolveModelRates('custom-unknown-model')
  assert.equal(fallback.input, 0.50)
  assert.equal(fallback.output, 1.50)
})

test('normalizeUsage handles various provider usage schemas', () => {
  // Schema 1: Standard inputTokens / outputTokens
  const u1 = normalizeUsage({ inputTokens: 1200, outputTokens: 350, cacheReadTokens: 500 })
  assert.equal(u1.inputTokens, 1200)
  assert.equal(u1.outputTokens, 350)
  assert.equal(u1.cacheReadTokens, 500)
  assert.equal(u1.totalTokens, 2050)

  // Schema 2: OpenAI style prompt_tokens / completion_tokens
  const u2 = normalizeUsage({ prompt_tokens: 800, completion_tokens: 200, cached_tokens: 300 })
  assert.equal(u2.inputTokens, 800)
  assert.equal(u2.outputTokens, 200)
  assert.equal(u2.cacheReadTokens, 300)

  // Empty or invalid
  const u3 = normalizeUsage(null)
  assert.equal(u3.totalTokens, 0)
})

test('calculateEstimatedCostUsd calculates USD cost accurately', () => {
  // 1M input tokens for deepseek-chat ($0.44) + 1M output tokens ($1.32)
  const cost = calculateEstimatedCostUsd({
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }, 'deepseek-chat')
  assert.equal(Math.round(cost * 100) / 100, 1.76)

  // Small turn cost: 1,000 input + 500 output -> ~0.00044 + 0.00066 = ~$0.0011
  const turnCost = calculateEstimatedCostUsd({
    inputTokens: 1000,
    outputTokens: 500,
  }, 'deepseek-chat')
  assert.ok(turnCost > 0.0010 && turnCost < 0.0012)
})

test('formatTokenCount and formatDurationSeconds format cleanly', () => {
  assert.equal(formatTokenCount(450), '450')
  assert.equal(formatTokenCount(1800), '1.8k')
  assert.equal(formatTokenCount(15400), '15k')

  assert.equal(formatDurationSeconds(2400), '2.4s')
  assert.equal(formatDurationSeconds(12500), '13s')
})

test('formatCostFooter produces compact metadata string', () => {
  const footer = formatCostFooter({
    durationMs: 2400,
    usage: { inputTokens: 1200, outputTokens: 600 },
    model: 'deepseek/deepseek-chat',
  })

  assert.ok(footer.includes('⏱️ 2.4s'))
  assert.ok(footer.includes('1.8k tokens'))
  assert.ok(footer.includes('deepseek-chat'))
})

test('extractSessionStats reads from session projections or chat turnStats', () => {
  // Case A: Projection exists
  const mockChatProj = {
    agent: {
      session: {
        projection: () => ({
          models: [{
            provider: 'deepseek',
            model: 'deepseek-chat',
            slots: { '0': { uncachedInputTokens: 3000, outputTokens: 1000, cacheReadTokens: 500 } },
          }],
          turns: [{}, {}],
        }),
      },
    },
  }
  const statsA = extractSessionStats(mockChatProj)
  assert.equal(statsA.promptTokens, 3000)
  assert.equal(statsA.completionTokens, 1000)
  assert.equal(statsA.cachedTokens, 500)
  assert.equal(statsA.totalTokens, 4500)
  assert.equal(statsA.turnsCount, 2)

  // Case B: Fallback to chat.turnStats
  const mockChatTurn = {
    turnStats: { inputTokens: 1500, outputTokens: 500, cacheReadTokens: 200, turnsCount: 3 },
  }
  const statsB = extractSessionStats(mockChatTurn)
  assert.equal(statsB.totalTokens, 2200)
  assert.equal(statsB.turnsCount, 3)
})

test('checkBudgetThreshold issues warning at 80% and limit at 100%', () => {
  assert.equal(checkBudgetThreshold({ currentSpendUsd: 0.5, thresholdUsd: 1.0 }), null)

  const warn = checkBudgetThreshold({ currentSpendUsd: 0.85, thresholdUsd: 1.0 })
  assert.equal(warn.alert, true)
  assert.equal(warn.level, 'warning')

  const limit = checkBudgetThreshold({ currentSpendUsd: 1.05, thresholdUsd: 1.0 })
  assert.equal(limit.alert, true)
  assert.equal(limit.level, 'limit')
})

test('handleGatewayCommand /cost renders report', async () => {
  const replies = []
  const gw = {
    config: {
      agent: { model: 'deepseek-chat' },
      telegram: { budgetAlertThresholdUsd: 5.0 },
    },
    resolveLocale: () => 'en',
    chats: new Map([
      ['session-1', {
        turnStats: { inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 1000, turnsCount: 4 },
      }],
    ]),
  }

  const input = {
    chatId: 100,
    userId: 42,
    reply: (msg) => replies.push(msg),
  }

  await handleGatewayCommand(gw, 'session-1', '/cost', input)
  assert.equal(replies.length, 1)
  assert.ok(replies[0].includes('Session Token & Cost Meter'))
  assert.ok(replies[0].includes('Active Model: <code>deepseek-chat</code>'))
  assert.ok(replies[0].includes('Total Tokens:'))
  assert.ok(replies[0].includes('Budget Threshold: <b>$5.00</b>'))
})
