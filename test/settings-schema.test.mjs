// DSH persists plugin settings (the profile patch) only for schema paths it can
// treat as live-editable: @deepseek-ai/dsh-settings runs every write through
// volatileForm()/isVolatilePath() and rejects the rest with
// `Config field "<path>" is not volatile`. This test replays that rule against
// the real Config schema and the exact payload the settings card sends, so a
// regression (card silently stops saving) fails here.
import assert from 'node:assert/strict'
import { test } from 'node:test'

let Config
let plainConfig
try {
  ({ Config, plainConfig } = await import('../lib/config.js'))
} catch (err) {
  if (err?.code === 'ERR_MODULE_NOT_FOUND') {
    test('settings schema accepts every field the card edits', { skip: 'install the DSH peer dependencies to run this test' }, () => {})
  } else {
    throw err
  }
}

if (Config) {
  const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

  // replica of @deepseek-ai/dsh-settings
  const isVolatilePath = (schema, path) => {
    if (schema.meta?.volatile) return true
    const [key, ...rest] = path
    const child = key === undefined ? undefined : schema.dict?.[key]
    return child !== undefined && isVolatilePath(child, rest)
  }
  const volatileForm = (schema) => {
    if (schema.meta?.volatile) return true
    if (schema.type !== 'object') return undefined
    const dict = Object.fromEntries(Object.entries(schema.dict ?? {})
      .map(([key, child]) => [key, volatileForm(child)])
      .filter(([, child]) => child !== undefined))
    return Object.keys(dict).length ? dict : undefined
  }
  const validatePaths = (value, node, path = []) => {
    for (const [key, child] of Object.entries(value)) {
      const target = [...path, key]
      if (isVolatilePath(Config, target)) continue
      const field = node?.dict?.[key]
      if (isPlainObject(child) && field !== undefined) validatePaths(child, field, target)
      else throw new Error(`Config field "${target.join('.')}" is not volatile`)
    }
  }

  test('settings schema accepts every field the card edits', () => {
    const form = volatileForm(Config)
    assert.ok(form, 'schema must expose volatile fields')
    for (const key of ['enabled', 'telegram', 'discord', 'slack', 'agent', 'media', 'tts']) {
      assert.ok(isVolatilePath(Config, [key]), `settings key "${key}" must be a volatile path`)
    }

    // the exact draft lib/client.js writes on Save
    const draft = {
      enabled: true,
      telegram: {
        enabled: true,
        allowedUserIds: [1],
        pollTimeoutSeconds: 50,
        pollIntervalMs: 500,
        commands: [{ command: 'start', description: 'x' }],
        textFormat: 'html',
        homeChatId: '',
        homeThreadId: 0,
        homes: [{ name: 'default', chatId: 1, threadId: 0 }],
        pairingEnabled: true,
        streaming: false,
        streamEditIntervalMs: 1200,
        progressEnabled: true,
        approvalsEnabled: true,
        groupsEnabled: true,
        groupRequireMention: true,
        reactionsEnabled: true,
        statusIndicator: false,
        statusOnline: 'Online',
        statusOffline: 'Offline',
        transport: 'poll',
        proxyUrl: 'socks5h://user:pass@127.0.0.1:1080',
        apiRoot: '',
        webhookUrl: '',
        webhookPath: '/dsh-messenger-gateway/telegram/webhook',
        voiceMode: 'mirror',
        quickActions: false,
        artifactPreviews: true,
        notifyBridge: { enabled: false, events: ['task_done', 'error'], home: 'default', excludeSessionPrefixes: ['msgw-'] },
        alerts: { enabled: false, chatId: '', threadId: 0, home: '', events: ['error', 'pairing'] },
        botToken: '123:ABC',
        webhookSecret: '',
      },
      discord: { enabled: false, botToken: '', webhookUrl: '', allowedChannelIds: [] },
      slack: { enabled: false, botToken: '', webhookUrl: '', defaultChannel: '' },
      agent: {
        provider: '',
        model: '',
        instructionPrefix: '',
        maxMessageLength: 4000,
        turnTimeoutMs: 600000,
        idleTimeoutMs: 3600000,
        photoOnlyMode: 'prompt',
        sessionScope: 'user',
      },
      media: { maxDocBytes: 20971520, maxImageBytes: 20971520, maxTextInjectBytes: 102400 },
      tts: { enabled: false, maxChars: 4000, voiceSummary: false },
    }
    validatePaths(draft, { dict: form })
    // the plugin's own internal writes send the full resolved config
    validatePaths({ ...plainConfig(Config({})), ...draft }, { dict: form })
  })

  test('proxy/apiRoot values survive schema resolution', () => {
    const resolved = plainConfig(Config({ telegram: { proxyUrl: 'socks5://127.0.0.1:1080', apiRoot: 'http://127.0.0.1:8081' } }))
    assert.equal(resolved.telegram.proxyUrl, 'socks5://127.0.0.1:1080')
    assert.equal(resolved.telegram.apiRoot, 'http://127.0.0.1:8081')
    assert.equal(resolved.telegram.pollTimeoutSeconds, 50)
  })
}
