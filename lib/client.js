window.__ModuleLoader__.load({
  id: '@goodandready/dsh-messenger-gateway',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const NS = 'dsh-messenger-gateway'

    function idsToText(ids) { return (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).join(', ') }
    function textToIds(text) {
      return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))
    }

    function Section() {
      const [cfg, setCfg] = React.useState(null)
      const [token, setToken] = React.useState('')
      const [allowText, setAllowText] = React.useState('')
      const [err, setErr] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(async () => {
        const res = await fetch('/dsh-messenger-gateway/config', { credentials: 'same-origin' })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || res.status)
        setCfg(data.config)
        setAllowText(idsToText(data.config?.telegram?.allowedUserIds))
      }, [])

      React.useEffect(() => { load().catch((e) => setErr(String(e.message || e))) }, [load])

      const save = async (patch) => {
        setBusy(true); setErr('')
        try {
          const body = { config: { ...cfg, ...patch, telegram: { ...cfg.telegram, ...(patch.telegram || {}) } } }
          if (token.trim()) body.config.telegram = { ...body.config.telegram, botToken: token.trim() }
          body.config.telegram.allowedUserIds = textToIds(allowText)
          const res = await fetch('/dsh-messenger-gateway/config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.error || res.status)
          setCfg(data.config); setToken(''); setAllowText(idsToText(data.config?.telegram?.allowedUserIds))
        } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
      }

      if (!cfg) return React.createElement('div', null, err || 'Loading…')
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 } },
        React.createElement('div', { style: { fontWeight: 600 } }, 'Messenger gateway'),
        React.createElement('div', { style: { fontSize: 12, opacity: 0.8 } }, 'Telegram v0.1 — text only. Discord and media later.'),
        React.createElement('input', { type: 'password', placeholder: cfg.telegram?.botTokenConfigured ? 'Token set — paste to replace' : 'Bot token', value: token, onChange: (e) => setToken(e.target.value) }),
        React.createElement('textarea', { placeholder: 'Allowed user ids, comma-separated', value: allowText, onChange: (e) => setAllowText(e.target.value) }),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          React.createElement('button', { disabled: busy, onClick: () => save({ telegram: { enabled: !cfg.telegram.enabled } }) }, cfg.telegram.enabled ? 'Disable Telegram' : 'Enable Telegram'),
          React.createElement('button', { disabled: busy, onClick: () => save({}) }, 'Save'),
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
