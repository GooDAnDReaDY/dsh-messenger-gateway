import z from '@deepseek-ai/schemastery'

const HomeEntry = z.object({
  name: z.string().default('default'),
  chatId: z.union([z.number(), z.string()]),
  threadId: z.number().default(0),
})

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
    homeChatId: z.union([z.number(), z.string()]).default('').description('Legacy default home chatId'),
    homeThreadId: z.number().default(0),
    homes: z.array(HomeEntry).default([]).description('Named homes (forum topics / channels)'),
    pairingEnabled: z.boolean().default(true).description('Issue pairing codes to unknown users when allowlist is non-empty'),
    streaming: z.boolean().default(false).description('If true, edit one Telegram message while tokens arrive; default off'),
    streamEditIntervalMs: z.number().default(1200),
    progressEnabled: z.boolean().default(true),
    approvalsEnabled: z.boolean().default(true),
    groupsEnabled: z.boolean().default(true).description('Process group/supergroup messages'),
    groupRequireMention: z.boolean().default(true).description('In groups, only respond to @mention, reply-to-bot, or /commands'),
    reactionsEnabled: z.boolean().default(true).description('React with 👀 while processing a turn'),
    statusIndicator: z.boolean().default(false).description('Opt-in: set bot short description to Online/Offline (bots have no presence)'),
    statusOnline: z.string().default('Online'),
    statusOffline: z.string().default('Offline'),
    transport: z.union([z.const('poll'), z.const('webhook')]).default('poll'),
    webhookUrl: z.string().default(''),
    webhookSecret: z.string().role('secret').default(''),
    webhookPath: z.string().default('/dsh-messenger-gateway/telegram/webhook'),
    voiceMode: z.union([z.const('mirror'), z.const('always'), z.const('off')]).default('mirror')
      .description('mirror: TTS when inbound was voice; always/off override (per-user /voice wins)'),
    quickActions: z.boolean().default(false).description('Show quick actions keyboard in Telegram (/new, /stop, /voice, /status)'),
    artifactPreviews: z.boolean().default(true).description('Render diagrams and formatted tables as previews'),
    notifyBridge: z.object({
      enabled: z.boolean().default(false),
      events: z.array(z.string()).default(['task_done', 'error']),
      home: z.string().default('default'),
      excludeSessionPrefixes: z.array(z.string()).default(['msgw-']),
    }).default({ enabled: false }),
    alerts: z.object({
      enabled: z.boolean().default(false),
      chatId: z.union([z.number(), z.string()]).default(''),
      threadId: z.number().default(0),
      home: z.string().default(''),
      events: z.array(z.string()).default(['error', 'pairing']),
    }).default({ enabled: false }),
  }),
  discord: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().role('secret').default(''),
    webhookUrl: z.string().default(''),
  }).default({ enabled: false }),
  slack: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().role('secret').default(''),
    webhookUrl: z.string().default(''),
  }).default({ enabled: false }),
  webhooks: z.object({
    enabled: z.boolean().default(true),
    secret: z.string().role('secret').default(''),
  }).default({ enabled: true }),
  media: z.object({
    cacheDir: z.string().default(''),
    maxDocBytes: z.number().default(20 * 1024 * 1024),
    maxTextInjectBytes: z.number().default(100 * 1024),
    maxImageBytes: z.number().default(20 * 1024 * 1024),
  }),
  tts: z.object({
    enabled: z.boolean().default(false),
    maxChars: z.number().default(4000),
    voiceSummary: z.boolean().default(false).description('Speak concise TL;DR summary while full text is sent to chat'),
  }),
  agent: z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
    cwd: z.string().default(''),
    instructionPrefix: z.string().default(''),
    maxMessageLength: z.number().default(4000),
    idleTimeoutMs: z.number().default(3_600_000),
    turnTimeoutMs: z.number().default(600_000),
    photoOnlyMode: z.union([z.const('prompt'), z.const('run')]).default('prompt'),
    sessionScope: z.union([z.const('chat'), z.const('user')]).default('user')
      .description('In groups: user = per-user session; chat = shared session for the chat/topic'),
  }),
})

export const Config = PluginConfig
