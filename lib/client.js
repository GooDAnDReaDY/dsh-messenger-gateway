window.__ModuleLoader__.load({
  id: '@goodandready/dsh-messenger-gateway',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    function idsToText(ids) { return (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).join(', ') }
    function textToIds(text) {
      return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))
    }
    function bytesToMb(n) { return Math.round(Number(n || 0) / (1024 * 1024)) }
    function mbToBytes(n) { return Math.max(1, Math.round(Number(n || 1))) * 1024 * 1024 }

    function Field({ label, hint, children }) {
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        React.createElement('label', { style: { fontWeight: 600 } }, label),
        hint ? React.createElement('div', { style: { fontSize: 12, opacity: 0.7 } }, hint) : null,
        children,
      )
    }

    function Section() {
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

      if (!cfg) return React.createElement('div', null, err || 'Loading…')

      const input = { width: '100%', boxSizing: 'border-box' }
      const card = { border: '1px solid #ddd', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }

      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontWeight: 700, fontSize: 18 } }, 'Messenger gateway'),
          React.createElement('div', { style: { fontSize: 12, opacity: 0.75 } }, 'Telegram-бот: текст, голос, фото, документы. Настройки сохраняются в DSH, не в cordis.patch.'),
        ),

        React.createElement('div', { style: card },
          React.createElement('div', { style: { fontWeight: 600 } }, 'Telegram'),
          React.createElement(Field, { label: 'Bot token (только запись)', hint: 'Оставьте пустым, чтобы не менять' },
            React.createElement('input', { type: 'password', style: input, value: token, placeholder: cfg.telegram?.botTokenConfigured ? '••••••••' : 'токен от BotFather', onChange: (e) => setToken(e.target.value) }),
          ),
          React.createElement(Field, { label: 'Разрешённые user id', hint: 'Через запятую. Пусто = все пользователи' },
            React.createElement('textarea', { style: input, value: allowText, onChange: (e) => setAllowText(e.target.value), rows: 2 }),
          ),
          React.createElement(Field, { label: 'Формат текста' },
            React.createElement('select', { style: input, value: cfg.telegram?.textFormat || 'html', onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, textFormat: e.target.value } }) },
              React.createElement('option', { value: 'html' }, 'Markdown → Telegram HTML'),
              React.createElement('option', { value: 'plain' }, 'Простой текст'),
            ),
          ),
          React.createElement('button', { disabled: busy, onClick: () => save({ telegram: { enabled: !cfg.telegram.enabled } }) }, cfg.telegram.enabled ? 'Выключить Telegram' : 'Включить Telegram'),
        ),

        React.createElement('div', { style: card },
          React.createElement('div', { style: { fontWeight: 600 } }, 'Агент'),
          React.createElement(Field, { label: 'Provider', hint: 'Пусто = провайдер по умолчанию DSH' },
            React.createElement('input', { style: input, value: cfg.agent?.provider || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, provider: e.target.value } }) }),
          ),
          React.createElement(Field, { label: 'Model', hint: 'Пусто = модель по умолчанию' },
            React.createElement('input', { style: input, value: cfg.agent?.model || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, model: e.target.value } }) }),
          ),
          React.createElement(Field, { label: 'Фото без подписи' },
            React.createElement('select', { style: input, value: cfg.agent?.photoOnlyMode || 'prompt', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, photoOnlyMode: e.target.value } }) },
              React.createElement('option', { value: 'prompt' }, 'Ждать вопрос (рекомендуется)'),
              React.createElement('option', { value: 'run' }, 'Отвечать сразу'),
            ),
          ),
          React.createElement(Field, { label: 'Доп. инструкция агенту', hint: 'Добавляется к каждому сообщению из мессенджера' },
            React.createElement('textarea', { style: { ...input, minHeight: 72 }, value: cfg.agent?.instructionPrefix || '', onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, instructionPrefix: e.target.value } }), rows: 3, placeholder: 'Пусто = встроенная инструкция (русский, без рассуждений)' }),
          ),
          React.createElement(Field, { label: 'Макс. длина ответа (символов)' },
            React.createElement('input', { type: 'number', style: input, min: 500, max: 8000, value: cfg.agent?.maxMessageLength ?? 4000, onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, maxMessageLength: Number(e.target.value) || 4000 } }) }),
          ),
          React.createElement(Field, { label: 'Таймаут хода агента (сек)' },
            React.createElement('input', { type: 'number', style: input, min: 30, max: 3600, value: Math.round((cfg.agent?.turnTimeoutMs ?? 600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, turnTimeoutMs: (Number(e.target.value) || 600) * 1000 } }) }),
          ),
        ),

        React.createElement('div', { style: card },
          React.createElement('div', { style: { fontWeight: 600 } }, 'Медиа'),
          React.createElement(Field, { label: 'Макс. размер документа (МБ)' },
            React.createElement('input', { type: 'number', style: input, min: 1, max: 50, value: bytesToMb(cfg.media?.maxDocBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxDocBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: 'Макс. размер фото (МБ)' },
            React.createElement('input', { type: 'number', style: input, min: 1, max: 50, value: bytesToMb(cfg.media?.maxImageBytes), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxImageBytes: mbToBytes(e.target.value) } }) }),
          ),
          React.createElement(Field, { label: 'Макс. текст из документа (КБ)' },
            React.createElement('input', { type: 'number', style: input, min: 16, max: 512, value: Math.round((cfg.media?.maxTextInjectBytes ?? 102400) / 1024), onChange: (e) => setCfg({ ...cfg, media: { ...cfg.media, maxTextInjectBytes: (Number(e.target.value) || 100) * 1024 } }) }),
          ),
        ),

        React.createElement('div', { style: card },
          React.createElement('label', { style: { display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 } },
            React.createElement('input', { type: 'checkbox', checked: !!cfg.tts?.enabled, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, enabled: e.target.checked } }) }),
            'Голосовые ответы (dsh-tts)',
          ),
          cfg.tts?.enabled ? React.createElement(Field, { label: 'Макс. символов для озвучки' },
            React.createElement('input', { type: 'number', style: input, min: 100, max: 8000, value: cfg.tts?.maxChars ?? 4000, onChange: (e) => setCfg({ ...cfg, tts: { ...cfg.tts, maxChars: Number(e.target.value) || 4000 } }) }),
          ) : null,
        ),

        React.createElement('button', { type: 'button', onClick: () => setShowAdvanced((v) => !v) }, showAdvanced ? 'Скрыть расширенные' : 'Расширенные настройки'),
        showAdvanced ? React.createElement('div', { style: card },
          React.createElement('div', { style: { fontWeight: 600 } }, 'Polling Telegram'),
          React.createElement(Field, { label: 'pollTimeoutSeconds' },
            React.createElement('input', { type: 'number', style: input, min: 10, max: 60, value: cfg.telegram?.pollTimeoutSeconds ?? 50, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollTimeoutSeconds: Number(e.target.value) || 50 } }) }),
          ),
          React.createElement(Field, { label: 'pollIntervalMs' },
            React.createElement('input', { type: 'number', style: input, min: 100, max: 5000, value: cfg.telegram?.pollIntervalMs ?? 500, onChange: (e) => setCfg({ ...cfg, telegram: { ...cfg.telegram, pollIntervalMs: Number(e.target.value) || 500 } }) }),
          ),
          React.createElement(Field, { label: 'idleTimeoutMs (сек)' },
            React.createElement('input', { type: 'number', style: input, min: 300, max: 86400, value: Math.round((cfg.agent?.idleTimeoutMs ?? 3600000) / 1000), onChange: (e) => setCfg({ ...cfg, agent: { ...cfg.agent, idleTimeoutMs: (Number(e.target.value) || 3600) * 1000 } }) }),
          ),
        ) : null,

        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('button', { disabled: busy, onClick: () => save({}) }, busy ? 'Сохранение…' : 'Сохранить'),
        ),
        err ? React.createElement('div', { style: { color: 'crimson', fontSize: 12 } }, err) : null,
      )
    }

    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: '@goodandready/dsh-messenger-gateway',
        order: 36,
        label: () => 'Messenger gateway',
      }, Section))
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
