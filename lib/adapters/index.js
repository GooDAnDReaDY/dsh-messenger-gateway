import { TelegramAdapter } from './telegram.js'

export default function createAdapters(deps) {
  const { config, onMessage, onCallback, onUnauthorized, isUserAllowed, logger } = deps
  const list = []
  const tg = config.telegram || {}
  if (config.enabled !== false && tg.enabled && String(tg.botToken || '').trim()) {
    list.push(new TelegramAdapter({
      botToken: tg.botToken,
      allowedUserIds: tg.allowedUserIds,
      timeoutSeconds: tg.pollTimeoutSeconds,
      pollIntervalMs: tg.pollIntervalMs,
      commands: tg.commands,
      textFormat: tg.textFormat,
      media: config.media,
      onMessage,
      onCallback,
      onUnauthorized,
      isUserAllowed,
      logger,
    }))
  }
  const dc = config.discord || {}
  if (config.enabled !== false && dc.enabled) {
    logger?.warn?.('dsh-messenger-gateway: discord adapter is not implemented yet')
  }
  return list
}
