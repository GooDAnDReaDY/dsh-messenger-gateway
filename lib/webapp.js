import { createHmac } from 'node:crypto'
import { timingSafeCompare, isTrustedSettingsRequest, readBody, writeJson } from './http.js'

/**
 * Validates Telegram WebApp initData string using HMAC-SHA256 according to Telegram specification:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * @param {string} rawInitData - URL-encoded query string received from Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token
 * @param {number} [maxAgeSec=86400] - Maximum allowed age of initData in seconds (default 24h)
 * @returns {{ ok: boolean, user?: object, authDate?: number, queryId?: string, chatType?: string, error?: string }}
 */
export function validateTelegramWebAppData(rawInitData, botToken, maxAgeSec = 86400) {
  if (!rawInitData || typeof rawInitData !== 'string') {
    return { ok: false, error: 'empty_init_data' }
  }
  if (!botToken || typeof botToken !== 'string') {
    return { ok: false, error: 'missing_bot_token' }
  }

  try {
    const params = new URLSearchParams(rawInitData)
    const hash = params.get('hash')
    if (!hash) {
      return { ok: false, error: 'missing_hash' }
    }

    const keys = Array.from(params.keys()).filter((k) => k !== 'hash').sort()
    const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n')

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (!timingSafeCompare(calculatedHash, hash)) {
      return { ok: false, error: 'invalid_hash' }
    }

    const authDateStr = params.get('auth_date')
    const authDate = Number(authDateStr) || 0
    if (authDate > 0 && maxAgeSec > 0) {
      const nowSec = Math.floor(Date.now() / 1000)
      if (Math.abs(nowSec - authDate) > maxAgeSec) {
        return { ok: false, error: 'expired', authDate }
      }
    }

    let user = null
    const userStr = params.get('user')
    if (userStr) {
      try {
        user = JSON.parse(userStr)
      } catch {
        // ignore malformed user
      }
    }

    return {
      ok: true,
      user,
      authDate,
      queryId: params.get('query_id') || undefined,
      chatType: params.get('chat_type') || undefined,
      chatInstance: params.get('chat_instance') || undefined,
      data: Object.fromEntries(params.entries()),
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Creates in-memory ring buffer store for artifacts and diagrams
 * @param {number} [maxItems=100]
 */
export function createArtifactStore(maxItems = 100) {
  const items = new Map()

  return {
    add(artifact) {
      if (!artifact || !artifact.id) return null
      const entry = {
        id: String(artifact.id),
        title: String(artifact.title || 'Artifact'),
        type: String(artifact.type || 'diagram'),
        code: String(artifact.code || ''),
        svg: String(artifact.svg || ''),
        createdAt: Number(artifact.createdAt) || Date.now(),
        chatId: artifact.chatId != null ? String(artifact.chatId) : null,
      }
      if (items.size >= maxItems) {
        const oldestKey = items.keys().next().value
        items.delete(oldestKey)
      }
      items.set(entry.id, entry)
      return entry
    },

    get(id) {
      return items.get(String(id)) || null
    },

    list(limit = 20, chatId = null) {
      const all = Array.from(items.values()).reverse()
      if (chatId != null) {
        return all.filter((a) => a.chatId === String(chatId)).slice(0, limit)
      }
      return all.slice(0, limit)
    },

    clear() {
      items.clear()
    },

    get size() {
      return items.size
    },
  }
}

/**
 * Generates single-page HTML for Telegram Mini App
 */
export function createWebAppHtml(options = {}) {
  const title = options.title || 'DSH Gateway Dashboard'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      --bg: var(--tg-theme-bg-color, #0f172a);
      --sec-bg: var(--tg-theme-secondary-bg-color, #1e293b);
      --text: var(--tg-theme-text-color, #f8fafc);
      --hint: var(--tg-theme-hint-color, #94a3b8);
      --link: var(--tg-theme-link-color, #38bdf8);
      --btn: var(--tg-theme-button-color, #0284c7);
      --btn-text: var(--tg-theme-button-text-color, #ffffff);
      --card-bg: var(--tg-theme-section-bg-color, #1e293b);
      --border: rgba(255, 255, 255, 0.1);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      padding-bottom: 30px;
      -webkit-font-smoothing: antialiased;
    }
    header {
      padding: 16px;
      background: var(--sec-bg);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .header-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
      text-transform: uppercase;
      background: rgba(14, 165, 233, 0.2);
      color: #38bdf8;
    }
    .badge-ok { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    nav {
      display: flex;
      background: var(--sec-bg);
      border-bottom: 1px solid var(--border);
    }
    .nav-btn {
      flex: 1;
      padding: 12px;
      text-align: center;
      background: none;
      border: none;
      color: var(--hint);
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .nav-btn.active {
      color: var(--btn-text);
      border-bottom-color: var(--btn);
      background: rgba(255, 255, 255, 0.03);
    }
    .container { padding: 16px; max-width: 800px; margin: 0 auto; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .card-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    .card-meta { font-size: 12px; color: var(--hint); margin-bottom: 10px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--btn);
      color: var(--btn-text);
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .btn:active { opacity: 0.8; }
    .btn-sec { background: rgba(255, 255, 255, 0.1); color: var(--text); }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .stat-card {
      background: rgba(255, 255, 255, 0.04);
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      text-align: center;
    }
    .stat-val { font-size: 18px; font-weight: 700; margin-top: 4px; color: #38bdf8; }
    .stat-lbl { font-size: 11px; color: var(--hint); text-transform: uppercase; letter-spacing: 0.5px; }
    .preview-box {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 8px;
      overflow: hidden;
      max-height: 180px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 10px;
    }
    .preview-box svg { max-width: 100%; max-height: 160px; height: auto; }
    .modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      z-index: 100;
      padding: 16px;
      flex-direction: column;
    }
    .modal.active { display: flex; }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }
    .modal-body {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #000;
      border-radius: 8px;
      padding: 16px;
    }
    .modal-body svg { max-width: 100%; height: auto; }
    .code-view {
      display: none;
      width: 100%;
      height: 100%;
      background: #111;
      color: #38bdf8;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      border-radius: 6px;
      overflow: auto;
      white-space: pre-wrap;
    }
    .search-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 13px;
    }
    .search-input:focus { outline: none; border-color: var(--btn); }
    .empty-state { text-align: center; padding: 40px 16px; color: var(--hint); }
  </style>
</head>
<body>
  <header>
    <div class="header-title">
      <span>📊</span>
      <span>DSH Gateway</span>
      <span id="header-user" class="badge">Guest</span>
    </div>
    <div id="status-pill" class="badge badge-ok">Online</div>
  </header>

  <nav>
    <button class="nav-btn active" id="btn-tab-artifacts">📊 Artifacts</button>
    <button class="nav-btn" id="btn-tab-health">⚡ Health</button>
    <button class="nav-btn" id="btn-tab-sessions">🤖 Sessions</button>
  </nav>

  <div class="container">
    <div id="tab-artifacts" class="tab-content active">
      <input type="text" id="art-search" class="search-input" placeholder="Search artifacts & diagrams...">
      <div id="artifacts-list">
        <div class="empty-state">Loading artifacts...</div>
      </div>
    </div>

    <div id="tab-health" class="tab-content">
      <div class="grid">
        <div class="stat-card">
          <div class="stat-lbl">Uptime</div>
          <div id="stat-uptime" class="stat-val">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl">Messages</div>
          <div id="stat-sent" class="stat-val">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl">Outbox Pending</div>
          <div id="stat-outbox" class="stat-val">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl">Active Chats</div>
          <div id="stat-chats" class="stat-val">0</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Telegram Adapter</span>
          <span id="tg-status-badge" class="badge badge-ok">Ready</span>
        </div>
        <div id="tg-details" class="card-meta">Connecting...</div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="btn btn-sm btn-sec" id="btn-refresh-status">Refresh Status</button>
          <button class="btn btn-sm btn-sec" id="btn-retry-outbox">Retry Outbox</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Active Adapters</div>
        <div id="adapters-list" class="card-meta">Loading...</div>
      </div>
    </div>

    <div id="tab-sessions" class="tab-content">
      <div class="card">
        <div class="card-title">Agent & Model</div>
        <div id="model-details" class="card-meta">Loading...</div>
      </div>

      <div class="card">
        <div class="card-title">Personas & Roles</div>
        <div id="personas-list" class="card-meta">No custom personas configured.</div>
      </div>
    </div>
  </div>

  <div id="art-modal" class="modal">
    <div class="modal-header">
      <div>
        <h3 id="modal-title" style="font-size: 15px; font-weight: 700;">Artifact Preview</h3>
        <span id="modal-badge" class="badge">DIAGRAM</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-sm btn-sec" id="btn-modal-code">Code</button>
        <button class="btn btn-sm btn-sec" id="btn-modal-copy">Copy</button>
        <button class="btn btn-sm" id="btn-modal-close">✕</button>
      </div>
    </div>
    <div class="modal-body">
      <div id="modal-svg-container"></div>
      <pre id="modal-code" class="code-view"></pre>
    </div>
  </div>

  <script>
    let currentArtifacts = []
    let activeModalArt = null
    let showingCode = false
    const tg = window.Telegram && window.Telegram.WebApp

    if (tg) {
      try { tg.ready(); tg.expand(); } catch (_e) { void _e }
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        document.getElementById('header-user').textContent = tg.initDataUnsafe.user.first_name || 'User'
      }
    }

    function switchTab(tabId) {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
      const btn = document.getElementById('btn-tab-' + tabId)
      if (btn) btn.classList.add('active')
      const target = document.getElementById('tab-' + tabId)
      if (target) target.classList.add('active')
      if (tabId === 'health') loadStatus()
    }

    document.getElementById('btn-tab-artifacts').addEventListener('click', () => switchTab('artifacts'))
    document.getElementById('btn-tab-health').addEventListener('click', () => switchTab('health'))
    document.getElementById('btn-tab-sessions').addEventListener('click', () => switchTab('sessions'))
    document.getElementById('btn-refresh-status').addEventListener('click', () => loadStatus())
    document.getElementById('btn-retry-outbox').addEventListener('click', () => triggerAction('outbox_retry'))
    document.getElementById('btn-modal-code').addEventListener('click', () => toggleModalCode())
    document.getElementById('btn-modal-copy').addEventListener('click', () => copyModalCode())
    document.getElementById('btn-modal-close').addEventListener('click', () => closeModal())
    document.getElementById('art-search').addEventListener('input', () => filterArtifacts())

    async function apiFetch(endpoint, options = {}) {
      const headers = { ...(options.headers || {}) }
      if (tg && tg.initData) {
        headers['Authorization'] = 'tma ' + tg.initData
      }
      return fetch(endpoint, { ...options, headers })
    }

    async function loadArtifacts() {
      try {
        const res = await apiFetch('/dsh-messenger-gateway/webapp/api/artifacts')
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        currentArtifacts = data.artifacts || []
        renderArtifacts(currentArtifacts)
        checkDeepLink()
      } catch (e) {
        document.getElementById('artifacts-list').innerHTML = '<div class="empty-state">Failed to load artifacts: ' + e.message + '</div>'
      }
    }

    function renderArtifacts(list) {
      const el = document.getElementById('artifacts-list')
      if (!list || !list.length) {
        el.innerHTML = '<div class="empty-state">No artifacts generated in this session yet.</div>'
        return
      }
      el.innerHTML = list.map(art => {
        const preview = art.svg ? '<div class="preview-box">' + art.svg + '</div>' : ''
        return '<div class="card art-card" data-id="' + art.id + '" style="cursor: pointer;">' +
          '<div class="card-title">' +
            '<span>' + escapeHtml(art.title) + '</span>' +
            '<span class="badge">' + escapeHtml(art.type) + '</span>' +
          '</div>' +
          '<div class="card-meta">Created ' + new Date(art.createdAt).toLocaleTimeString() + '</div>' +
          preview +
          '<button class="btn btn-sm btn-sec btn-open-art" data-id="' + art.id + '">Open Fullscreen</button>' +
        '</div>'
      }).join('')

      el.querySelectorAll('.art-card').forEach(card => {
        card.addEventListener('click', () => openArtifact(card.getAttribute('data-id')))
      })
    }

    function filterArtifacts() {
      const q = document.getElementById('art-search').value.toLowerCase()
      const filtered = currentArtifacts.filter(a => a.title.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.code.toLowerCase().includes(q))
      renderArtifacts(filtered)
    }

    function openArtifact(id) {
      const art = currentArtifacts.find(a => a.id === id)
      if (!art) return
      activeModalArt = art
      showingCode = false
      document.getElementById('modal-title').textContent = art.title
      document.getElementById('modal-badge').textContent = art.type.toUpperCase()
      document.getElementById('modal-svg-container').innerHTML = art.svg || '<div style="color:#94a3b8">No SVG preview</div>'
      document.getElementById('modal-svg-container').style.display = 'block'
      document.getElementById('modal-code').style.display = 'none'
      document.getElementById('modal-code').textContent = art.code || art.svg || ''
      document.getElementById('art-modal').classList.add('active')
    }

    function toggleModalCode() {
      showingCode = !showingCode
      document.getElementById('modal-svg-container').style.display = showingCode ? 'none' : 'block'
      document.getElementById('modal-code').style.display = showingCode ? 'block' : 'none'
    }

    function copyModalCode() {
      if (!activeModalArt) return
      const text = activeModalArt.code || activeModalArt.svg || ''
      navigator.clipboard.writeText(text).then(() => {
        alert('Code copied to clipboard!')
      }).catch((_e) => { void _e })
    }

    function closeModal() {
      document.getElementById('art-modal').classList.remove('active')
      activeModalArt = null
    }

    function checkDeepLink() {
      const hash = window.location.hash
      if (hash && hash.startsWith('#artifact=')) {
        const id = hash.replace('#artifact=', '').trim()
        if (id) openArtifact(id)
      }
    }

    async function loadStatus() {
      try {
        const res = await apiFetch('/dsh-messenger-gateway/webapp/api/status')
        if (!res.ok) return
        const s = await res.json()
        const hrs = Math.floor((s.uptimeSec || 0) / 3600)
        const mins = Math.floor(((s.uptimeSec || 0) % 3600) / 60)
        document.getElementById('stat-uptime').textContent = hrs + 'h ' + mins + 'm'
        document.getElementById('stat-sent').textContent = s.stats && s.stats.sent || 0
        document.getElementById('stat-chats').textContent = s.activeChats || 0
        document.getElementById('stat-outbox').textContent = s.outbox && s.outbox.pending || 0
        document.getElementById('tg-details').innerHTML = 'Bot: @' + (s.botUsername || 'none') + ' | Transport: ' + (s.config && s.config.telegram && s.config.telegram.transport || 'poll')
        document.getElementById('adapters-list').innerHTML = (s.adapters || []).map(a => '• <b>' + a + '</b>: active').join('<br>') || 'None'
        document.getElementById('model-details').innerHTML = 'Model: <b>' + (s.config && s.config.agent && s.config.agent.model || 'default') + '</b><br>CWD: <code>' + (s.config && s.config.agent && s.config.agent.effectiveCwd || 'standard') + '</code>'
      } catch (_e) {
        // ignore status fetch error
      }
    }

    async function triggerAction(action) {
      try {
        const res = await apiFetch('/dsh-messenger-gateway/webapp/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const result = await res.json()
        alert(result.ok ? 'Action executed: ' + action : 'Action failed: ' + result.error)
        loadStatus()
      } catch (e) {
        alert('Action error: ' + e.message)
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    loadArtifacts()
    loadStatus()
  </script>
</body>
</html>`
}

/**
 * Creates HTTP route handler for Telegram Mini App
 */
export function createWebAppHandler(options = {}) {
  const { getGateway, getConfig, ctx } = options

  return async function webAppHandler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const pathname = url.pathname

    // 1. Static HTML serving for root and subpaths
    if (pathname === '/dsh-messenger-gateway/webapp' || pathname === '/dsh-messenger-gateway/webapp/') {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      const html = createWebAppHtml({ title: 'DSH Gateway Dashboard' })
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(html)
      return
    }

    const gw = getGateway?.()
    const cfg = getConfig?.() || {}
    const tgCfg = cfg.telegram || {}
    const botToken = tgCfg.botToken || ''

    // Helper: authenticate request via Telegram WebApp initData or trusted loopback/session
    function authenticate() {
      if (isTrustedSettingsRequest(req, cfg.webhooks?.secret, ctx)) {
        return { ok: true, trusted: true, user: { id: 0, first_name: 'DSH Admin' } }
      }

      const authHeader = req.headers['authorization'] || ''
      let initData = ''
      if (authHeader.startsWith('tma ')) {
        initData = authHeader.slice(4).trim()
      } else if (req.headers['x-telegram-init-data']) {
        initData = String(req.headers['x-telegram-init-data']).trim()
      } else if (url.searchParams.get('initData')) {
        initData = url.searchParams.get('initData')
      }

      if (initData) {
        const val = validateTelegramWebAppData(initData, botToken)
        if (val.ok) {
          if (Array.isArray(tgCfg.allowedUserIds) && tgCfg.allowedUserIds.length > 0) {
            const uid = Number(val.user?.id)
            if (!tgCfg.allowedUserIds.includes(uid)) {
              return { ok: false, error: 'user_not_allowed' }
            }
          }
          return { ok: true, user: val.user, initData: val }
        }
        return { ok: false, error: val.error || 'unauthorized' }
      }

      return { ok: false, error: 'unauthorized' }
    }

    // 2. API Endpoints
    if (pathname === '/dsh-messenger-gateway/webapp/api/auth') {
      const auth = authenticate()
      return writeJson(res, auth.ok ? 200 : 401, auth)
    }

    if (pathname === '/dsh-messenger-gateway/webapp/api/status') {
      const auth = authenticate()
      if (!auth.ok) return writeJson(res, 401, { ok: false, error: auth.error })

      const botInfo = gw?.getBotInfo?.() || {}
      const uptimeSec = gw?.stats?.startedAt ? Math.max(0, Math.round((Date.now() - gw.stats.startedAt) / 1000)) : 0

      return writeJson(res, 200, {
        ok: true,
        running: Boolean(gw),
        botUsername: botInfo.botUsername || '',
        uptimeSec,
        activeChats: gw?.messenger?.activeChats?.() || 0,
        adapters: gw?.messenger?.adapters?.() || [],
        stats: gw?.stats || {},
        outbox: {
          pending: gw?.outbox?.pendingCount || 0,
          dlq: gw?.outbox?.dlqCount || 0,
        },
        config: {
          telegram: {
            transport: tgCfg.transport || 'poll',
            quickActions: Boolean(tgCfg.quickActions),
          },
          agent: {
            model: cfg.agent?.model || '',
            effectiveCwd: cfg.agent?.effectiveCwd || '',
          },
        },
      })
    }

    if (pathname === '/dsh-messenger-gateway/webapp/api/artifacts') {
      const auth = authenticate()
      if (!auth.ok) return writeJson(res, 401, { ok: false, error: auth.error })

      const limit = Number(url.searchParams.get('limit')) || 30
      const artifacts = gw?.artifactStore ? gw.artifactStore.list(limit) : []
      return writeJson(res, 200, { ok: true, artifacts })
    }

    if (pathname === '/dsh-messenger-gateway/webapp/api/artifact') {
      const auth = authenticate()
      if (!auth.ok) return writeJson(res, 401, { ok: false, error: auth.error })

      const id = url.searchParams.get('id')
      if (!id) return writeJson(res, 400, { ok: false, error: 'id required' })

      const artifact = gw?.artifactStore?.get(id)
      if (!artifact) return writeJson(res, 404, { ok: false, error: 'not found' })

      return writeJson(res, 200, { ok: true, artifact })
    }

    if (pathname === '/dsh-messenger-gateway/webapp/api/action') {
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'POST only' })
      const auth = authenticate()
      if (!auth.ok) return writeJson(res, 401, { ok: false, error: auth.error })

      const raw = await readBody(req, 65536)
      let payload = {}
      try {
        payload = JSON.parse(raw.toString('utf-8'))
      } catch {
        return writeJson(res, 400, { ok: false, error: 'invalid json' })
      }

      if (payload.action === 'outbox_retry') {
        if (gw?.outbox?.retryDlq) {
          const retried = await gw.outbox.retryDlq()
          return writeJson(res, 200, { ok: true, retried })
        }
        return writeJson(res, 200, { ok: true, retried: 0 })
      }

      return writeJson(res, 400, { ok: false, error: 'unknown action' })
    }

    return writeJson(res, 404, { ok: false, error: 'not found' })
  }
}
