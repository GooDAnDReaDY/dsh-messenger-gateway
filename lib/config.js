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
  }),
})

export const Config = PluginConfig
