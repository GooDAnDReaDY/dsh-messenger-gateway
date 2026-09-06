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

const css =
      '.msgw-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}' +
      '.msgw-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}' +
      '.msgw-headText{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}' +
      '.msgw-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.msgw-sub{color:var(--dsw-alias-label-secondary);font-size:13px}' +
      '.msgw-chev{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}' +
      '.msgw-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}' +
      '.msgw-form{display:flex;flex-direction:column;max-width:760px}' +
      '.msgw-section{display:flex;flex-direction:column}' +
      '.msgw-groupTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;padding:12px 0 0}' +
      '.msgw-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}' +
      '.msgw-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}' +
      '.msgw-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.msgw-input,.msgw-select,.msgw-textarea{width:100%;box-sizing:border-box;height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font:inherit;font-size:13px}' +
      '.msgw-textarea{height:auto;min-height:72px;padding:8px 12px}' +
      '.msgw-check{display:flex;gap:8px;align-items:center;padding:12px 0;color:var(--dsw-alias-label-primary);font-size:13px}' +
      '.msgw-linkbtn{appearance:none;font:inherit;cursor:pointer;background:0 0;border:0;color:var(--dsw-alias-label-secondary);font-size:13px;padding:8px 0;text-align:left}' +
      '.msgw-err{color:var(--dsw-alias-state-error-primary);font-size:12px;padding:8px 0}' +
      '.msgw-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}' +
      '.msgw-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}' +
      '.msgw-save:disabled{opacity:.5;cursor:default}' +
      '.msgw-ghost{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 14px;font-size:13px;background:0 0;color:var(--dsw-alias-label-primary)}' +
      '.msgw-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;color:var(--dsw-alias-label-primary)}' +
      '.msgw-rowActions{display:flex;gap:6px;flex-shrink:0}' +
      '.msgw-mini{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 10px;font-size:12px;background:0 0;color:var(--dsw-alias-label-primary)}'
    const tagId = 'dsh-messenger-gateway/settings-card.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = NS
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const en = {
      title: 'Messenger gateway',
      description: 'Telegram bot: text, voice, photos and documents.',
      loading: 'Loading…',
      save: 'Save',
      saved: 'Saved',
      saving: 'Saving…',
      showAdvanced: 'Advanced settings',
      hideAdvanced: 'Hide advanced',
      telegram: 'Telegram',
      agent: 'Agent',
      media: 'Media',
      tts: 'Voice replies',
      advanced: 'Telegram polling',
      botToken: 'Bot token (write-only)',
      botTokenHint: 'Leave empty to keep the current token',
      allowedIds: 'Allowed user ids',
      allowedIdsHint: 'Comma-separated. Empty = all users',
      textFormat: 'Text format',
      textFormatHtml: 'Markdown → Telegram HTML',
      textFormatPlain: 'Plain text',
      disableTelegram: 'Disable Telegram',
      enableTelegram: 'Enable Telegram',
      provider: 'Provider',
      providerHint: 'Empty = DSH default',
      model: 'Model',
      modelHint: 'Empty = DSH default',
      photoOnly: 'Photo without caption',
      photoPrompt: 'Wait for question (recommended)',
      photoRun: 'Reply immediately',
      instruction: 'Extra agent instruction',
      instructionHint: 'Prepended to each messenger message',
      instructionPlaceholder: 'Empty = built-in relay (Russian, no reasoning)',
      maxMessageLength: 'Max reply length (chars)',
      turnTimeout: 'Agent turn timeout (sec)',
      maxDocMb: 'Max document size (MB)',
      maxImageMb: 'Max photo size (MB)',
      maxTextKb: 'Max text from document (KB)',
      ttsEnable: 'Voice replies via dsh-tts',
      ttsMaxChars: 'Max spoken chars',
      pollTimeout: 'pollTimeoutSeconds',
      pollInterval: 'pollIntervalMs',
      idleTimeout: 'idle timeout (sec)',
      pairing: 'Pairing requests',
      pairingEmpty: 'No pending codes',
      pairingApprove: 'Approve',
      pairingReject: 'Reject',
      pairingRefresh: 'Refresh',
      groupsEnable: 'Respond in groups',
      groupMention: 'Groups require @mention / reply / command',
      reactionsEnable: 'React while processing (👀)',
      progressEnable: 'Progress message (thinking → delete → final)',
      statusIndicator: 'Status indicator (Online/Offline)',
      statusIndicatorHint: 'Sets the bot short description; bots have no presence dot. Opt-in, visible to all users.',
      transport: 'Transport',
      transportPoll: 'Long poll (getUpdates)',
      transportWebhook: 'Webhook',
      webhookUrl: 'Public webhook URL',
      webhookUrlHint: 'Full HTTPS URL Telegram will POST to',
      webhookSecret: 'Webhook secret (write-only)',
      webhookSecretHint: 'Leave empty to keep current',
      sessionScope: 'Group session scope',
      sessionScopeChat: 'Shared per chat/topic',
      sessionScopeUser: 'Per user (recommended)',
      voiceMode: 'Voice replies mode',
      voiceModeMirror: 'Mirror inbound voice',
      voiceModeAlways: 'Always try TTS',
      voiceModeOff: 'Off (unless /voice on)',
      notifyBridge: 'Notify → Telegram home',
      notifyBridgeHint: 'task_done/error from web sessions (not msgw-*)',
      notifyHome: 'Notify home name',
      quickActions: 'Quick actions keyboard (/new, /stop, /voice, /status)',
      artifactPreviews: 'Render diagram and table previews',
    }
    const ru = {
      title: 'Messenger gateway',
      description: 'Telegram-бот: текст, голос, фото и документы.',
      loading: 'Загрузка…',
      save: 'Сохранить',
      saved: 'Сохранено',
      saving: 'Сохранение…',
      showAdvanced: 'Расширенные настройки',
      hideAdvanced: 'Скрыть расширенные',
      telegram: 'Telegram',
      agent: 'Агент',
      media: 'Медиа',
      tts: 'Голосовые ответы',
      advanced: 'Polling Telegram',
      botToken: 'Bot token (только запись)',
      botTokenHint: 'Оставьте пустым, чтобы не менять',
      allowedIds: 'Разрешённые user id',
      allowedIdsHint: 'Через запятую. Пусто = все пользователи',
      textFormat: 'Формат текста',
      textFormatHtml: 'Markdown → Telegram HTML',
      textFormatPlain: 'Простой текст',
      disableTelegram: 'Выключить Telegram',
      enableTelegram: 'Включить Telegram',
      provider: 'Provider',
      providerHint: 'Пусто = провайдер по умолчанию DSH',
      model: 'Model',
      modelHint: 'Пусто = модель по умолчанию',
      photoOnly: 'Фото без подписи',
      photoPrompt: 'Ждать вопрос (рекомендуется)',
      photoRun: 'Отвечать сразу',
      instruction: 'Доп. инструкция агенту',
      instructionHint: 'Добавляется к каждому сообщению из мессенджера',
      instructionPlaceholder: 'Пусто = встроенная инструкция (русский, без рассуждений)',
      maxMessageLength: 'Макс. длина ответа (символов)',
      turnTimeout: 'Таймаут хода агента (сек)',
      maxDocMb: 'Макс. размер документа (МБ)',
      maxImageMb: 'Макс. размер фото (МБ)',
      maxTextKb: 'Макс. текст из документа (КБ)',
      ttsEnable: 'Голосовые ответы (dsh-tts)',
      ttsMaxChars: 'Макс. символов для озвучки',
      pollTimeout: 'pollTimeoutSeconds',
      pollInterval: 'pollIntervalMs',
      idleTimeout: 'idle timeout (сек)',
      pairing: 'Запросы сопряжения',
      pairingEmpty: 'Нет ожидающих кодов',
      pairingApprove: 'Одобрить',
      pairingReject: 'Отклонить',
      pairingRefresh: 'Обновить',
      groupsEnable: 'Отвечать в группах',
      groupMention: 'В группах только @mention / reply / команда',
      reactionsEnable: 'Реакция 👀 пока думает',
      progressEnable: 'Прогресс: думаю → удалить → финальный ответ',
      statusIndicator: 'Индикатор статуса (Online/Offline)',
      statusIndicatorHint: 'Меняет short description бота (у ботов нет точки присутствия). Опцionalно, видно всем.',
      transport: 'Транспорт',
      transportPoll: 'Long poll (getUpdates)',
      transportWebhook: 'Webhook',
      webhookUrl: 'Публичный URL webhook',
      webhookUrlHint: 'Полный HTTPS URL, куда Telegram шлёт обновления',
      webhookSecret: 'Webhook secret (только запись)',
      webhookSecretHint: 'Пусто = не менять',
      sessionScope: 'Сессии в группах',
      sessionScopeChat: 'Общая на чат/топик',
      sessionScopeUser: 'На каждого user (реком.)',
      voiceMode: 'Голосовые ответы',
      voiceModeMirror: 'Как входящее (mirror)',
      voiceModeAlways: 'Всегда TTS',
      voiceModeOff: 'Выкл (кроме /voice on)',
      notifyBridge: 'Notify → Telegram home',
      notifyBridgeHint: 'task_done/error из web-сессий (не msgw-*)',
      notifyHome: 'Имя home для notify',
      quickActions: 'Быстрая клавиатура (/new, /stop, /voice, /status)',
      artifactPreviews: 'Превью артефактов (диаграммы и таблицы)',
    }

    function useActiveLocale(ctx) {
      return React.useSyncExternalStore(
        React.useMemo(() => (cb) => (ctx?.locale ? ctx.locale.subscribe(cb) : () => {}), [ctx]),
        React.useCallback(() => {
          if (ctx?.locale) {
            const active = ctx.locale.getSnapshot().active
            if (typeof active === 'string' && active) return active
          }
          return typeof navigator !== 'undefined' ? String(navigator.language || '').slice(0, 2) : 'en'
        }, [ctx]),
      )
    }

    function makeT(locale) {
      const DICT = String(locale || '').startsWith('ru') ? ru : en
      return (key) => DICT[key] || en[key] || key
    }

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

    function MessengerSettingsForm({ t, ctx }) {
      const [token, setToken] = React.useState('')
      const [webhookSecret, setWebhookSecret] = React.useState('')
      const [allowText, setAllowText] = React.useState('')
      const [pending, setPending] = React.useState([])
      const [err, setErr] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [showAdvanced, setShowAdvanced] = React.useState(false)

      const scope = React.useMemo(
        () => (ctx && ctx.settingsScope ? ctx.settingsScope.bind({ namespace: NS }) : undefined),
        [ctx],
      )

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

      const loadPairing = React.useCallback(async () => {
        try {
          const res = await fetch('/dsh-messenger-gateway/pairing', { credentials: 'same-origin' })
          const data = await res.json()
          if (res.ok && data.ok) setPending(Array.isArray(data.pending) ? data.pending : [])
        } catch {}
      }, [])

      React.useEffect(() => {
        if (snapStatus === 'ready') loadPairing()
      }, [snapStatus, loadPairing])

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
        setBusy(true); setErr(''); setMsg('')
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
        } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
      }

      if (snapStatus === 'loading') {
        return React.createElement('div', { className: 'msgw-sub', style: { padding: '12px 0' } }, t('loading'))
      }
      if (snapStatus !== 'ready') {
        return React.createElement('div', { className: 'msgw-err', style: { padding: '12px 0' } },
          'Settings unavailable (snapshot status: ' + snapStatus + '). Host namespace may be missing.')
      }
      if (!cfg) {
        return React.createElement('div', { className: 'msgw-sub', style: { padding: '12px 0' } }, t('loading'))
      }

      return React.createElement('div', { className: 'msgw-form' },
        React.createElement('div', null,
          React.createElement('div', { className: 'msgw-groupTitle' }, t('telegram')),
          React.createElement(Field, { label: t('botToken'), hint: t('botTokenHint') },
            React.createElement('input', { type: 'password', className: 'msgw-input', value: token, placeholder: cfg.telegram?.botTokenConfigured ? '••••••••' : 'BotFather', onChange: (e) => setToken(e.target.value) }),
          ),
          React.createElement(Field, { label: t('allowedIds'), hint: t('allowedIdsHint') },
            React.createElement('textarea', { className: 'msgw-textarea', value: allowText, onChange: (e) => setAllowText(e.target.value), rows: 2 }),
          ),
          React.createElement(Field, { label: t('textFormat') },
            React.createElement('select', { className: 'msgw-select', value: cfg.telegram?.textFormat || 'html', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, textFormat: e.target.value } }) },
              React.createElement('option', { value: 'html' }, t('textFormatHtml')),
              React.createElement('option', { value: 'plain' }, t('textFormatPlain')),
            ),
          ),
          React.createElement('button', { type: 'button', className: 'msgw-ghost', disabled: busy, onClick: () => save({ telegram: { enabled: !cfg.telegram.enabled } }) }, cfg.telegram.enabled ? t('disableTelegram') : t('enableTelegram')),
        ),

        React.createElement('div', { className: 'msgw-section' },
          React.createElement('div', { className: 'msgw-groupTitle' }, t('agent')),
          React.createElement(Field, { label: t('provider'), hint: t('providerHint') },
            React.createElement('input', { className: 'msgw-input', value: cfg.agent?.provider || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, provider: e.target.value } }) }),
          ),
          React.createElement(Field, { label: t('model'), hint: t('modelHint') },
            React.createElement('input', { className: 'msgw-input', value: cfg.agent?.model || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, model: e.target.value } }) }),
          ),
          React.createElement(Field, { label: t('photoOnly') },
            React.createElement('select', { className: 'msgw-select', value: cfg.agent?.photoOnlyMode || 'prompt', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, photoOnlyMode: e.target.value } }) },
              React.createElement('option', { value: 'prompt' }, t('photoPrompt')),
              React.createElement('option', { value: 'run' }, t('photoRun')),
            ),
          ),
          React.createElement(Field, { label: t('sessionScope') },
            React.createElement('select', { className: 'msgw-select', value: cfg.agent?.sessionScope || 'user', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, sessionScope: e.target.value } }) },
              React.createElement('option', { value: 'user' }, t('sessionScopeUser')),
              React.createElement('option', { value: 'chat' }, t('sessionScopeChat')),
            ),
          ),
          React.createElement(Field, { label: t('instruction'), hint: t('instructionHint') },
            React.createElement('textarea', { className: 'msgw-textarea', value: cfg.agent?.instructionPrefix || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, instructionPrefix: e.target.value } }), rows: 3, placeholder: t('instructionPlaceholder') }),
          ),
          React.createElement(Field, { label: t('maxMessageLength') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 500, max: 8000, value: cfg.agent?.maxMessageLength ?? 4000, onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, maxMessageLength: Number(e.target.value) || 4000 } }) }),
          ),
          React.createElement(Field, { label: t('turnTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 30, max: 3600, value: Math.round((cfg.agent?.turnTimeoutMs ?? 600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, turnTimeoutMs: (Number(e.target.value) || 600) * 1000 } }) }),
          ),
        ),

        React.createElement('div', { className: 'msgw-section' },
          React.createElement('div', { className: 'msgw-groupTitle' }, t('media')),
          React.createElement(Field, { label: t('maxDocMb') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 1, max: 50, value: bytesToMb(cfg.media?.maxDocBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxDocBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: t('maxImageMb') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 1, max: 50, value: bytesToMb(cfg.media?.maxImageBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxImageBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: t('maxTextKb') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 16, max: 512, value: Math.round((cfg.media?.maxTextInjectBytes ?? 102400) / 1024), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxTextInjectBytes: (Number(e.target.value) || 100) * 1024 } }) }),
          ),
        ),

        React.createElement('div', { className: 'msgw-section' },
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: !!cfg.tts?.enabled, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, enabled: e.target.checked } }) }),
            t('ttsEnable'),
          ),
          cfg.tts?.enabled ? React.createElement(Field, { label: t('ttsMaxChars') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 100, max: 8000, value: cfg.tts?.maxChars ?? 4000, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, maxChars: Number(e.target.value) || 4000 } }) }),
          ) : null,
        ),

        React.createElement('div', { className: 'msgw-section' },
          React.createElement('div', { className: 'msgw-groupTitle' }, t('pairing')),
          React.createElement('button', { type: 'button', className: 'msgw-linkbtn', disabled: busy, onClick: () => loadPairing() }, t('pairingRefresh')),
          !(pending && pending.length) ? React.createElement('div', { className: 'msgw-hint' }, t('pairingEmpty')) : pending.map((row) =>
            React.createElement('div', { key: row.code, className: 'msgw-row' },
              React.createElement('div', null, (row.username ? '@' + row.username + ' · ' : '') + 'id ' + row.userId + ' · ' + row.code),
              React.createElement('div', { className: 'msgw-rowActions' },
                React.createElement('button', {
                  type: 'button', className: 'msgw-mini', disabled: busy, onClick: async () => {
                    setBusy(true); setErr('')
                    try {
                      const res = await fetch('/dsh-messenger-gateway/pairing/approve', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: row.code }),
                      })
                      const data = await res.json()
                      if (!res.ok || !data.ok) throw new Error(data.error || res.status)
                      await load()
                    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
                  },
                }, t('pairingApprove')),
                React.createElement('button', {
                  type: 'button', className: 'msgw-mini', disabled: busy, onClick: async () => {
                    setBusy(true); setErr('')
                    try {
                      const res = await fetch('/dsh-messenger-gateway/pairing/reject', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: row.code }),
                      })
                      const data = await res.json()
                      if (!res.ok || !data.ok) throw new Error(data.error || res.status)
                      await loadPairing()
                    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
                  },
                }, t('pairingReject')),
              ),
            ),
          ),
        ),

        React.createElement('div', { className: 'msgw-section' },
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.groupsEnabled !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, groupsEnabled: e.target.checked } }) }),
            t('groupsEnable'),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.groupRequireMention !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, groupRequireMention: e.target.checked } }) }),
            t('groupMention'),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.reactionsEnabled !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, reactionsEnabled: e.target.checked } }) }),
            t('reactionsEnable'),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.progressEnabled !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, progressEnabled: e.target.checked } }) }),
            t('progressEnable'),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.statusIndicator === true, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, statusIndicator: e.target.checked } }) }),
            t('statusIndicator'),
          ),
          React.createElement('div', { className: 'msgw-hint' }, t('statusIndicatorHint')),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.quickActions !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, quickActions: e.target.checked } }) }),
            t('quickActions'),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: cfg.telegram?.artifactPreviews !== false, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, artifactPreviews: e.target.checked } }) }),
            t('artifactPreviews'),
          ),
          React.createElement(Field, { label: t('voiceMode') },
            React.createElement('select', { className: 'msgw-select', value: cfg.telegram?.voiceMode || 'mirror', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, voiceMode: e.target.value } }) },
              React.createElement('option', { value: 'mirror' }, t('voiceModeMirror')),
              React.createElement('option', { value: 'always' }, t('voiceModeAlways')),
              React.createElement('option', { value: 'off' }, t('voiceModeOff')),
            ),
          ),
          React.createElement('label', { className: 'msgw-check' },
            React.createElement('input', { type: 'checkbox', checked: !!cfg.telegram?.notifyBridge?.enabled, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, notifyBridge: { ...(cfg.telegram.notifyBridge || {}), enabled: e.target.checked } } }) }),
            t('notifyBridge'),
          ),
          React.createElement('div', { className: 'msgw-hint' }, t('notifyBridgeHint')),
          React.createElement(Field, { label: t('notifyHome') },
            React.createElement('input', { className: 'msgw-input', value: cfg.telegram?.notifyBridge?.home || 'default', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, notifyBridge: { ...(cfg.telegram.notifyBridge || {}), home: e.target.value } } }) }),
          ),
        ),

        React.createElement('button', { type: 'button', className: 'msgw-linkbtn', onClick: () => setShowAdvanced((v) => !v) }, showAdvanced ? t('hideAdvanced') : t('showAdvanced')),
        showAdvanced ? React.createElement('div', { className: 'msgw-section' },
          React.createElement('div', { className: 'msgw-groupTitle' }, t('advanced')),
          React.createElement(Field, { label: t('transport') },
            React.createElement('select', { className: 'msgw-select', value: cfg.telegram?.transport || 'poll', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, transport: e.target.value } }) },
              React.createElement('option', { value: 'poll' }, t('transportPoll')),
              React.createElement('option', { value: 'webhook' }, t('transportWebhook')),
            ),
          ),
          React.createElement(Field, { label: t('webhookUrl'), hint: t('webhookUrlHint') },
            React.createElement('input', { className: 'msgw-input', value: cfg.telegram?.webhookUrl || '', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, webhookUrl: e.target.value } }) }),
          ),
          React.createElement(Field, { label: t('webhookSecret'), hint: t('webhookSecretHint') },
            React.createElement('input', { type: 'password', className: 'msgw-input', value: webhookSecret, placeholder: cfg.telegram?.webhookSecretConfigured ? '••••••••' : '', onChange: (e) => setWebhookSecret(e.target.value) }),
          ),
          React.createElement(Field, { label: t('pollTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 10, max: 60, value: cfg.telegram?.pollTimeoutSeconds ?? 50, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollTimeoutSeconds: Number(e.target.value) || 50 } }) }),
          ),
          React.createElement(Field, { label: t('pollInterval') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 100, max: 5000, value: cfg.telegram?.pollIntervalMs ?? 500, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollIntervalMs: Number(e.target.value) || 500 } }) }),
          ),
          React.createElement(Field, { label: t('idleTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw-input', min: 300, max: 86400, value: Math.round((cfg.agent?.idleTimeoutMs ?? 3600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, idleTimeoutMs: (Number(e.target.value) || 3600) * 1000 } }) }),
          ),
        ) : null,

        err ? React.createElement('div', { className: 'msgw-err' }, err) : null,
        msg ? React.createElement('div', { style: { color: 'var(--dsw-alias-state-success-primary, #10b981)', fontSize: '13px', padding: '8px 0' } }, msg) : null,
        React.createElement('div', { className: 'msgw-foot' },
          React.createElement('button', { type: 'button', className: 'msgw-save', disabled: busy, onClick: () => save({}) }, busy ? t('saving') : t('save')),
        ),
      )
    }

    function PluginCard(props) {
      const [open, setOpen] = React.useState(false)
      const t = makeT(props.locale)
      return React.createElement('li', { className: 'msgw-card' },
        React.createElement('button', {
          type: 'button',
          className: 'msgw-head',
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          React.createElement('div', { className: 'msgw-headText' },
            React.createElement('div', { className: 'msgw-title' }, t('title')),
            React.createElement('div', { className: 'msgw-sub' }, t('description')),
          ),
          React.createElement('span', { className: 'msgw-chev' }, open ? '\u25B2' : '\u25BC'),
        ),
        open ? React.createElement('div', { className: 'msgw-body' },
          React.createElement(MessengerSettingsForm, { t, ctx: props.ctx }),
        ) : null,
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-messenger-gateway: dictionaries')
      function useLocale() { return useActiveLocale(ctx) }

      ctx.slots.inject('settings.plugin.item', () =>
        ctx.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ ctx }),
        }, (props) => React.createElement(PluginCard, { ...props, ctx, locale: useLocale() })),
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale', 'settingsScope']
    return module.exports
  },
})
