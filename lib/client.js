// dsh-messenger-gateway — browser (client) half.
// Settings card on Plugins → Plugin settings tab (settings.plugin.item).
// Config managed via reactive ctx.settingsScope snapshot.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-messenger-gateway',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const NS = 'dsh-messenger-gateway'
    const ROUTE_PREFIX = '/dsh-messenger-gateway'

    const en = {
      title: 'Messenger gateway',
      description: 'Telegram bot: text, voice, photos, documents, and interactive asks.',
      'settings.loading': 'Loading Messenger gateway settings…',
      'settings.retry': 'Retry',
      'settings.unavailable': 'Settings unavailable (host namespace is not ready).',
      'header.title': 'Telegram & Multi-Messenger Gateway',
      'header.sub': 'Bridge between DeepSeek Harness and Telegram: sessions, steer, forum topics, inline buttons, and optional voice notes.',
      'badge.online': 'Telegram online (@{username})',
      'badge.running': 'Running',
      'badge.stopped': 'Stopped',
      'badge.token_ok': 'Token ✓',
      'badge.token_missing': 'Token missing',
      'badge.pairing_count': 'Pairing: {count}',
      'badge.transport': 'Transport: {mode}',
      save: 'Save Changes',
      saved: 'Settings saved successfully',
      saving: 'Saving…',
      showAdvanced: '⚙️ Advanced connection & polling settings',
      hideAdvanced: 'Hide advanced settings',
      telegram: 'Telegram Bot Configuration',
      telegramSub: 'Main bot credentials, whitelist, and message delivery settings.',
      agent: 'Agent & Reasoning Execution',
      agentSub: 'Model routing, instruction overrides, and turn timeout control.',
      media: 'Media & File Limits',
      mediaSub: 'Document extraction and image upload limits.',
      tts: 'Voice Replies (dsh-tts)',
      ttsSub: 'Synthesize spoken replies for Telegram voice messages.',
      advanced: 'Connection & Polling Internals',
      botToken: 'Telegram Bot Token',
      botTokenHint: 'Obtained via @BotFather. Leave empty to keep existing configured token.',
      allowedIds: 'Allowed Telegram User IDs',
      allowedIdsHint: 'Comma-separated list of user IDs. Leave empty to allow all users (pairing requests enabled).',
      textFormat: 'Text Format Rendering',
      textFormatHtml: 'Markdown → Telegram HTML (recommended)',
      textFormatPlain: 'Plain text (no formatting)',
      disableTelegram: 'Disable Telegram Bot',
      enableTelegram: 'Enable Telegram Bot',
      provider: 'Provider Override',
      providerHint: 'Leave empty to use DSH default provider',
      model: 'Model Override',
      modelHint: 'Leave empty to use DSH default model',
      photoOnly: 'Photo without Caption Behavior',
      photoPrompt: 'Wait for question (recommended)',
      photoRun: 'Reply immediately',
      instruction: 'Extra Agent Instruction',
      instructionHint: 'Prepended to each inbound messenger message',
      instructionPlaceholder: 'Empty = built-in relay instruction (Russian, concise)',
      maxMessageLength: 'Max Reply Length (characters)',
      turnTimeout: 'Agent Turn Timeout (seconds)',
      maxDocMb: 'Max Document Size (MB)',
      maxImageMb: 'Max Photo Size (MB)',
      maxTextKb: 'Max Extracted Text from Document (KB)',
      ttsEnable: 'Enable Voice Replies (requires dsh-tts)',
      ttsMaxChars: 'Max Spoken Characters per Voice Note',
      pollTimeout: 'Long Poll Timeout (seconds)',
      pollInterval: 'Long Poll Interval (ms)',
      idleTimeout: 'Idle Chat Timeout (seconds)',
      pairing: 'Pairing Requests & Authorization',
      pairingSub: 'Authorize new users when whitelist is restricted.',
      pairingEmpty: 'No pending pairing codes',
      pairingApprove: 'Approve',
      pairingReject: 'Reject',
      pairingRefresh: 'Refresh List',
      groupsEnable: 'Respond in Telegram Groups & Supergroups',
      groupMention: 'Require @mention, reply, or /command in groups',
      reactionsEnable: 'React with 👀 while processing turn',
      progressEnable: 'Progress status message (Thinking → Delete → Final)',
      statusIndicator: 'Bot Status Description Indicator (Online/Offline)',
      statusIndicatorHint: 'Sets bot short description via Telegram API (visible to all users).',
      transport: 'Telegram Transport Mode',
      transportPoll: 'Long poll (getUpdates)',
      transportWebhook: 'Webhook (HTTPS)',
      webhookUrl: 'Public Webhook HTTPS URL',
      webhookUrlHint: 'Public endpoint where Telegram sends updates',
      webhookSecret: 'Webhook Secret Token',
      webhookSecretHint: 'Leave empty to keep current configured secret',
      sessionScope: 'Group Session Scope',
      sessionScopeChat: 'Shared per chat/topic',
      sessionScopeUser: 'Per-user session (recommended)',
      voiceMode: 'Voice Reply Mode',
      voiceModeMirror: 'Mirror inbound voice (reply voice only if input was voice)',
      voiceModeAlways: 'Always synthesize voice note',
      voiceModeOff: 'Off (unless explicitly toggled via /voice)',
      notifyBridge: 'Notify Bridge → Telegram Home',
      notifyBridgeHint: 'Forward task_done/error events from web sessions into designated Telegram home',
      notifyHome: 'Notify Target Home Name',
      quickActions: 'Quick Actions Keyboard (/new, /stop, /voice, /status)',
      artifactPreviews: 'Render diagram and table previews in Telegram',
      'diag.title': '⚡ Diagnostics & Telegram Smoke Test',
      'diag.desc': 'Test connection to Telegram Bot API, measure network latency, and verify bot identity.',
      'diag.smoke_btn': 'Run Telegram Smoke Test (Ping)',
      'diag.smoke_testing': 'Testing Telegram API…',
      'diag.smoke_ok': 'Telegram API OK! Latency: {latency} ms (@{username}, ID: {id})',
      'diag.smoke_err': 'Smoke test failed: {error}',
      'stats.title': '📊 Gateway Telemetry & Session Counters',
      'stats.desc': 'Real-time counters from the running gateway process.',
      'stats.sent': 'Messages Delivered',
      'stats.errors': 'Delivery Errors',
      'stats.uptime': 'Gateway Uptime',
      'stats.active_chats': 'Active Chats in Memory',
    }

    const ru = {
      title: 'Messenger gateway',
      description: 'Telegram-бот: текст, голос, фото, документы и интерактивные опросы.',
      'settings.loading': 'Загрузка настроек Messenger gateway…',
      'settings.retry': 'Повторить попытку',
      'settings.unavailable': 'Настройки недоступны (пространство хоста ещё не готово).',
      'header.title': 'Шлюз Telegram и мессенджеров',
      'header.sub': 'Мост между DeepSeek Harness и Telegram: сессии, steer, топики форума, инлайн-кнопки и голосовые ответы.',
      'badge.online': 'Telegram онлайн (@{username})',
      'badge.running': 'Работает',
      'badge.stopped': 'Остановлен',
      'badge.token_ok': 'Токен ✓',
      'badge.token_missing': 'Токен отсутствует',
      'badge.pairing_count': 'Сопряжение: {count}',
      'badge.transport': 'Транспорт: {mode}',
      save: 'Сохранить изменения',
      saved: 'Настройки успешно сохранены',
      saving: 'Сохранение…',
      showAdvanced: '⚙️ Расширенные настройки подключения и polling',
      hideAdvanced: 'Скрыть расширенные настройки',
      telegram: 'Настройки бота Telegram',
      telegramSub: 'Ключи доступа, белый список пользователей и параметры доставки сообщений.',
      agent: 'Поведение агента и рассуждения',
      agentSub: 'Маршрутизация модели, дополнительные инструкции и таймаут хода.',
      media: 'Ограничения медиа и документов',
      mediaSub: 'Лимиты на извлечение текста и размер загружаемых файлов.',
      tts: 'Голосовые ответы (dsh-tts)',
      ttsSub: 'Синтез аудиоответов на голосовые сообщения в чате.',
      advanced: 'Параметры соединения и polling',
      botToken: 'Токен бота Telegram',
      botTokenHint: 'Получен от @BotFather. Оставьте пустым, чтобы сохранить текущий.',
      allowedIds: 'Разрешённые ID пользователей',
      allowedIdsHint: 'ID пользователей через запятую. Пусто = доступно всем (включено сопряжение по кодам).',
      textFormat: 'Форматирование текста',
      textFormatHtml: 'Markdown → Telegram HTML (рекомендуется)',
      textFormatPlain: 'Простой текст (без форматирования)',
      disableTelegram: 'Выключить Telegram-бота',
      enableTelegram: 'Включить Telegram-бота',
      provider: 'Провайдер по умолчанию',
      providerHint: 'Пусто = провайдер по умолчанию DSH',
      model: 'Модель по умолчанию',
      modelHint: 'Пусто = модель по умолчанию DSH',
      photoOnly: 'Поведение фото без подписи',
      photoPrompt: 'Ждать вопроса (рекомендуется)',
      photoRun: 'Отвечать сразу',
      instruction: 'Дополнительная инструкция агенту',
      instructionHint: 'Добавляется к каждому входящему сообщению из мессенджера',
      instructionPlaceholder: 'Пусто = встроенная инструкция (русский язык, лаконичный ответ)',
      maxMessageLength: 'Макс. длина ответа (символов)',
      turnTimeout: 'Таймаут хода агента (сек)',
      maxDocMb: 'Макс. размер документа (МБ)',
      maxImageMb: 'Макс. размер фото (МБ)',
      maxTextKb: 'Макс. объём текста из документа (КБ)',
      ttsEnable: 'Включить голосовые ответы (требуется dsh-tts)',
      ttsMaxChars: 'Макс. символов для озвучивания',
      pollTimeout: 'Таймаут Long Poll (сек)',
      pollInterval: 'Интервал Long Poll (мс)',
      idleTimeout: 'Таймаут неактивного чата (сек)',
      pairing: 'Запросы сопряжения и авторизация',
      pairingSub: 'Подтверждение доступа новых пользователей при ограниченном списке.',
      pairingEmpty: 'Нет ожидающих кодов сопряжения',
      pairingApprove: 'Одобрить',
      pairingReject: 'Отклонить',
      pairingRefresh: 'Обновить список',
      groupsEnable: 'Отвечать в группах и супергруппах',
      groupMention: 'В группах отвечать только на @упоминание, reply или /команду',
      reactionsEnable: 'Реакция 👀 пока агент думает',
      progressEnable: 'Индикатор прогресса (Думаю → Удалить → Ответ)',
      statusIndicator: 'Индикатор статуса (Online/Offline)',
      statusIndicatorHint: 'Меняет краткое описание бота в Telegram (видно всем).',
      transport: 'Режим транспорта',
      transportPoll: 'Long poll (getUpdates)',
      transportWebhook: 'Webhook (HTTPS)',
      webhookUrl: 'Публичный HTTPS URL webhook',
      webhookUrlHint: 'Публичный адрес, куда Telegram доставляет входящие обновления',
      webhookSecret: 'Секретный токен webhook',
      webhookSecretHint: 'Оставьте пустым, чтобы не менять текущий секрет',
      sessionScope: 'Сессии в группах',
      sessionScopeChat: 'Общая сессия на чат/топик',
      sessionScopeUser: 'Индивидуальная на пользователя (рекомендуется)',
      voiceMode: 'Режим голосовых ответов',
      voiceModeMirror: 'Как входящее (голос на голос)',
      voiceModeAlways: 'Всегда отвечать голосовым',
      voiceModeOff: 'Выключено (если не включено через /voice)',
      notifyBridge: 'Мост уведомлений → Telegram Home',
      notifyBridgeHint: 'Пересылка событий task_done/error из web-сессий в указанный канал/топик',
      notifyHome: 'Имя целевого канала (Home)',
      quickActions: 'Клавиатура быстрых действий (/new, /stop, /voice, /status)',
      artifactPreviews: 'Превью диаграмм и таблиц в Telegram',
      'diag.title': '⚡ Диагностика и проверка связи (Smoke test)',
      'diag.desc': 'Проверка подключения к Telegram Bot API, замер сетевой задержки и валидация имени бота.',
      'diag.smoke_btn': 'Проверить соединение с Telegram (Ping)',
      'diag.smoke_testing': 'Проверка связи с Telegram API…',
      'diag.smoke_ok': 'Связь с Telegram API установлена! Задержка: {latency} мс (@{username}, ID: {id})',
      'diag.smoke_err': 'Ошибка проверки связи: {error}',
      'stats.title': '📊 Телеметрия шлюза и счётчики',
      'stats.desc': 'Статистика реального времени работающего процесса шлюза.',
      'stats.sent': 'Сообщений отправлено',
      'stats.errors': 'Ошибок доставки',
      'stats.uptime': 'Время работы шлюза',
      'stats.active_chats': 'Активных чатов в памяти',
    }

    function useActiveLocale(ctx) {
      const loc = ctx?.get?.('locale') || ctx?.locale
      return React.useSyncExternalStore(
        React.useMemo(() => (cb) => (loc ? loc.subscribe(cb) : () => {}), [loc]),
        React.useCallback(() => {
          if (loc) {
            const active = loc.getSnapshot?.()?.active
            if (typeof active === 'string' && active) return active
          }
          return typeof navigator !== 'undefined' ? String(navigator.language || '').slice(0, 2) : 'en'
        }, [loc]),
      )
    }

    function makeT(locale) {
      const DICT = String(locale || '').startsWith('ru') ? ru : en
      return (key, params) => {
        let text = DICT[key] || en[key] || key
        if (params && typeof params === 'object') {
          for (const k of Object.keys(params)) {
            text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]))
          }
        }
        return text
      }
    }

    function ensureCss() {
      if (typeof document === 'undefined') return
      const id = 'dsh-messenger-gateway-full-css'
      if (document.getElementById(id)) return
      const style = document.createElement('style')
      style.id = id
      style.dataset.dshPlugin = NS
      style.textContent = `
.msgw-page{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font-family:inherit}
.msgw-header{display:flex;flex-direction:column;gap:4px;padding-bottom:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.msgw-page-title{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-primary)}
.msgw-page-sub{font-size:13px;color:var(--dsw-alias-label-secondary);line-height:1.4}

.msgw-badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.msgw-badge-ok{background:rgba(16,185,129,0.15);color:var(--dsw-alias-state-success-primary, #10b981);border:1px solid rgba(16,185,129,0.3)}
.msgw-badge-warn{background:rgba(245,158,11,0.15);color:var(--dsw-alias-state-warning-primary, #f59e0b);border:1px solid rgba(245,158,11,0.3)}
.msgw-badge-bad{background:rgba(239,68,68,0.15);color:var(--dsw-alias-state-error-primary, #ef4444);border:1px solid rgba(239,68,68,0.3)}

.msgw-section-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.msgw-section-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;justify-content:space-between}
.msgw-section-desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.4;margin-top:-6px}

.msgw-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.msgw-field{display:flex;flex-direction:column;gap:6px}
.msgw-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.msgw-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.3}

.msgw-input,.msgw-select,.msgw-textarea{width:100%;box-sizing:border-box;height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit;font-size:13px;outline:none;transition:border-color .15s}
.msgw-input:focus,.msgw-select:focus,.msgw-textarea:focus{border-color:var(--dsw-alias-label-primary)}
.msgw-textarea{height:auto;min-height:72px;padding:8px 12px}
.msgw-check{display:flex;gap:8px;align-items:center;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-primary);user-select:none}

.msgw-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 14px;font-size:13px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}
.msgw-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2))}
.msgw-btn-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border-color:transparent}
.msgw-btn-primary:hover:not(:disabled){opacity:0.88}
.msgw-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:rgba(239,68,68,0.3)}
.msgw-btn-danger:hover:not(:disabled){background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.5)}
.msgw-btn-mini{padding:4px 10px;font-size:12px;border-radius:6px}
.msgw-btn:disabled{opacity:0.5;cursor:not-allowed}

.msgw-alert-ok{padding:10px 14px;border-radius:8px;background:rgba(16,185,129,0.1);color:var(--dsw-alias-state-success-primary);font-size:13px;border:1px solid rgba(16,185,129,0.25)}
.msgw-alert-err{padding:10px 14px;border-radius:8px;background:rgba(239,68,68,0.1);color:var(--dsw-alias-state-error-primary);font-size:13px;border:1px solid rgba(239,68,68,0.25)}
.msgw-banner-warning{padding:12px 16px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary);font-size:13px;display:flex;align-items:center;gap:10px;font-weight:500}

.msgw-stat-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:10px}
.msgw-stat-box{padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:4px}
.msgw-stat-val{font-size:18px;font-weight:700;color:var(--dsw-alias-label-primary)}
.msgw-stat-lbl{font-size:12px;color:var(--dsw-alias-label-secondary)}

.msgw-table{width:100%;border-collapse:collapse;margin-top:4px}
.msgw-table th{text-align:left;font-size:12px;color:var(--dsw-alias-label-secondary);padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-weight:600}
.msgw-table td{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;color:var(--dsw-alias-label-primary)}
.msgw-table tr:hover{background:var(--dsw-alias-bg-layer-2)}
.msgw-preview{padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l2)}
`
      document.head.appendChild(style)
    }

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return props?.children || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-messenger-gateway] React UI Error:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              { className: 'msgw-alert-err', style: { margin: '12px 0', padding: '14px', borderRadius: '8px' } },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, '⚠️ Messenger Gateway UI Error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String(this.state.error?.message || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'msgw-btn msgw-btn-mini',
                  style: { marginTop: '10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                'Retry'
              )
            )
          }
          return this.props?.children || null
        }
      }
    }
    const ErrorBoundary = createErrorBoundary()

    function FallbackChevron() {
      return React.createElement(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('polyline', { points: '6 9 12 15 18 9' })
      )
    }
    const Chevron = FallbackChevron

    function idsToText(ids) { return (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).join(', ') }
    function textToIds(text) {
      return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))
    }
    function bytesToMb(n) { return Math.round(Number(n || 0) / (1024 * 1024)) }
    function mbToBytes(n) { return Math.max(1, Math.round(Number(n || 1))) * 1024 * 1024 }

    function Field({ label, hint, children }) {
      return React.createElement('div', { className: 'msgw-field' },
        React.createElement('label', { className: 'msgw-label' }, label),
        hint ? React.createElement('div', { className: 'msgw-hint' }, hint) : null,
        children,
      )
    }

    const SETTINGS_KEYS = ['enabled', 'telegram', 'agent', 'media', 'tts']

    function draftFromStored(s) {
      const src = (s && typeof s === 'object') ? s : {}
      const t = src.telegram || {}
      const a = src.agent || {}
      const m = src.media || {}
      const tts = src.tts || {}
      return {
        enabled: src.enabled !== false,
        telegram: {
          enabled: t.enabled === true,
          allowedUserIds: Array.isArray(t.allowedUserIds) ? t.allowedUserIds : [],
          pollTimeoutSeconds: Number(t.pollTimeoutSeconds) || 50,
          pollIntervalMs: Number(t.pollIntervalMs) || 500,
          commands: Array.isArray(t.commands) ? t.commands : [],
          textFormat: t.textFormat === 'plain' ? 'plain' : 'html',
          homeChatId: t.homeChatId != null ? t.homeChatId : '',
          homeThreadId: Number(t.homeThreadId) || 0,
          homes: Array.isArray(t.homes) ? t.homes : [],
          pairingEnabled: t.pairingEnabled !== false,
          streaming: t.streaming === true,
          streamEditIntervalMs: Number(t.streamEditIntervalMs) || 1200,
          progressEnabled: t.progressEnabled !== false,
          approvalsEnabled: t.approvalsEnabled !== false,
          groupsEnabled: t.groupsEnabled !== false,
          groupRequireMention: t.groupRequireMention !== false,
          reactionsEnabled: t.reactionsEnabled !== false,
          statusIndicator: t.statusIndicator === true,
          statusOnline: t.statusOnline || 'Online',
          statusOffline: t.statusOffline || 'Offline',
          transport: t.transport === 'webhook' ? 'webhook' : 'poll',
          webhookUrl: t.webhookUrl || '',
          webhookPath: t.webhookPath || '/dsh-messenger-gateway/telegram/webhook',
          voiceMode: t.voiceMode || 'mirror',
          quickActions: t.quickActions === true,
          artifactPreviews: t.artifactPreviews !== false,
          notifyBridge: t.notifyBridge || { enabled: false, events: ['task_done', 'error'], home: 'default', excludeSessionPrefixes: ['msgw-'] },
          alerts: t.alerts || { enabled: false, chatId: '', threadId: 0, home: '', events: ['error', 'pairing'] },
          botToken: t.botToken || '',
          webhookSecret: t.webhookSecret || '',
        },
        agent: {
          provider: a.provider || '',
          model: a.model || '',
          instructionPrefix: a.instructionPrefix || '',
          maxMessageLength: Number(a.maxMessageLength) || 4000,
          turnTimeoutMs: Number(a.turnTimeoutMs) || 600000,
          idleTimeoutMs: Number(a.idleTimeoutMs) || 3600000,
          photoOnlyMode: a.photoOnlyMode || 'prompt',
          sessionScope: a.sessionScope || 'user',
        },
        media: {
          maxDocBytes: Number(m.maxDocBytes) || 20971520,
          maxImageBytes: Number(m.maxImageBytes) || 20971520,
          maxTextInjectBytes: Number(m.maxTextInjectBytes) || 102400,
        },
        tts: {
          enabled: tts.enabled === true,
          maxChars: Number(tts.maxChars) || 4000,
          voiceSummary: tts.voiceSummary === true,
        },
      }
    }

    function SettingsPage(props) {
      const ctx = props?.ctx
      const t = props?.t || makeT(props?.locale)

      const [token, setToken] = React.useState('')
      const [webhookSecret, setWebhookSecret] = React.useState('')
      const [allowText, setAllowText] = React.useState('')
      const [pending, setPending] = React.useState([])
      const [status, setStatus] = React.useState(null)
      const [smokeResult, setSmokeResult] = React.useState(null)
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [showAdvanced, setShowAdvanced] = React.useState(false)

      React.useEffect(() => {
        ensureCss()
      }, [])

      const scope = React.useMemo(() => {
        const settingsScope = ctx?.get?.('settingsScope') || ctx?.settingsScope
        return settingsScope ? settingsScope.bind({ namespace: NS }) : undefined
      }, [ctx])

      const snapshot = React.useSyncExternalStore(
        React.useMemo(() => (cb) => (scope ? scope.subscribe(cb) : () => {}), [scope]),
        React.useCallback(() => (scope ? scope.getSnapshot() : { status: 'loading' }), [scope]),
        React.useCallback(() => ({ status: 'loading' }), []),
      )

      const snapStatus = (snapshot && snapshot.status) || 'loading'
      const stored = (snapshot && snapshot.value) || {}
      const [cfg, setCfg] = React.useState(null)

      React.useEffect(() => {
        if (snapStatus === 'ready' && cfg === null) {
          setCfg(draftFromStored(stored))
          setAllowText(idsToText(stored?.telegram?.allowedUserIds))
        }
      }, [snapStatus, stored, cfg])

      const loadStatus = React.useCallback(async () => {
        try {
          const res = await fetch(`${ROUTE_PREFIX}/status`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.ok) {
            setStatus(data)
          }
        } catch (_) {}
      }, [])

      const loadPairing = React.useCallback(async () => {
        try {
          const res = await fetch(`${ROUTE_PREFIX}/pairing`, { credentials: 'same-origin', cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.ok) setPending(Array.isArray(data.pending) ? data.pending : [])
        } catch (_) {}
      }, [])

      React.useEffect(() => {
        loadStatus()
        loadPairing()
        const timer = setInterval(() => {
          loadStatus()
          loadPairing()
        }, 10000)
        return () => clearInterval(timer)
      }, [loadStatus, loadPairing])

      const handleSmoke = async () => {
        setBusy('smoke')
        setErr('')
        setMsg('')
        setSmokeResult(null)
        try {
          const res = await fetch(`${ROUTE_PREFIX}/smoke`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeoutMs: 8000 }),
          })
          const data = await res.json().catch(() => ({}))
          if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setSmokeResult(data)
          setMsg(t('diag.smoke_ok', { latency: data.latencyMs, username: data.botUsername, id: data.botId }))
          await loadStatus()
        } catch (e) {
          setErr(t('diag.smoke_err', { error: String(e.message || e) }))
        } finally {
          setBusy('')
        }
      }

      const mergePatch = (base, patch) => ({
        ...base,
        ...patch,
        telegram: { ...base.telegram, ...(patch.telegram || {}) },
        tts: { ...base.tts, ...(patch.tts || {}) },
        agent: { ...base.agent, ...(patch.agent || {}) },
        media: { ...base.media, ...(patch.media || {}) },
      })

      const save = async (patch = {}) => {
        if (!scope || !cfg) return
        setBusy('save')
        setErr('')
        setMsg('')
        try {
          let next = mergePatch(cfg, patch)
          if (token.trim()) next.telegram = { ...next.telegram, botToken: token.trim() }
          if (webhookSecret.trim()) next.telegram = { ...next.telegram, webhookSecret: webhookSecret.trim() }
          next.telegram.allowedUserIds = textToIds(allowText)

          const broken = []
          for (const key of SETTINGS_KEYS) {
            if (next[key] !== undefined) {
              try {
                await scope.set(key, next[key])
              } catch (e) {
                broken.push(key + ': ' + (e && e.message || String(e)))
              }
            }
          }
          if (broken.length) {
            setErr('Save failed — ' + broken.join('; '))
            return
          }
          setCfg(next)
          setToken('')
          setWebhookSecret('')
          setMsg(t('saved'))
          setTimeout(() => setMsg(''), 3000)
          await loadPairing()
          await loadStatus()
        } catch (e) {
          setErr(String(e.message || e))
        } finally {
          setBusy('')
        }
      }

      if (snapStatus === 'loading') {
        return React.createElement('div', { className: 'msgw-page' }, t('settings.loading'))
      }
      if (snapStatus !== 'ready') {
        return React.createElement('div', { className: 'msgw-page' },
          React.createElement('div', { className: 'msgw-banner-warning' }, t('settings.unavailable'))
        )
      }
      if (!cfg) {
        return React.createElement('div', { className: 'msgw-page' }, t('settings.loading'))
      }

      const isRunning = Boolean(status?.running)
      const botUsername = status?.botUsername || (status?.config?.telegram?.botUsername) || ''
      const hasToken = Boolean(status?.config?.telegram?.botTokenConfigured || cfg.telegram?.botTokenConfigured || token.trim())
      const transportMode = cfg.telegram?.transport || 'poll'
      const pendingCount = pending.length

      return React.createElement(
        'div',
        { className: 'msgw-page' },

        // Header with badges
        React.createElement(
          'div',
          { className: 'msgw-header' },
          React.createElement(
            'div',
            { className: 'msgw-page-title' },
            `💬 ${t('header.title')}`,
            React.createElement(
              'span',
              { className: `msgw-badge ${isRunning ? 'msgw-badge-ok' : 'msgw-badge-bad'}` },
              isRunning
                ? (botUsername ? t('badge.online', { username: botUsername }) : t('badge.running'))
                : t('badge.stopped')
            ),
            React.createElement(
              'span',
              { className: `msgw-badge ${hasToken ? 'msgw-badge-ok' : 'msgw-badge-warn'}` },
              hasToken ? t('badge.token_ok') : t('badge.token_missing')
            ),
            React.createElement(
              'span',
              { className: 'msgw-badge msgw-badge-ok' },
              t('badge.transport', { mode: transportMode })
            ),
            pendingCount > 0
              ? React.createElement(
                  'span',
                  { className: 'msgw-badge msgw-badge-warn' },
                  t('badge.pairing_count', { count: pendingCount })
                )
              : null
          ),
          React.createElement('div', { className: 'msgw-page-sub' }, t('header.sub'))
        ),

        // Global Alert banners
        err ? React.createElement('div', { className: 'msgw-alert-err' }, err) : null,
        msg ? React.createElement('div', { className: 'msgw-alert-ok' }, msg) : null,

        // Card 1: Telegram Connection & Bot
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'div',
            { className: 'msgw-section-title' },
            React.createElement('span', null, `🤖 ${t('telegram')}`),
            React.createElement(
              'button',
              {
                type: 'button',
                className: `msgw-btn msgw-btn-mini ${cfg.telegram.enabled ? 'msgw-btn-danger' : 'msgw-btn-primary'}`,
                disabled: !!busy,
                onClick: () => save({ telegram: { enabled: !cfg.telegram.enabled } }),
              },
              cfg.telegram.enabled ? t('disableTelegram') : t('enableTelegram')
            )
          ),
          React.createElement('div', { className: 'msgw-section-desc' }, t('telegramSub')),
          React.createElement(Field, { label: t('botToken'), hint: t('botTokenHint') },
            React.createElement('input', {
              type: 'password',
              className: 'msgw-input',
              value: token,
              placeholder: hasToken ? '••••••••••••••••••••' : '123456789:ABCdefGHI...',
              onChange: (e) => setToken(e.target.value),
            })
          ),
          React.createElement(Field, { label: t('allowedIds'), hint: t('allowedIdsHint') },
            React.createElement('textarea', {
              className: 'msgw-textarea',
              value: allowText,
              onChange: (e) => setAllowText(e.target.value),
              rows: 2,
              placeholder: '108191529, 987654321',
            })
          ),
          React.createElement(Field, { label: t('textFormat') },
            React.createElement(
              'select',
              {
                className: 'msgw-select',
                value: cfg.telegram?.textFormat || 'html',
                onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, textFormat: e.target.value } }),
              },
              React.createElement('option', { value: 'html' }, t('textFormatHtml')),
              React.createElement('option', { value: 'plain' }, t('textFormatPlain'))
            )
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.groupsEnabled !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, groupsEnabled: e.target.checked } }),
            }),
            t('groupsEnable')
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.groupRequireMention !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, groupRequireMention: e.target.checked } }),
            }),
            t('groupMention')
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.reactionsEnabled !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, reactionsEnabled: e.target.checked } }),
            }),
            t('reactionsEnable')
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.progressEnabled !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, progressEnabled: e.target.checked } }),
            }),
            t('progressEnable')
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.quickActions !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, quickActions: e.target.checked } }),
            }),
            t('quickActions')
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: cfg.telegram?.artifactPreviews !== false,
              onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, artifactPreviews: e.target.checked } }),
            }),
            t('artifactPreviews')
          )
        ),

        // Card 2: Diagnostics & Telegram Smoke Test
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement('div', { className: 'msgw-section-title' }, t('diag.title')),
          React.createElement('div', { className: 'msgw-section-desc' }, t('diag.desc')),
          React.createElement(
            'div',
            { className: 'msgw-row' },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'msgw-btn msgw-btn-primary',
                disabled: !!busy || !hasToken,
                onClick: handleSmoke,
              },
              busy === 'smoke' ? t('diag.smoke_testing') : t('diag.smoke_btn')
            )
          ),
          smokeResult
            ? React.createElement(
                'div',
                { className: 'msgw-preview' },
                `✅ Latency: ${smokeResult.latencyMs} ms | Bot: @${smokeResult.botUsername || 'unknown'} (ID: ${smokeResult.botId})`
              )
            : null
        ),

        // Card 3: Telemetry & Gateway Counters
        status?.stats ? React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement('div', { className: 'msgw-section-title' }, t('stats.title')),
          React.createElement('div', { className: 'msgw-section-desc' }, t('stats.desc')),
          React.createElement(
            'div',
            { className: 'msgw-stat-grid' },
            React.createElement(
              'div',
              { className: 'msgw-stat-box' },
              React.createElement('div', { className: 'msgw-stat-val' }, String(status.stats.sent || 0)),
              React.createElement('div', { className: 'msgw-stat-lbl' }, t('stats.sent'))
            ),
            React.createElement(
              'div',
              { className: 'msgw-stat-box' },
              React.createElement('div', { className: 'msgw-stat-val' }, String(status.stats.errors || 0)),
              React.createElement('div', { className: 'msgw-stat-lbl' }, t('stats.errors'))
            ),
            React.createElement(
              'div',
              { className: 'msgw-stat-box' },
              React.createElement('div', { className: 'msgw-stat-val' }, String(status.activeChats || 0)),
              React.createElement('div', { className: 'msgw-stat-lbl' }, t('stats.active_chats'))
            ),
            React.createElement(
              'div',
              { className: 'msgw-stat-box' },
              React.createElement('div', { className: 'msgw-stat-val' }, `${status.uptimeSec || 0}s`),
              React.createElement('div', { className: 'msgw-stat-lbl' }, t('stats.uptime'))
            )
          )
        ) : null,

        // Card 4: Agent & Turn Execution
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement('div', { className: 'msgw-section-title' }, `🧠 ${t('agent')}`),
          React.createElement('div', { className: 'msgw-section-desc' }, t('agentSub')),
          React.createElement(Field, { label: t('provider'), hint: t('providerHint') },
            React.createElement('input', {
              className: 'msgw-input',
              value: cfg.agent?.provider || '',
              onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, provider: e.target.value } }),
            })
          ),
          React.createElement(Field, { label: t('model'), hint: t('modelHint') },
            React.createElement('input', {
              className: 'msgw-input',
              value: cfg.agent?.model || '',
              onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, model: e.target.value } }),
            })
          ),
          React.createElement(Field, { label: t('photoOnly') },
            React.createElement(
              'select',
              {
                className: 'msgw-select',
                value: cfg.agent?.photoOnlyMode || 'prompt',
                onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, photoOnlyMode: e.target.value } }),
              },
              React.createElement('option', { value: 'prompt' }, t('photoPrompt')),
              React.createElement('option', { value: 'run' }, t('photoRun'))
            )
          ),
          React.createElement(Field, { label: t('sessionScope') },
            React.createElement(
              'select',
              {
                className: 'msgw-select',
                value: cfg.agent?.sessionScope || 'user',
                onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, sessionScope: e.target.value } }),
              },
              React.createElement('option', { value: 'user' }, t('sessionScopeUser')),
              React.createElement('option', { value: 'chat' }, t('sessionScopeChat'))
            )
          ),
          React.createElement(Field, { label: t('instruction'), hint: t('instructionHint') },
            React.createElement('textarea', {
              className: 'msgw-textarea',
              value: cfg.agent?.instructionPrefix || '',
              onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, instructionPrefix: e.target.value } }),
              rows: 3,
              placeholder: t('instructionPlaceholder'),
            })
          ),
          React.createElement(Field, { label: t('maxMessageLength') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 500,
              max: 8000,
              value: cfg.agent?.maxMessageLength ?? 4000,
              onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, maxMessageLength: Number(e.target.value) || 4000 } }),
            })
          ),
          React.createElement(Field, { label: t('turnTimeout') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 30,
              max: 3600,
              value: Math.round((cfg.agent?.turnTimeoutMs ?? 600000) / 1000),
              onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, turnTimeoutMs: (Number(e.target.value) || 600) * 1000 } }),
            })
          )
        ),

        // Card 5: Media & TTS
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement('div', { className: 'msgw-section-title' }, `📎 ${t('media')}`),
          React.createElement('div', { className: 'msgw-section-desc' }, t('mediaSub')),
          React.createElement(Field, { label: t('maxDocMb') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 1,
              max: 50,
              value: bytesToMb(cfg.media?.maxDocBytes),
              onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxDocBytes: mbToBytes(e.target.value) } }),
            })
          ),
          React.createElement(Field, { label: t('maxImageMb') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 1,
              max: 50,
              value: bytesToMb(cfg.media?.maxImageBytes),
              onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxImageBytes: mbToBytes(e.target.value) } }),
            })
          ),
          React.createElement(Field, { label: t('maxTextKb') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 16,
              max: 512,
              value: Math.round((cfg.media?.maxTextInjectBytes ?? 102400) / 1024),
              onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxTextInjectBytes: (Number(e.target.value) || 100) * 1024 } }),
            })
          ),
          React.createElement('div', { style: { height: '8px' } }),
          React.createElement('div', { className: 'msgw-section-title' }, `🔊 ${t('tts')}`),
          React.createElement('div', { className: 'msgw-section-desc' }, t('ttsSub')),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!cfg.tts?.enabled,
              onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, enabled: e.target.checked } }),
            }),
            t('ttsEnable')
          ),
          cfg.tts?.enabled ? React.createElement(Field, { label: t('ttsMaxChars') },
            React.createElement('input', {
              type: 'number',
              className: 'msgw-input',
              min: 100,
              max: 8000,
              value: cfg.tts?.maxChars ?? 4000,
              onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, maxChars: Number(e.target.value) || 4000 } }),
            })
          ) : null,
          React.createElement(Field, { label: t('voiceMode') },
            React.createElement(
              'select',
              {
                className: 'msgw-select',
                value: cfg.telegram?.voiceMode || 'mirror',
                onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, voiceMode: e.target.value } }),
              },
              React.createElement('option', { value: 'mirror' }, t('voiceModeMirror')),
              React.createElement('option', { value: 'always' }, t('voiceModeAlways')),
              React.createElement('option', { value: 'off' }, t('voiceModeOff'))
            )
          )
        ),

        // Card 6: Pairing Requests
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'div',
            { className: 'msgw-section-title' },
            React.createElement('span', null, `🔑 ${t('pairing')}`),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'msgw-btn msgw-btn-mini',
                disabled: !!busy,
                onClick: loadPairing,
              },
              t('pairingRefresh')
            )
          ),
          React.createElement('div', { className: 'msgw-section-desc' }, t('pairingSub')),
          !(pending && pending.length)
            ? React.createElement('div', { className: 'msgw-hint' }, t('pairingEmpty'))
            : React.createElement(
                'table',
                { className: 'msgw-table' },
                React.createElement(
                  'tbody',
                  null,
                  pending.map((row) =>
                    React.createElement(
                      'tr',
                      { key: row.code },
                      React.createElement('td', null, row.username ? `@${row.username}` : '—'),
                      React.createElement('td', null, `ID: ${row.userId}`),
                      React.createElement('td', { style: { fontFamily: 'monospace', fontWeight: 600 } }, row.code),
                      React.createElement(
                        'td',
                        { style: { textAlign: 'right' } },
                        React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'msgw-btn msgw-btn-mini msgw-btn-primary',
                            style: { marginRight: '6px' },
                            disabled: !!busy,
                            onClick: async () => {
                              setBusy('approve')
                              setErr('')
                              try {
                                const res = await fetch(`${ROUTE_PREFIX}/pairing/approve`, {
                                  method: 'POST',
                                  credentials: 'same-origin',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ code: row.code }),
                                })
                                const data = await res.json()
                                if (!res.ok || !data.ok) throw new Error(data.error || res.status)
                                await loadPairing()
                              } catch (e) {
                                setErr(String(e.message || e))
                              } finally {
                                setBusy('')
                              }
                            },
                          },
                          t('pairingApprove')
                        ),
                        React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'msgw-btn msgw-btn-mini msgw-btn-danger',
                            disabled: !!busy,
                            onClick: async () => {
                              setBusy('reject')
                              setErr('')
                              try {
                                const res = await fetch(`${ROUTE_PREFIX}/pairing/reject`, {
                                  method: 'POST',
                                  credentials: 'same-origin',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ code: row.code }),
                                })
                                const data = await res.json()
                                if (!res.ok || !data.ok) throw new Error(data.error || res.status)
                                await loadPairing()
                              } catch (e) {
                                setErr(String(e.message || e))
                              } finally {
                                setBusy('')
                              }
                            },
                          },
                          t('pairingReject')
                        )
                      )
                    )
                  )
                )
              )
        ),

        // Card 7: Advanced Connection & Webhook
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'msgw-btn',
              style: { width: '100%', justifyContent: 'space-between' },
              onClick: () => setShowAdvanced((v) => !v),
            },
            React.createElement('span', null, showAdvanced ? t('hideAdvanced') : t('showAdvanced')),
            React.createElement('span', { style: { transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform .16s' } },
              React.createElement(Chevron)
            )
          ),
          showAdvanced ? React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' } },
            React.createElement(Field, { label: t('transport') },
              React.createElement(
                'select',
                {
                  className: 'msgw-select',
                  value: cfg.telegram?.transport || 'poll',
                  onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, transport: e.target.value } }),
                },
                React.createElement('option', { value: 'poll' }, t('transportPoll')),
                React.createElement('option', { value: 'webhook' }, t('transportWebhook'))
              )
            ),
            React.createElement(Field, { label: t('webhookUrl'), hint: t('webhookUrlHint') },
              React.createElement('input', {
                className: 'msgw-input',
                value: cfg.telegram?.webhookUrl || '',
                onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, webhookUrl: e.target.value } }),
              })
            ),
            React.createElement(Field, { label: t('webhookSecret'), hint: t('webhookSecretHint') },
              React.createElement('input', {
                type: 'password',
                className: 'msgw-input',
                value: webhookSecret,
                placeholder: cfg.telegram?.webhookSecretConfigured ? '••••••••••••••••' : '',
                onChange: (e) => setWebhookSecret(e.target.value),
              })
            ),
            React.createElement(Field, { label: t('pollTimeout') },
              React.createElement('input', {
                type: 'number',
                className: 'msgw-input',
                min: 10,
                max: 60,
                value: cfg.telegram?.pollTimeoutSeconds ?? 50,
                onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollTimeoutSeconds: Number(e.target.value) || 50 } }),
              })
            ),
            React.createElement(Field, { label: t('pollInterval') },
              React.createElement('input', {
                type: 'number',
                className: 'msgw-input',
                min: 100,
                max: 5000,
                value: cfg.telegram?.pollIntervalMs ?? 500,
                onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollIntervalMs: Number(e.target.value) || 500 } }),
              })
            ),
            React.createElement(Field, { label: t('idleTimeout') },
              React.createElement('input', {
                type: 'number',
                className: 'msgw-input',
                min: 300,
                max: 86400,
                value: Math.round((cfg.agent?.idleTimeoutMs ?? 3600000) / 1000),
                onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, idleTimeoutMs: (Number(e.target.value) || 3600) * 1000 } }),
              })
            )
          ) : null
        ),

        // Sticky Footer
        React.createElement(
          'div',
          {
            className: 'msgw-foot',
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '12px',
              borderTop: '1px solid var(--dsw-alias-border-l2)',
            },
          },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'msgw-btn msgw-btn-primary',
              disabled: !!busy,
              onClick: () => save({}),
            },
            busy === 'save' ? t('saving') : t('save')
          )
        )
      )
    }

    function PluginCard(props) {
      const [open, setOpen] = React.useState(false)
      const t = props?.t || makeT(props?.locale)
      React.useEffect(() => {
        ensureCss()
      }, [])

      return React.createElement(
        'li',
        { className: 'msgw-card msgw-section-card', style: { listStyle: 'none', marginBottom: '12px' } },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'msgw-head',
            style: {
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: 0,
              textAlign: 'left',
            },
            'aria-expanded': open,
            onClick: () => setOpen((v) => !v),
          },
          React.createElement(
            'div',
            { className: 'msgw-headText', style: { flex: 1 } },
            React.createElement('div', { className: 'msgw-title', style: { fontWeight: 600, fontSize: '15px' } }, t('title')),
            React.createElement('div', { className: 'msgw-sub', style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' } }, t('description'))
          ),
          React.createElement(
            'span',
            { className: 'msgw-chev', style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .16s' } },
            React.createElement(Chevron)
          )
        ),
        open
          ? React.createElement(
              'div',
              { className: 'msgw-body', style: { marginTop: '16px' } },
              React.createElement(
                ErrorBoundary,
                null,
                React.createElement(SettingsPage, { ...props, ctx: (props && props.ctx) || ctx, t })
              )
            )
          : null
      )
    }

    function refreshMirrorUntilVisible(ctx) {
      const visible = () => {
        try {
          const s = (ctx?.get && ctx.get('lanSettings')) || (ctx?.get && ctx.get('settingsScope')) || ctx?.settingsScope
          const view = s?.describe?.()?.getSnapshot?.()?.view
          return !!view && Array.isArray(view.namespaces) && view.namespaces.some((row) => row.ns === NS)
        } catch (_) {
          return false
        }
      }
      if (visible()) return () => {}
      let tries = 0
      const timer = setInterval(() => {
        if (visible() || tries >= 15) { clearInterval(timer); return }
        tries += 1
        try {
          const s = (ctx?.get && ctx.get('lanSettings')) || (ctx?.get && ctx.get('settingsScope')) || ctx?.settingsScope
          s?.describe?.()?.load?.()
        } catch (_) {}
      }, 1000)
      return () => clearInterval(timer)
    }

    function apply(ctx) {
      try {
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => {
            try {
              const loc = ctx?.get?.('locale') || ctx?.locale
              if (loc?.register) {
                loc.register(NS, { en, ru })
              }
            } catch (taken) {
              console.warn('[dsh-messenger-gateway] словарь уже зарегистрирован:', taken && taken.message)
            }
          }, 'dsh-messenger-gateway: dictionaries')
        } else {
          const loc = ctx?.get?.('locale') || ctx?.locale
          if (loc?.register) {
            loc.register(NS, { en, ru })
          }
        }
      } catch (err) {
        console.warn('[dsh-messenger-gateway] ошибка регистрации словаря:', err && err.message)
      }

      if (typeof ctx.effect === 'function') {
        ctx.effect(
          () => refreshMirrorUntilVisible(ctx),
          'dsh-messenger-gateway: re-read the settings mirror until our namespace appears',
        )
      }

      function registerSlotWhenReady(slotName, registerFn) {
        const slots = ctx?.get?.('slots') || ctx?.slots
        if (!slots) return
        if (typeof slots.inject === 'function') {
          try {
            slots.inject(slotName, () => {
              try {
                return registerFn()
              } catch (err) {
                console.warn('[dsh-messenger-gateway] Error registering slot ' + slotName + ':', err)
              }
            })
            return
          } catch (err) {
            console.warn('[dsh-messenger-gateway] Failed to inject slot ' + slotName + ':', err)
          }
        }
        if (typeof slots.register === 'function') {
          try {
            registerFn()
          } catch (err) {
            console.warn('[dsh-messenger-gateway] Failed direct registration for ' + slotName + ':', err)
          }
        }
      }

      registerSlotWhenReady('settings.plugin.item', () => {
        const slots = ctx?.get?.('slots') || ctx?.slots
        return slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            inject: () => ({ ctx }),
          },
          (props) => React.createElement(ErrorBoundary, null, React.createElement(PluginCard, { ...props, ctx: (props && props.ctx) || ctx }))
        )
      })
    }

    module.exports = { apply, inject: ['slots', 'locale', 'settingsScope'] }
    return module.exports
  },
})
