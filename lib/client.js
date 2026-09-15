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
      // Updater
      'updater.title': 'Plugin Self-Updater',
      'updater.desc': 'Check npmjs registry for updates and upgrade in-place.',
      'updater.current': 'Current version: {version}',
      'updater.checking': 'Checking for updates…',
      'updater.available': 'Update available: v{version}',
      'updater.upToDate': 'Up to date',
      'updater.btn_check': 'Check for Updates',
      'updater.btn_update': 'Update to v{version}',
      'updater.updating': 'Updating…',
      'updater.success': 'Updated to v{version}! Please restart DSH service if required.',
      'updater.failed': 'Update failed: {error}',
      'updater.check_failed': 'Update check failed: {error}',
      // Discord
      discord: 'Discord Gateway',
      discordSub: 'Discord bot and outbound webhook delivery settings.',
      enableDiscord: 'Enable Discord',
      disableDiscord: 'Disable Discord',
      discordToken: 'Discord Bot Token',
      discordTokenHint: 'From Discord Developer Portal. Leave empty to keep existing.',
      discordWebhook: 'Discord Webhook URL',
      discordWebhookHint: 'Incoming webhook for sending messages/notifications.',
      discordChannels: 'Allowed Discord Channel IDs',
      discordChannelsHint: 'Comma-separated channel IDs. Leave empty to allow all configured.',
      // Slack
      slack: 'Slack Gateway',
      slackSub: 'Slack bot and incoming webhook settings.',
      enableSlack: 'Enable Slack',
      disableSlack: 'Disable Slack',
      slackToken: 'Slack Bot Token (xoxb-…)',
      slackTokenHint: 'Bot User OAuth Token. Leave empty to keep existing.',
      slackWebhook: 'Slack Webhook URL',
      slackWebhookHint: 'Incoming webhook URL for channel notifications.',
      slackDefaultChannel: 'Slack Default Channel',
      slackDefaultChannelHint: 'Default channel or member ID for outbound messages (e.g. #general or C12345).',
      // Cron badge
      'badge.cron_count': 'Cron: {count}',
    }

    const zh = {
      title: 'Messenger gateway',
      description: 'Telegram 机器人：文本、语音、图片、文档和交互式询问。',
      'settings.loading': '正在加载 Messenger gateway 设置…',
      'settings.retry': '重试',
      'settings.unavailable': '设置不可用（主机命名空间未就绪）。',
      'header.title': 'Telegram 与多消息平台网关',
      'header.sub': 'DeepSeek Harness 与 Telegram 之间的桥梁：会话、转向提示、论坛话题、内联按钮和可选语音。',
      'badge.online': 'Telegram 在线 (@{username})',
      'badge.running': '运行中',
      'badge.stopped': '已停止',
      'badge.token_ok': '令牌有效 ✓',
      'badge.token_missing': '缺少令牌',
      'badge.pairing_count': '配对: {count}',
      'badge.transport': '传输方式: {mode}',
      save: '保存更改',
      saved: '设置保存成功',
      saving: '保存中…',
      showAdvanced: '⚙️ 高级连接与轮询设置',
      hideAdvanced: '隐藏高级设置',
      telegram: 'Telegram 机器人设置',
      telegramSub: '主机器人凭证、白名单与消息发送设置。',
      agent: '智能体与推理行为',
      agentSub: '模型路由、附加指令与轮次超时设置。',
      media: '媒体与文件限制',
      mediaSub: '文档提取与图片上传限制。',
      tts: '语音回复 (dsh-tts)',
      ttsSub: '为 Telegram 语音消息合成语音回复。',
      advanced: '连接与轮询内部设置',
      botToken: 'Telegram 机器人令牌',
      botTokenHint: '从 @BotFather 获取。留空保持现有配置。',
      allowedIds: '允许的 Telegram 用户 ID',
      allowedIdsHint: '逗号分隔的用户 ID 列表。留空允许所有用户（启用配对请求）。',
      textFormat: '文本格式化渲染',
      textFormatHtml: 'Markdown → Telegram HTML (推荐)',
      textFormatPlain: '纯文本 (无格式化)',
      disableTelegram: '停用 Telegram 机器人',
      enableTelegram: '启用 Telegram 机器人',
      provider: '提供商覆盖',
      providerHint: '留空使用 DSH 默认提供商',
      model: '模型覆盖',
      modelHint: '留空使用 DSH 默认模型',
      photoOnly: '无附言图片处理方式',
      photoPrompt: '等待问题 (推荐)',
      photoRun: '立即回复',
      instruction: '额外智能体指令',
      instructionHint: '添加到每条来自网关的消息前',
      instructionPlaceholder: '留空 = 内置指令',
      maxMessageLength: '最大回复长度 (字符)',
      turnTimeout: '智能体轮次超时 (秒)',
      maxDocMb: '最大文档大小 (MB)',
      maxImageMb: '最大图片大小 (MB)',
      maxTextKb: '文档提取最大文本量 (KB)',
      ttsEnable: '启用语音回复 (需 dsh-tts)',
      ttsMaxChars: '每条语音消息最大字数',
      pollTimeout: '长轮询超时 (秒)',
      pollInterval: '长轮询间隔 (毫秒)',
      idleTimeout: '空闲会话超时 (秒)',
      pairing: '配对请求与授权',
      pairingSub: '受限白名单下授权新用户。',
      pairingEmpty: '暂无待处理配对码',
      pairingApprove: '批准',
      pairingReject: '拒绝',
      pairingRefresh: '刷新列表',
      groupsEnable: '在群组和超级群组中响应',
      groupMention: '群组中需 @提及、回复或 /命令',
      reactionsEnable: '处理中添加 👀 表情反应',
      progressEnable: '进度状态提示 (思考中 → 删除 → 最终回复)',
      statusIndicator: '机器人状态描述指示器 (Online/Offline)',
      statusIndicatorHint: '通过 Telegram API 设置机器人简介（所有人可见）。',
      transport: 'Telegram 传输模式',
      transportPoll: '长轮询 (getUpdates)',
      transportWebhook: 'Webhook (HTTPS)',
      webhookUrl: '公开 Webhook HTTPS 地址',
      webhookUrlHint: 'Telegram 投递更新的公开端点',
      webhookSecret: 'Webhook 密钥令牌',
      webhookSecretHint: '留空保持当前配置的密钥',
      sessionScope: '群组会话范围',
      sessionScopeChat: '每个聊天/话题共享',
      sessionScopeUser: '每用户独立会话 (推荐)',
      voiceMode: '语音回复模式',
      voiceModeMirror: '镜像输入语音 (仅语音输入时回复语音)',
      voiceModeAlways: '始终合成语音回复',
      voiceModeOff: '关闭 (除非通过 /voice 启用)',
      notifyBridge: '通知网桥 → Telegram Home',
      notifyBridgeHint: '将 Web 会话的 task_done/error 事件转发至指定频道/话题',
      notifyHome: '目标频道名称 (Home)',
      quickActions: '快捷操作键盘 (/new, /stop, /voice, /status)',
      artifactPreviews: '在 Telegram 中预览图表与表格',
      'diag.title': '⚡ 诊断与连通性检查 (Smoke test)',
      'diag.desc': '检查 Telegram Bot API 连接、测量延迟并验证机器人名称。',
      'diag.smoke_btn': '测试 Telegram 连接 (Ping)',
      'diag.smoke_testing': '正在连接 Telegram API…',
      'diag.smoke_ok': 'Telegram API 连接成功！延迟: {latency} 毫秒 (@{username}, ID: {id})',
      'diag.smoke_err': '连通性检查失败: {error}',
      'stats.title': '📊 网关遥测与计数器',
      'stats.desc': '运行中网关进程的实时统计。',
      'stats.sent': '已发送消息',
      'stats.errors': '发送错误数',
      'stats.uptime': '运行时间',
      'stats.active_chats': '内存中活跃聊天数',
      // Updater
      'updater.title': '插件自更新',
      'updater.desc': '从 npmjs 仓库检查更新并直接就地升级。',
      'updater.current': '当前版本: {version}',
      'updater.checking': '正在检查更新…',
      'updater.available': '发现新版本: v{version}',
      'updater.upToDate': '已是最新版本',
      'updater.btn_check': '检查更新',
      'updater.btn_update': '更新至 v{version}',
      'updater.updating': '正在更新…',
      'updater.success': '已更新至 v{version}！如需生效请重启 DSH 服务。',
      'updater.failed': '更新失败: {error}',
      'updater.check_failed': '检查更新失败: {error}',
      // Discord
      discord: 'Discord 网关',
      discordSub: 'Discord 机器人与出站 Webhook 设置。',
      enableDiscord: '启用 Discord',
      disableDiscord: '停用 Discord',
      discordToken: 'Discord 机器人令牌',
      discordTokenHint: '从 Discord 开发者平台获取。留空保持现有配置。',
      discordWebhook: 'Discord Webhook URL',
      discordWebhookHint: '用于发送消息或通知的传入 Webhook。',
      discordChannels: '允许的 Discord 频道 ID',
      discordChannelsHint: '逗号分隔的频道 ID。留空允许所有已配置频道。',
      // Slack
      slack: 'Slack 网关',
      slackSub: 'Slack 机器人与 Webhook 设置。',
      enableSlack: '启用 Slack',
      disableSlack: '停用 Slack',
      slackToken: 'Slack 机器人令牌 (xoxb-…)',
      slackTokenHint: 'Bot 用户 OAuth 令牌。留空保持现有配置。',
      slackWebhook: 'Slack Webhook URL',
      slackWebhookHint: '用于频道通知的传入 Webhook URL。',
      slackDefaultChannel: 'Slack 默认频道',
      slackDefaultChannelHint: '出站消息的默认频道或成员 ID (例如 #general 或 C12345)。',
      // Cron badge
      'badge.cron_count': '定时任务: {count}',
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
      const DICT = String(locale || '').startsWith('zh') ? zh : en
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

    const SETTINGS_KEYS = ['enabled', 'telegram', 'discord', 'slack', 'agent', 'media', 'tts']

    function draftFromStored(s) {
      const src = (s && typeof s === 'object') ? s : {}
      const t = src.telegram || {}
      const d = src.discord || {}
      const sl = src.slack || {}
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
        discord: {
          enabled: d.enabled === true,
          botToken: d.botToken || '',
          webhookUrl: d.webhookUrl || '',
          allowedChannelIds: Array.isArray(d.allowedChannelIds) ? d.allowedChannelIds : [],
        },
        slack: {
          enabled: sl.enabled === true,
          botToken: sl.botToken || '',
          webhookUrl: sl.webhookUrl || '',
          defaultChannel: sl.defaultChannel || '',
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
      const [discordToken, setDiscordToken] = React.useState('')
      const [slackToken, setSlackToken] = React.useState('')
      const [discordChannelsText, setDiscordChannelsText] = React.useState('')
      const [updateState, setUpdateState] = React.useState({
        checking: false,
        updating: false,
        currentVersion: '',
        latestVersion: '',
        updateAvailable: false,
        error: '',
        notice: '',
      })
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
          setDiscordChannelsText(idsToText(stored?.discord?.allowedChannelIds))
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

      const loadUpdateStatus = React.useCallback(async () => {
        setUpdateState((s) => ({ ...s, checking: true, error: '' }))
        try {
          const res = await fetch(`${ROUTE_PREFIX}/update`, { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.ok) {
            setUpdateState((s) => ({
              ...s,
              checking: false,
              currentVersion: data.currentVersion || '',
              latestVersion: data.latestVersion || '',
              updateAvailable: !!data.updateAvailable,
            }))
          } else {
            setUpdateState((s) => ({ ...s, checking: false, error: data.error || `HTTP ${res.status}` }))
          }
        } catch (e) {
          setUpdateState((s) => ({ ...s, checking: false, error: String(e.message || e) }))
        }
      }, [])

      const handleTriggerUpdate = async () => {
        if (updateState.updating) return
        setUpdateState((s) => ({ ...s, updating: true, error: '', notice: '' }))
        try {
          const res = await fetch(`${ROUTE_PREFIX}/update`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'x-dsh-plugin-update': '1',
            },
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
          setUpdateState((s) => ({
            ...s,
            updating: false,
            updateAvailable: false,
            currentVersion: data.updatedVersion || s.latestVersion,
            notice: t('updater.success', { version: data.updatedVersion || s.latestVersion }),
          }))
        } catch (e) {
          setUpdateState((s) => ({
            ...s,
            updating: false,
            error: t('updater.failed', { error: String(e.message || e) }),
          }))
        }
      }

      React.useEffect(() => {
        loadUpdateStatus()
      }, [loadUpdateStatus])

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
        discord: { ...base.discord, ...(patch.discord || {}) },
        slack: { ...base.slack, ...(patch.slack || {}) },
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
          if (discordToken.trim()) next.discord = { ...next.discord, botToken: discordToken.trim() }
          if (slackToken.trim()) next.slack = { ...next.slack, botToken: slackToken.trim() }
          next.discord.allowedChannelIds = textToIds(discordChannelsText)

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
          setDiscordToken('')
          setSlackToken('')
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
              : null,
            (status?.scheduledCount > 0)
              ? React.createElement(
                  'span',
                  { className: 'msgw-badge msgw-badge-ok' },
                  t('badge.cron_count', { count: status.scheduledCount })
                )
              : null
          ),
          React.createElement('div', { className: 'msgw-page-sub' }, t('header.sub'))
        ),

        // Global Alert banners
        err ? React.createElement('div', { className: 'msgw-alert-err' }, err) : null,
        msg ? React.createElement('div', { className: 'msgw-alert-ok' }, msg) : null,

        // Self-Updater Card
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'div',
            { className: 'msgw-section-title' },
            React.createElement('span', null, `🚀 ${t('updater.title')}`),
            React.createElement(
              'div',
              { className: 'msgw-row' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'msgw-btn msgw-btn-mini',
                  disabled: updateState.checking || updateState.updating,
                  onClick: loadUpdateStatus,
                },
                updateState.checking ? t('updater.checking') : t('updater.btn_check')
              ),
              updateState.updateAvailable
                ? React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'msgw-btn msgw-btn-mini msgw-btn-primary',
                      disabled: updateState.updating,
                      onClick: handleTriggerUpdate,
                    },
                    updateState.updating ? t('updater.updating') : t('updater.btn_update', { version: updateState.latestVersion })
                  )
                : null
            )
          ),
          React.createElement('div', { className: 'msgw-section-desc' }, t('updater.desc')),
          React.createElement(
            'div',
            { className: 'msgw-row', style: { fontSize: '13px' } },
            React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } },
              t('updater.current', { version: updateState.currentVersion || status?.version || '...' })
            ),
            updateState.checking
              ? React.createElement('span', { className: 'msgw-badge msgw-badge-warn' }, t('updater.checking'))
              : updateState.updateAvailable
                ? React.createElement('span', { className: 'msgw-badge msgw-badge-warn' }, t('updater.available', { version: updateState.latestVersion }))
                : updateState.currentVersion && !updateState.error
                  ? React.createElement('span', { className: 'msgw-badge msgw-badge-ok' }, `✓ ${t('updater.upToDate')}`)
                  : null
          ),
          updateState.notice ? React.createElement('div', { className: 'msgw-alert-ok' }, updateState.notice) : null,
          updateState.error ? React.createElement('div', { className: 'msgw-alert-err' }, updateState.error) : null
        ),

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

        // Card: Discord Gateway
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'div',
            { className: 'msgw-section-title' },
            React.createElement('span', null, `🎮 ${t('discord')}`),
            React.createElement(
              'button',
              {
                type: 'button',
                className: `msgw-btn msgw-btn-mini ${cfg.discord?.enabled ? 'msgw-btn-danger' : 'msgw-btn-primary'}`,
                disabled: !!busy,
                onClick: () => save({ discord: { enabled: !cfg.discord?.enabled } }),
              },
              cfg.discord?.enabled ? t('disableDiscord') : t('enableDiscord')
            )
          ),
          React.createElement('div', { className: 'msgw-section-desc' }, t('discordSub')),
          React.createElement(Field, { label: t('discordToken'), hint: t('discordTokenHint') },
            React.createElement('input', {
              type: 'password',
              className: 'msgw-input',
              value: discordToken,
              placeholder: (status?.config?.discord?.botTokenConfigured || cfg.discord?.botTokenConfigured) ? '••••••••••••••••' : 'Discord Bot Token',
              onChange: (e) => setDiscordToken(e.target.value),
            })
          ),
          React.createElement(Field, { label: t('discordWebhook'), hint: t('discordWebhookHint') },
            React.createElement('input', {
              className: 'msgw-input',
              value: cfg.discord?.webhookUrl || '',
              placeholder: 'https://discord.com/api/webhooks/...',
              onChange: (e) => setCfg({ ...cfg, discord: { ...cfg.discord, webhookUrl: e.target.value } }),
            })
          ),
          React.createElement(Field, { label: t('discordChannels'), hint: t('discordChannelsHint') },
            React.createElement('textarea', {
              className: 'msgw-textarea',
              value: discordChannelsText,
              onChange: (e) => setDiscordChannelsText(e.target.value),
              rows: 2,
              placeholder: '123456789012345678, 987654321098765432',
            })
          )
        ),

        // Card: Slack Gateway
        React.createElement(
          'div',
          { className: 'msgw-section-card' },
          React.createElement(
            'div',
            { className: 'msgw-section-title' },
            React.createElement('span', null, `💼 ${t('slack')}`),
            React.createElement(
              'button',
              {
                type: 'button',
                className: `msgw-btn msgw-btn-mini ${cfg.slack?.enabled ? 'msgw-btn-danger' : 'msgw-btn-primary'}`,
                disabled: !!busy,
                onClick: () => save({ slack: { enabled: !cfg.slack?.enabled } }),
              },
              cfg.slack?.enabled ? t('disableSlack') : t('enableSlack')
            )
          ),
          React.createElement('div', { className: 'msgw-section-desc' }, t('slackSub')),
          React.createElement(Field, { label: t('slackToken'), hint: t('slackTokenHint') },
            React.createElement('input', {
              type: 'password',
              className: 'msgw-input',
              value: slackToken,
              placeholder: (status?.config?.slack?.botTokenConfigured || cfg.slack?.botTokenConfigured) ? '••••••••••••••••' : 'xoxb-...',
              onChange: (e) => setSlackToken(e.target.value),
            })
          ),
          React.createElement(Field, { label: t('slackWebhook'), hint: t('slackWebhookHint') },
            React.createElement('input', {
              className: 'msgw-input',
              value: cfg.slack?.webhookUrl || '',
              placeholder: 'https://hooks.slack.com/services/...',
              onChange: (e) => setCfg({ ...cfg, slack: { ...cfg.slack, webhookUrl: e.target.value } }),
            })
          ),
          React.createElement(Field, { label: t('slackDefaultChannel'), hint: t('slackDefaultChannelHint') },
            React.createElement('input', {
              className: 'msgw-input',
              value: cfg.slack?.defaultChannel || '',
              placeholder: '#general or C12345678',
              onChange: (e) => setCfg({ ...cfg, slack: { ...cfg.slack, defaultChannel: e.target.value } }),
            })
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
                loc.register(NS, { en, zh })
              }
            } catch (taken) {
              console.warn('[dsh-messenger-gateway] dictionary already registered:', taken && taken.message)
            }
          }, 'dsh-messenger-gateway: dictionaries')
        } else {
          const loc = ctx?.get?.('locale') || ctx?.locale
          if (loc?.register) {
            loc.register(NS, { en, zh })
          }
        }
      } catch (err) {
        console.warn('[dsh-messenger-gateway] dictionary registration error:', err && err.message)
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
