import { TelegramAdapter } from './telegram.js'
import { DiscordAdapter } from './discord.js'
import { SlackAdapter } from './slack.js'

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
      groupsEnabled: tg.groupsEnabled,
      groupRequireMention: tg.groupRequireMention,
      reactionsEnabled: tg.reactionsEnabled,
      statusIndicator: tg.statusIndicator,
      statusOnline: tg.statusOnline,
      statusOffline: tg.statusOffline,
      transport: tg.transport,
      webhookUrl: tg.webhookUrl,
      webhookSecret: tg.webhookSecret,
      quickActions: tg.quickActions !== false,
      artifactPreviews: tg.artifactPreviews !== false,
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
    list.push(new DiscordAdapter({
      botToken: dc.botToken,
      webhookUrl: dc.webhookUrl,
      logger,
    }))
  }
  const sl = config.slack || {}
  if (config.enabled !== false && sl.enabled) {
    list.push(new SlackAdapter({
      botToken: sl.botToken,
      webhookUrl: sl.webhookUrl,
      logger,
    }))
  }
  return list
}
