export const DEFAULT_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Connect and show greeting' },
  { command: 'help', description: 'Show commands help' },
  { command: 'new', description: 'Start a new agent session' },
  { command: 'whoami', description: 'Show your messenger user ID' },
  { command: 'stop', description: 'Interrupt current turn' },
  { command: 'pair', description: 'Approve pairing code: /pair CODE' },
  { command: 'sethome', description: 'Set home: /sethome [name]' },
  { command: 'home', description: 'List registered home channels' },
  { command: 'model', description: 'Interactive model selector' },
  { command: 'top', description: 'System resources: CPU, RAM, uptime' },
  { command: 'topic', description: 'Create forum topic: /topic <name>' },
  { command: 'status', description: 'Gateway and bot status' },
  { command: 'setalert', description: 'Designate channel for alerts' },
  { command: 'alert', description: 'Alert channel status: /alert [test]' },
  { command: 'keyboard', description: 'Toggle quick actions: /keyboard on|off' },
  { command: 'role', description: 'Switch persona: /role [name]' },
  { command: 'bind', description: 'Bind preset/persona to forum topic: /bind <name>' },
  { command: 'preset', description: 'Show or switch agent preset: /preset [name]' },
  { command: 'cron', description: 'Manage recurring reports: /cron' },
  { command: 'skills', description: 'List active tools & skills' },
  { command: 'tools', description: 'List active tools' },
  { command: 'fork', description: 'Fork session into new branch' },
  { command: 'export', description: 'Export history to Markdown' },
  { command: 'rewind', description: 'Rewind turns: /rewind [N]' },
  { command: 'files', description: 'Workspace file explorer: /files [dir]' },
  { command: 'get', description: 'Download file to messenger: /get <path>' },
  { command: 'remind', description: 'Set reminder: /remind <time> <text>' },
  { command: 'voice', description: 'Voice reply mode: /voice on|off|status' },
  { command: 'tts', description: 'Speech in this chat: /tts on|off|status' },
  { command: 'mute', description: 'Mute notifications in this chat' },
  { command: 'unmute', description: 'Unmute notifications in this chat' },
  { command: 'update', description: 'Check or install plugin update: /update [now]' },
]

export function normalizeTelegramCommands(commands) {
  const source = Array.isArray(commands) && commands.length ? commands : DEFAULT_TELEGRAM_COMMANDS
  const out = []
  const seen = new Set()
  for (const raw of source) {
    if (!raw || typeof raw !== 'object') continue
    let command = String(raw.command || '').trim().replace(/^\//, '')
    const description = String(raw.description || '').trim()
    if (!command || !description) continue
    command = command.slice(0, 32).toLowerCase()
    if (seen.has(command)) continue
    seen.add(command)
    out.push({ command, description: description.slice(0, 256) })
  }
  return out.length ? out : [...DEFAULT_TELEGRAM_COMMANDS]
}

export function mergeDynamicCommands(baseCommands = DEFAULT_TELEGRAM_COMMANDS, dynamicCommands = [], maxTotal = 100) {
  const normalizedBase = normalizeTelegramCommands(baseCommands)
  const out = [...normalizedBase]
  const seen = new Set(out.map((c) => c.command))

  for (const item of dynamicCommands || []) {
    if (out.length >= maxTotal) break
    if (!item || typeof item !== 'object') continue
    let command = String(item.command || item.name || '').trim().replace(/^\//, '').toLowerCase()
    // Telegram format: lowercase alphanumeric and underscore only, 1-32 chars
    command = command.replace(/[^a-z0-9_]/g, '_').slice(0, 32)
    if (!command || seen.has(command)) continue
    let description = String(item.description || item.title || `Skill ${command}`).trim()
    if (!description) description = `Skill ${command}`
    description = description.slice(0, 256)
    seen.add(command)
    out.push({ command, description })
  }

  return out.slice(0, maxTotal)
}

export function buildQuickActionsKeyboard() {
  return {
    keyboard: [
      [{ text: '🔄 /new' }, { text: '🛑 /stop' }],
      [{ text: '🎙️ /voice' }, { text: '📊 /status' }],
    ],
    resize_keyboard: true,
  }
}

export const REMOVE_REPLY_KEYBOARD = { remove_keyboard: true }

export const HELP_TEXT = [
  '📖 <b>Messenger Gateway Help:</b>',
  '',
  '💬 <b>Session & Chat:</b>',
  '• /help — show this command reference',
  '• /new — start fresh session',
  '• /stop — interrupt current response',
  '• /model — interactive model selector (/model list)',
  '• /role [name] — switch persona or role (/role list)',
  '• /bind [role] — bind persona to topic / chat',
  '• /preset [name] — bind preset to topic / chat',
  '• /lang [en|zh] — switch user language',
  '• /rewind [N] — rewind last N turns',
  '• /fork — fork session into new branch',
  '• /export — export history to Markdown',
  '',
  '🛠️ <b>Tools, Files & Cron:</b>',
  '• /skills / /tools — list active tools & skills',
  '• /files [dir] — workspace file explorer',
  '• /get <path> — download file from workspace',
  '• /remind <time> <text> — set reminder (/remind 10m check deploy)',
  '• /cron <interval> <prompt> — recurring autonomous task',
  '',
  '⚙️ <b>Settings & Stats:</b>',
  '• /status — gateway and active model status',
  '• /top — system resource usage (RAM, uptime)',
  '• /keyboard on|off — quick action keyboard',
  '• /voice on|off|status — voice replies preference',
  '• /tts on|off|status — speech synthesis in this chat',
  '• /mute / /unmute — mute notifications in this chat',
  '',
  '🔒 <b>Access & Channels:</b>',
  '• /whoami — your messenger user ID',
  '• /pair CODE — approve pairing code',
  '• /sethome [name] — set home notification channel',
  '• /setalert — set alert channel',
].join('\n')



