import z from '@deepseek-ai/schemastery'

export const PluginConfig = z.object({
  enabled: z.boolean().default(true),
  internalBaseURL: z.string().default('http://127.0.0.1:3080'),
  telegram: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().role('secret').default(''),
    allowedUserIds: z.array(z.number()).default([]),
    pollTimeoutSeconds: z.number().default(50),
    pollIntervalMs: z.number().default(500),
    commands: z.array(z.object({
      command: z.string(),
      description: z.string(),
    })).default([]),
    textFormat: z.union([z.const('html'), z.const('plain')]).default('html').description('html: Markdown→Telegram HTML; plain: без разметки'),
    homeChatId: z.union([z.number(), z.string()]).default('').description('Default chat for messenger.send/progress when target.chatId omitted'),
    homeThreadId: z.number().default(0),
    pairingEnabled: z.boolean().default(true).description('Issue pairing codes to unknown users when allowlist is non-empty'),
    streaming: z.boolean().default(false).description('If true, edit one Telegram message while tokens arrive (ugly for most chats); default off = one final reply'),
    streamEditIntervalMs: z.number().default(1200),
    progressEnabled: z.boolean().default(true),
    approvalsEnabled: z.boolean().default(true),
    groupsEnabled: z.boolean().default(true).description('Process group/supergroup messages'),
    groupRequireMention: z.boolean().default(true).description('In groups, only respond to @mention, reply-to-bot, or /commands'),
    reactionsEnabled: z.boolean().default(true).description('React with 👀 while processing a turn'),
    transport: z.union([z.const('poll'), z.const('webhook')]).default('poll').description('poll = getUpdates; webhook = HTTP updates'),
    webhookUrl: z.string().default('').description('Public HTTPS URL for setWebhook (required for webhook transport)'),
    webhookSecret: z.string().role('secret').default('').description('X-Telegram-Bot-Api-Secret-Token value'),
    webhookPath: z.string().default('/dsh-messenger-gateway/telegram/webhook'),
  }),
  discord: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().role('secret').default(''),
  }),
  media: z.object({
    cacheDir: z.string().default(''),
    maxDocBytes: z.number().default(20 * 1024 * 1024),
    maxTextInjectBytes: z.number().default(100 * 1024),
    maxImageBytes: z.number().default(20 * 1024 * 1024),
  }),
  tts: z.object({
    enabled: z.boolean().default(false),
    maxChars: z.number().default(4000),
  }),
  agent: z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
    cwd: z.string().default(''),
    instructionPrefix: z.string().default(''),
    maxMessageLength: z.number().default(4000),
    idleTimeoutMs: z.number().default(3_600_000),
    turnTimeoutMs: z.number().default(600_000).description('Max wait for one agent turn in messenger (ms)'),
    photoOnlyMode: z.union([z.const('prompt'), z.const('run')]).default('prompt').description('prompt: ack photo and wait for question; run: agent turn immediately'),
  }),
})

export const Config = PluginConfig
