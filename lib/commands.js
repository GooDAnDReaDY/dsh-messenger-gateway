export const DEFAULT_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Подключение и приветствие' },
  { command: 'help', description: 'Список команд' },
  { command: 'new', description: 'Новая сессия агента' },
  { command: 'whoami', description: 'Показать ваш Telegram id' },
  { command: 'stop', description: 'Прервать текущий ответ' },
  { command: 'pair', description: 'Одобрить код сопряжения: /pair CODE' },
  { command: 'sethome', description: 'Home: /sethome [name]' },
  { command: 'home', description: 'Список home-каналов' },
  { command: 'model', description: 'Показать или сменить модель' },
  { command: 'status', description: 'Статус шлюза' },
  { command: 'keyboard', description: 'Клавиатура быстрых действий: /keyboard on|off' },
  { command: 'role', description: 'Роль и персона агента: /role [name]' },
  { command: 'skills', description: 'Список активных инструментов и навыков' },
  { command: 'tools', description: 'Список активных инструментов' },
  { command: 'fork', description: 'Форк текущей сессии в новую ветку' },
  { command: 'export', description: 'Экспорт истории диалога в Markdown' },
  { command: 'rewind', description: 'Откат сообщений: /rewind [N]' },
  { command: 'files', description: 'Файловый менеджер рабочей папки: /files [dir]' },
  { command: 'get', description: 'Скачать файл в Telegram: /get <path>' },
  { command: 'voice', description: 'Голосовые ответы: /voice on|off|status' },
  { command: 'tts', description: 'Озвучка в этом чате: /tts on|off|status' },
  { command: 'mute', description: 'Не присылать уведомления в этот чат' },
  { command: 'unmute', description: 'Вернуть уведомления в этот чат' },
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
