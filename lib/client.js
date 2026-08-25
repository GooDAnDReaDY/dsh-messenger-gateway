// dsh-messenger-gateway — browser (client) half.
// Settings card on Plugins → Plugin settings tab (settings.plugin.item).
// Fallback to sidebar settings.section when the slot is unavailable.

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-messenger-gateway',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const NS = 'dsh-messenger-gateway'

    const css =
      '.msgw_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;list-style:none;overflow:hidden}' +
      '.msgw_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
      '.msgw_header{cursor:pointer;text-align:left;width:100%;font:inherit;background:0 0;border:0;align-items:center;gap:8px;padding:10px 14px;display:flex}' +
      '.msgw_header:hover{background:var(--dsw-alias-interactive-bg-hover)}' +
      '.msgw_headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}' +
      '.msgw_name{color:var(--dsw-alias-label-primary);font-weight:600}' +
      '.msgw_description{color:var(--dsw-alias-label-tertiary);font-size:12px}' +
      '.msgw_chevron{color:var(--dsw-alias-label-tertiary);transition:transform .12s}' +
      '.msgw_chevronOpen{transform:rotate(180deg)}' +
      '.msgw_body{flex-direction:column;gap:14px;padding:0 14px 14px;display:flex;max-width:760px}' +
      '.msgw_group{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px}' +
      '.msgw_groupTitle{font-weight:600;font-size:13px}' +
      '.msgw_field{display:flex;flex-direction:column;gap:4px}' +
      '.msgw_label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}' +
      '.msgw_hint{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.msgw_input,.msgw_select,.msgw_textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-input-major);border-radius:6px;padding:6px 8px;font-size:13px;min-height:32px}' +
      '.msgw_textarea{min-height:72px}' +
      '.msgw_err{color:var(--dsw-alias-state-error-primary);font-size:12px}' +
      '.msgw_save{font:inherit;cursor:pointer;border-radius:6px;padding:6px 14px;font-size:13px;border:1px solid var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground);align-self:flex-start}' +
      '.msgw_save:disabled{opacity:.5;cursor:default}'
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
    }
    const ru = {
      title: 'Messenger gateway',
      description: 'Telegram-бот: текст, голос, фото и документы.',
      loading: 'Загрузка…',
      save: 'Сохранить',
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
      return React.createElement('div', { className: 'msgw_field' },
        React.createElement('label', { className: 'msgw_label' }, label),
        hint ? React.createElement('div', { className: 'msgw_hint' }, hint) : null,
        children,
      )
    }

    function MessengerSettingsForm({ t }) {
      const [cfg, setCfg] = React.useState(null)
      const [token, setToken] = React.useState('')
      const [allowText, setAllowText] = React.useState('')
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [showAdvanced, setShowAdvanced] = React.useState(false)

      const load = React.useCallback(async () => {
        const res = await fetch('/dsh-messenger-gateway/config', { credentials: 'same-origin' })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || res.status)
        setCfg(data.config)
        setAllowText(idsToText(data.config?.telegram?.allowedUserIds))
      }, [])

      React.useEffect(() => { load().catch((e) => setErr(String(e.message || e))) }, [load])

      const mergePatch = (base, patch) => ({
        ...base,
        ...patch,
        telegram: { ...base.telegram, ...(patch.telegram || {}) },
        tts: { ...base.tts, ...(patch.tts || {}) },
        agent: { ...base.agent, ...(patch.agent || {}) },
        media: { ...base.media, ...(patch.media || {}) },
      })

      const save = async (patch = {}) => {
        setBusy(true); setErr('')
        try {
          let next = mergePatch(cfg, patch)
          if (token.trim()) next.telegram = { ...next.telegram, botToken: token.trim() }
          next.telegram.allowedUserIds = textToIds(allowText)
          const res = await fetch('/dsh-messenger-gateway/config', {
            method: 'PUT', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: next }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.error || res.status)
          setCfg(data.config); setToken('')
          setAllowText(idsToText(data.config?.telegram?.allowedUserIds))
        } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
      }

      if (!cfg) return React.createElement('div', null, err || t('loading'))

      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'msgw_group' },
          React.createElement('div', { className: 'msgw_groupTitle' }, t('telegram')),
          React.createElement(Field, { label: t('botToken'), hint: t('botTokenHint') },
            React.createElement('input', { type: 'password', className: 'msgw_input', value: token, placeholder: cfg.telegram?.botTokenConfigured ? '••••••••' : 'BotFather', onChange: (e) => setToken(e.target.value) }),
          ),
          React.createElement(Field, { label: t('allowedIds'), hint: t('allowedIdsHint') },
            React.createElement('textarea', { className: 'msgw_textarea', value: allowText, onChange: (e) => setAllowText(e.target.value), rows: 2 }),
          ),
          React.createElement(Field, { label: t('textFormat') },
            React.createElement('select', { className: 'msgw_select', value: cfg.telegram?.textFormat || 'html', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, textFormat: e.target.value } }) },
              React.createElement('option', { value: 'html' }, t('textFormatHtml')),
              React.createElement('option', { value: 'plain' }, t('textFormatPlain')),
            ),
          ),
          React.createElement('button', { type: 'button', disabled: busy, onClick: () => save({ telegram: { enabled: !cfg.telegram.enabled } }) }, cfg.telegram.enabled ? t('disableTelegram') : t('enableTelegram')),
        ),

        React.createElement('div', { className: 'msgw_group' },
          React.createElement('div', { className: 'msgw_groupTitle' }, t('agent')),
          React.createElement(Field, { label: t('provider'), hint: t('providerHint') },
            React.createElement('input', { className: 'msgw_input', value: cfg.agent?.provider || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, provider: e.target.value } }) }),
          ),
          React.createElement(Field, { label: t('model'), hint: t('modelHint') },
            React.createElement('input', { className: 'msgw_input', value: cfg.agent?.model || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, model: e.target.value } }) }),
          ),
          React.createElement(Field, { label: t('photoOnly') },
            React.createElement('select', { className: 'msgw_select', value: cfg.agent?.photoOnlyMode || 'prompt', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, photoOnlyMode: e.target.value } }) },
              React.createElement('option', { value: 'prompt' }, t('photoPrompt')),
              React.createElement('option', { value: 'run' }, t('photoRun')),
            ),
          ),
          React.createElement(Field, { label: t('instruction'), hint: t('instructionHint') },
            React.createElement('textarea', { className: 'msgw_textarea', value: cfg.agent?.instructionPrefix || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, instructionPrefix: e.target.value } }), rows: 3, placeholder: t('instructionPlaceholder') }),
          ),
          React.createElement(Field, { label: t('maxMessageLength') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 500, max: 8000, value: cfg.agent?.maxMessageLength ?? 4000, onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, maxMessageLength: Number(e.target.value) || 4000 } }) }),
          ),
          React.createElement(Field, { label: t('turnTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 30, max: 3600, value: Math.round((cfg.agent?.turnTimeoutMs ?? 600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, turnTimeoutMs: (Number(e.target.value) || 600) * 1000 } }) }),
          ),
        ),

        React.createElement('div', { className: 'msgw_group' },
          React.createElement('div', { className: 'msgw_groupTitle' }, t('media')),
          React.createElement(Field, { label: t('maxDocMb') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 1, max: 50, value: bytesToMb(cfg.media?.maxDocBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxDocBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: t('maxImageMb') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 1, max: 50, value: bytesToMb(cfg.media?.maxImageBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxImageBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: t('maxTextKb') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 16, max: 512, value: Math.round((cfg.media?.maxTextInjectBytes ?? 102400) / 1024), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxTextInjectBytes: (Number(e.target.value) || 100) * 1024 } }) }),
          ),
        ),

        React.createElement('div', { className: 'msgw_group' },
          React.createElement('label', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            React.createElement('input', { type: 'checkbox', checked: !!cfg.tts?.enabled, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, enabled: e.target.checked } }) }),
            React.createElement('span', { className: 'msgw_label' }, t('ttsEnable')),
          ),
          cfg.tts?.enabled ? React.createElement(Field, { label: t('ttsMaxChars') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 100, max: 8000, value: cfg.tts?.maxChars ?? 4000, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, maxChars: Number(e.target.value) || 4000 } }) }),
          ) : null,
        ),

        React.createElement('button', { type: 'button', onClick: () => setShowAdvanced((v) => !v) }, showAdvanced ? t('hideAdvanced') : t('showAdvanced')),
        showAdvanced ? React.createElement('div', { className: 'msgw_group' },
          React.createElement('div', { className: 'msgw_groupTitle' }, t('advanced')),
          React.createElement(Field, { label: t('pollTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 10, max: 60, value: cfg.telegram?.pollTimeoutSeconds ?? 50, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollTimeoutSeconds: Number(e.target.value) || 50 } }) }),
          ),
          React.createElement(Field, { label: t('pollInterval') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 100, max: 5000, value: cfg.telegram?.pollIntervalMs ?? 500, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollIntervalMs: Number(e.target.value) || 500 } }) }),
          ),
          React.createElement(Field, { label: t('idleTimeout') },
            React.createElement('input', { type: 'number', className: 'msgw_input', min: 300, max: 86400, value: Math.round((cfg.agent?.idleTimeoutMs ?? 3600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, idleTimeoutMs: (Number(e.target.value) || 3600) * 1000 } }) }),
          ),
        ) : null,

        React.createElement('button', { type: 'button', className: 'msgw_save', disabled: busy, onClick: () => save({}) }, busy ? t('saving') : t('save')),
        err ? React.createElement('div', { className: 'msgw_err' }, err) : null,
      )
    }

    function PluginCard(props) {
      const [open, setOpen] = React.useState(false)
      const t = makeT(props.locale)
      return React.createElement('li', { className: 'msgw_card' + (open ? ' msgw_cardOpen' : '') },
        React.createElement('button', {
          type: 'button', className: 'msgw_header', 'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          React.createElement('span', { className: 'msgw_headText' },
            React.createElement('span', { className: 'msgw_name' }, t('title')),
            React.createElement('span', { className: 'msgw_description' }, t('description')),
          ),
          React.createElement('span', { className: 'msgw_chevron' + (open ? ' msgw_chevronOpen' : '') }, '\u25be'),
        ),
        open ? React.createElement('div', { className: 'msgw_body' },
          React.createElement(MessengerSettingsForm, { t }),
        ) : null,
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-messenger-gateway: dictionaries')
      function useLocale() { return useActiveLocale(ctx) }

      const tryPluginItem = () => {
        try {
          ctx.slots.inject('settings.plugin.item', () =>
            ctx.slots.register({
              name: 'settings.plugin.item',
              key: NS,
              locale: NS,
              inject: () => ({ ctx }),
            }, (props) => React.createElement(PluginCard, { ...props, locale: useLocale() })),
          )
          return true
        } catch {
          return false
        }
      }

      if (!tryPluginItem()) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NS,
          order: 36,
          label: () => makeT(useActiveLocale(ctx))('title'),
        }, (props) => React.createElement('div', { style: { padding: 16 } },
          React.createElement(MessengerSettingsForm, { t: makeT(useActiveLocale(ctx)) }),
        )))
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    return module.exports
  },
})
