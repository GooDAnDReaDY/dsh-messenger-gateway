export const DEFAULT_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Подключение и приветствие' },
  { command: 'help', description: 'Список команд' },
  { command: 'new', description: 'Новая сессия агента' },
  { command: 'whoami', description: 'Показать ваш Telegram id' },
  { command: 'stop', description: 'Прервать текущий ответ' },
  { command: 'pair', description: 'Одобрить код сопряжения: /pair CODE' },
  { command: 'sethome', description: 'Сделать этот чат home-каналом' },
  { command: 'home', description: 'Показать home-канал' },
  { command: 'model', description: 'Показать или сменить модель: /model [provider model]' },
  { command: 'status', description: 'Статус шлюза' },
]

/** Normalize config/API command list for Telegram setMyCommands. */
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
