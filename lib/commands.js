import { truncateSafe } from "./text.js"

// Single command registry (#235): every user-facing command is declared ONCE
// with its description, help text and help section. The Telegram autocomplete
// list (DEFAULT_TELEGRAM_COMMANDS -> setMyCommands) and HELP_TEXT are both
// DERIVED from this registry, so a new command cannot be forgotten in the
// other two places. test/commands-parity.test.mjs enforces the parity.

export const COMMAND_GROUPS = [
  ['chat', '💬 <b>Session & Chat:</b>'],
  ['tools', '🛠️ <b>Tools, Files & Cron:</b>'],
  ['settings', '⚙️ <b>Settings & Stats:</b>'],
  ['access', '🔒 <b>Access & Channels:</b>'],
]

export const COMMAND_REGISTRY = [
  // 💬 Session & Chat
  { command: 'help', description: 'Show commands help', group: 'chat' },
  { command: 'new', description: 'Start fresh session', group: 'chat' },
  { command: 'sessions', description: 'List recent conversations', group: 'chat' },
  { command: 'resume', description: 'Resume session: /resume <n|id>', group: 'chat' },
  { command: 'stop', description: 'Interrupt current response', group: 'chat' },
  { command: 'model', description: 'Interactive model selector', help: '/model — interactive model selector (/model list)', group: 'chat' },
  { command: 'role', description: 'Switch persona or role', help: '/role [name] — switch persona or role (/role list)', group: 'chat' },
  { command: 'bind', description: 'Bind persona to topic / chat', help: '/bind [role] — bind persona to topic / chat', group: 'chat' },
  { command: 'preset', description: 'Bind preset to topic / chat', help: '/preset [name] — bind preset to topic / chat', group: 'chat' },
  { command: 'lang', description: 'Switch user language: /lang [en|zh]', group: 'chat' },
  { command: 'rewind', description: 'Rewind last N turns', help: '/rewind [N] — rewind last N turns', group: 'chat' },
  { command: 'fork', description: 'Fork session into new branch', group: 'chat' },
  { command: 'export', description: 'Export history to Markdown', group: 'chat' },
  // 🛠️ Tools, Files & Cron
  { command: 'skills', description: 'List active tools & skills', group: 'tools' },
  { command: 'tools', description: 'List active tools', group: 'tools' },
  { command: 'project', description: 'Topic workspace binding', help: '/project — topic workspace binding (/project bind <path>)', group: 'tools' },
  { command: 'memory', description: 'Show remembered facts about you', help: '/memory — show remembered facts about you (/memory add <fact>)', group: 'tools' },
  { command: 'forget', description: 'Delete stored user facts', help: '/forget <id|all> — delete stored user facts', group: 'tools' },
  { command: 'outbox', description: 'Transactional queue & DLQ', help: '/outbox — transactional queue & DLQ (/outbox [retry|clear])', group: 'tools' },
  { command: 'cost', description: 'Session token usage & estimated cost', help: '/cost — session token usage, breakdown & estimated cost', group: 'tools' },
  { command: 'cwd', description: 'Show current working directory', group: 'tools' },
  { command: 'files', description: 'Workspace file explorer', help: '/files [dir] — workspace file explorer', group: 'tools' },
  { command: 'get', description: 'Download file from workspace', help: '/get <path> — download file from workspace', group: 'tools' },
  { command: 'remind', description: 'Set reminder', help: '/remind <time> <text> — set reminder (/remind 10m check deploy)', group: 'tools' },
  { command: 'cron', description: 'Recurring autonomous task', help: '/cron <interval> <prompt> — recurring autonomous task', group: 'tools' },
  { command: 'topic', description: 'Create forum topic: /topic <name>', group: 'tools' },
  // ⚙️ Settings & Stats
  { command: 'status', description: 'Gateway and active model status', group: 'settings' },
  { command: 'top', description: 'System resource usage (RAM, uptime)', help: '/top — system resource usage (RAM, uptime)', group: 'settings' },
  { command: 'app', description: 'Open the Mini App dashboard', group: 'settings' },
  { command: 'dashboard', description: 'Open the Mini App dashboard', group: 'settings' },
  { command: 'keyboard', description: 'Quick action keyboard', help: '/keyboard on|off — quick action keyboard', group: 'settings' },
  { command: 'voice', description: 'Voice replies preference', help: '/voice on|off|status — voice replies preference', group: 'settings' },
  { command: 'tts', description: 'Speech synthesis in this chat', help: '/tts on|off|status — speech synthesis in this chat', group: 'settings' },
  { command: 'mute', description: 'Mute notifications in this chat', help: '/mute / /unmute — mute notifications in this chat', group: 'settings' },
  { command: 'unmute', description: 'Unmute notifications in this chat', group: 'settings' },
  { command: 'update', description: 'Check or install plugin update: /update [now]', group: 'settings' },
  // 🔒 Access & Channels
  { command: 'start', description: 'Connect and show greeting', group: 'access' },
  { command: 'whoami', description: 'Your messenger user ID', help: '/whoami — your messenger user ID', group: 'access' },
  { command: 'pair', description: 'Approve pairing code', help: '/pair CODE — approve pairing code', group: 'access' },
  { command: 'sethome', description: 'Set home notification channel', help: '/sethome [name] — set home notification channel', group: 'access' },
  { command: 'home', description: 'List registered home channels', group: 'access' },
  { command: 'setalert', description: 'Set alert channel', help: '/setalert — set alert channel', group: 'access' },
  { command: 'alert', description: 'Alert channel status', help: '/alert [test] — alert channel status', group: 'access' },
]

// Telegram autocomplete payload derived from the registry (#235).
export const DEFAULT_TELEGRAM_COMMANDS = COMMAND_REGISTRY.map(({ command, description }) => ({ command, description }))

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
    out.push({ command, description: truncateSafe(description, 256) })
  }
  return out.length ? out : [...DEFAULT_TELEGRAM_COMMANDS]
}

// Help reference derived from the registry (#235): every registry command is
// rendered under its group; `help` overrides the default one-liner.
export const HELP_TEXT = [
  '📖 <b>Messenger Gateway Help:</b>',
  '',
  ...COMMAND_GROUPS.flatMap(([group, header]) => [
    header,
    ...COMMAND_REGISTRY
      .filter((c) => c.group === group)
      .map((c) => `• ${c.help || `/${c.command} — ${c.description}`}`),
    '',
  ]),
].join('\n')

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
    description = truncateSafe(description, 256)
    seen.add(command)
    out.push({ command, description })
  }

  return out.slice(0, maxTotal)
}

export function buildQuickActionsKeyboard(webAppUrl = '') {
  const rows = [
    [{ text: '🔄 /new' }, { text: '🛑 /stop' }],
    [{ text: '🎙️ /voice' }, { text: '📊 /status' }],
  ]
  if (webAppUrl && String(webAppUrl).startsWith('http')) {
    rows.push([{ text: '📊 Open Dashboard', web_app: { url: String(webAppUrl) } }])
  }
  return {
    keyboard: rows,
    resize_keyboard: true,
  }
}

export const REMOVE_REPLY_KEYBOARD = { remove_keyboard: true }
