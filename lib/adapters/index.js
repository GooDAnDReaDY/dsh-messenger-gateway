import { TelegramAdapter } from './telegram.js'

export default function createAdapters(deps) {
  const { config, onMessage, logger } = deps
  const adapters = []
  const tg = config.telegram || {}
  if (config.enabled !== false && tg.enabled && String(tg.botToken || '').trim()) {
    adapters.push(new TelegramAdapter({ botToken: tg.botToken, pollTimeoutSeconds: tg.pollTimeoutSeconds, onMessage, logger }))
  }
  return adapters
}
