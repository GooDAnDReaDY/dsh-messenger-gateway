import { t } from './locales/index.js'
import { REMOVE_REPLY_KEYBOARD, buildQuickActionsKeyboard } from './adapters/telegram.js'
import { getPersona, listPersonas } from './personas.js'
import { parseRelativeTime, formatRemaining } from './scheduler.js'
import { getUpdateStatus, runDirectUpdate } from './updater.js'
import { exportSessionToMarkdown, rewindSession } from './session-ops.js'
import { handleFilesCommand, handleGetCommand } from './file-manager.js'
import { listModelCatalog, buildProvidersKeyboard } from './models.js'
import { normalizeHomeName, upsertHome, listHomes } from './homes.js'
import { handleSetAlertCommand, handleAlertCommand } from './alerts.js'
import { HELP_TEXT } from './commands.js'

export function releaseChatTurn(chat) {
  chat.busy = Promise.resolve()
}

export async function handleGatewayCommand(gw, key, text, input) {
    const parts = text.split(/\s+/)
    const cmd = parts[0].toLowerCase().split('@')[0]
    const { reply, userId, chatId, threadId = 0, platform } = input
    const locale = gw.resolveLocale(input)

    if (cmd === '/start') {
      return reply(t('msg.start', {}, locale), { replyMarkup: REMOVE_REPLY_KEYBOARD })
    }

    if (cmd === '/help') {
      return reply(HELP_TEXT)
    }

    if (cmd === '/lang' || cmd === '/language') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'en' || sub === 'zh') {
        gw.chatLocales.set(chatId, sub)
        return reply(sub === 'zh' ? '语言已切换为中文 (zh)' : 'Language switched to English (en)')
      }
      const cur = gw.chatLocales.get(chatId) || gw.config?.defaultLocale || 'en'
      return reply(`Current language: <b>${cur}</b>\nSwitch: <code>/lang en</code> or <code>/lang zh</code>`)
    }

    if (cmd === '/bind') {
      const targetRole = parts[1]?.toLowerCase()
      if (!targetRole || targetRole === 'list') {
        const cur = gw.personas.getPersonaForChat(chatId, threadId)
        return reply(`${t('persona.title', {}, locale)}\nCurrent bound role: <b>${cur}</b>\nUsage: <code>/bind &lt;role&gt;</code> (or /bind reset)`)
      }
      if (targetRole === 'reset' || targetRole === 'default') {
        gw.personas.set(chatId, 'default', threadId)
        return reply(t('persona.reset', {}, locale))
      }
      const persona = getPersona(targetRole)
      if (!persona) return reply(t('persona.unknown', { target: targetRole }, locale))
      gw.personas.set(chatId, targetRole, threadId)
      return reply(t('persona.bound_topic', { kind: 'role', name: `${persona.icon} ${persona.name}` }, locale))
    }

    if (cmd === '/preset') {
      const presetName = parts[1]
      if (!presetName || presetName === 'list') {
        const cur = gw.personas.getPreset(chatId, threadId) || '(none)'
        return reply(`🎭 <b>Presets:</b>\nCurrent topic preset: <code>${cur}</code>\nUsage: <code>/preset &lt;name&gt;</code> or <code>/preset reset</code>`)
      }
      if (presetName === 'reset' || presetName === 'clear') {
        gw.personas.setPreset(chatId, threadId, null)
        return reply('Preset cleared for this topic.')
      }
      gw.personas.setPreset(chatId, threadId, presetName)
      return reply(t('persona.bound_topic', { kind: 'preset', name: presetName }, locale))
    }

    if (cmd === '/cron') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'list') {
        const list = await gw.scheduler.listRecurring(chatId)
        if (!list.length) return reply(t('cron.none', {}, locale))
        const lines = [t('cron.list_title', {}, locale)]
        for (const task of list) {
          const left = formatRemaining(task.dueAt - Date.now(), locale)
          lines.push(`• <code>${task.id}</code> (every ${formatRemaining(task.intervalMs, locale)}, next in ${left}): ${task.prompt || task.text}`)
        }
        lines.push('\nCancel: <code>/cron cancel ID</code>')
        return reply(lines.join('\n'))
      }
      if (sub === 'cancel') {
        const targetId = parts[2]
        if (!targetId) return reply('Specify cron task ID: <code>/cron cancel ID</code>')
        const ok = await gw.scheduler.cancel(targetId, chatId)
        return reply(ok ? t('cron.cancelled', { id: targetId }, locale) : `Task not found: <code>${targetId}</code>`)
      }
      const specArg = parts[1]
      const promptArg = parts.slice(2).join(' ')
      const ms = parseRelativeTime(specArg)
      if (!ms || !promptArg) {
        return reply('⏱️ <b>Autonomous Cron Tasks:</b>\nCreate: <code>/cron &lt;interval&gt; &lt;prompt&gt;</code>\nExample: <code>/cron 1h check server logs</code>\nList: <code>/cron list</code>\nCancel: <code>/cron cancel ID</code>')
      }
      const task = await gw.scheduler.schedule({
        platform,
        chatId,
        threadId,
        userId,
        text: promptArg,
        prompt: promptArg,
        dueAt: Date.now() + ms,
        recurring: true,
        intervalMs: ms,
      })
      return reply(t('cron.scheduled', { id: task.id, schedule: specArg, prompt: promptArg }, locale))
    }

    if (cmd === '/update') {
      if (!gw.isUserAllowed(userId)) {
        return reply(t('msg.not_allowed', {}, locale))
      }
      const sub = parts[1]?.toLowerCase()
      const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json')
      const updaterOpts = {
        manifestPath,
        packageName: '@goodandready/dsh-messenger-gateway',
      }
      if (sub === 'now' || sub === 'install') {
        await reply(t('update.installing', {}, locale))
        try {
          const res = await runDirectUpdate(updaterOpts)
          if (!res.updated) {
            return reply(t('update.already_latest', { version: res.currentVersion }, locale))
          }
          return reply(t('update.success', { version: res.updatedVersion }, locale))
        } catch (err) {
          return reply(t('update.failed', { error: err.message }, locale))
        }
      }
      try {
        const st = await getUpdateStatus(updaterOpts)
        if (st.updateAvailable) {
          return reply(t('update.available', { current: st.currentVersion, latest: st.latestVersion }, locale))
        }
        return reply(t('update.current', { version: st.currentVersion }, locale))
      } catch (err) {
        return reply(t('update.check_failed', { error: err.message }, locale))
      }
    }

    if (cmd === '/role' || cmd === '/persona') {
      const targetRole = parts[1]?.toLowerCase()
      if (!targetRole || targetRole === 'list') {
        const currentId = gw.personas.getPersonaForChat(chatId, threadId)
        const lines = [
          t('persona.title', {}, locale),
          '',
          ...listPersonas().map((p) => {
            const isCurrent = p.id === currentId ? ' (active)' : ''
            return `${p.icon} <b>${p.id}</b> — ${p.name}: ${p.description}${isCurrent}`
          }),
          '',
          t('persona.usage', {}, locale),
        ]
        return reply(lines.join('\n'))
      }
      if (targetRole === 'reset' || targetRole === 'default') {
        gw.personas.set(chatId, 'default', threadId)
        return reply(t('persona.reset', {}, locale))
      }
      const persona = getPersona(targetRole)
      if (!persona) {
        return reply(t('persona.unknown', { target: targetRole }, locale))
      }
      gw.personas.set(chatId, persona.id, threadId)
      return reply(t('persona.switched', { icon: persona.icon, name: persona.name, description: persona.description }, locale))
    }

    if (cmd === '/skills' || cmd === '/tools') {
      const tools = gw.ctx.get?.('tools') || gw.ctx.tools
      const toolsList = []
      if (tools?.tools) {
        for (const [name, tDef] of tools.tools.entries()) {
          toolsList.push(`• <b>${name}</b>: ${tDef.description || '(no description)'}`)
        }
      }
      if (!toolsList.length) {
        return reply('🛠️ <b>Agent Tools:</b>\n(no tools registered)')
      }
      return reply([
        '🛠️ <b>Active Tools & Skills:</b>',
        '',
        ...toolsList,
      ].join('\n'))
    }

    if (cmd === '/export') {
      const chat = gw.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      try {
        const { filename, buffer, messagesCount } = exportSessionToMarkdown(chat.agent.session)
        if (!messagesCount) {
          return reply(t('export.empty', {}, locale))
        }
        const file = {
          name: filename,
          mime: 'text/markdown',
          kind: 'document',
          bytes: buffer,
        }
        return reply({ text: t('export.title', { count: messagesCount }, locale), files: [file] })
      } catch (err) {
        return reply(`Export error: ${err.message}`)
      }
    }

    if (cmd === '/rewind') {
      const chat = gw.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      const count = Number(parts[1]) || 1
      const res = rewindSession(chat.agent.session, count)
      if (!res.removed) {
        return reply('No turns to rewind in session history.')
      }
      const sessions = gw.ctx.get?.('sessions') || gw.ctx.sessions
      try { await sessions?.flush(chat.agent.session) } catch (err) { gw.logger?.debug?.('rewind session flush error:', err?.message || err) }
      return reply(`⏪ Rewound ${res.removed} messages. Remaining in context: ${res.remaining}.`)
    }

    if (cmd === '/fork') {
      const chat = gw.chats.get(key)
      if (!chat?.agent?.session) {
        return reply(t('msg.no_active_session', {}, locale))
      }
      try {
        const oldSession = chat.agent.session
        const oldMessages = Array.isArray(oldSession.messages)
          ? oldSession.messages.map(m => ({ ...m, content: ensureContentArray(m.content) }))
          : []
        const newChat = await gw.createChat(key, input)
        if (newChat.agent?.session && oldMessages.length) {
          newChat.agent.session.messages = oldMessages
          const sessions = gw.ctx.get?.('sessions') || gw.ctx.sessions
          try { await sessions?.flush(newChat.agent.session) } catch (err) { gw.logger?.debug?.('fork session flush error:', err?.message || err) }
        }
        gw.chats.set(key, newChat)
        return reply(`🔀 Forked session!\nOld session: ${oldSession.id}\nNew session: ${newChat.agent.session.id}\nContext preserved (${oldMessages.length} messages).`)
      } catch (err) {
        return reply(`Fork error: ${err.message}`)
      }
    }

    if (cmd === '/files') {
      const subPath = parts.slice(1).join(' ').trim() || '.'
      const agentCwd = gw.config.agent?.cwd || process.cwd()
      const res = await handleFilesCommand(agentCwd, subPath)
      return reply(res.text)
    }

    if (cmd === '/get') {
      const targetRel = parts.slice(1).join(' ').trim()
      const agentCwd = gw.config.agent?.cwd || process.cwd()
      const maxDocBytes = Number(gw.config.media?.maxDocBytes) || 50 * 1024 * 1024
      const res = await handleGetCommand(agentCwd, targetRel, maxDocBytes)
      return reply(res.files ? { text: res.text, files: res.files } : res.text)
    }


    if (cmd === '/new') {
      const chat = gw.chats.get(key)
      if (chat) {
        if (chat.abort) chat.abort.abort()
        chat.pendingMedia = []
        gw.sessionToChat.delete(String(chat.agent.session.id))
        gw.chats.delete(key)
        await chat.dispose()
        return reply('Session reset.')
      }
      return reply(t('msg.no_active_session', {}, locale))
    }

    if (cmd === '/whoami') {
      const lines = [`User ID: ${userId}`]
      if (chatId) lines.push(`chatId: ${chatId}`)
      if (threadId) lines.push(`threadId: ${threadId}`)
      return reply(lines.join('\n'))
    }

    if (cmd === '/stop') {
      const chat = gw.chats.get(key)
      if (chat?.turnActive || chat?.abort) {
        try { chat.abort?.abort() } catch { /* safe best-effort stop abort */ }
        releaseChatTurn(chat)
        chat.turnActive = false
        return reply(t('msg.turn_stopped', {}, locale))
      }
      return reply('Nothing to stop.')
    }

    if (cmd === '/status') {
      let modelLine = 'model: (not set)'
      try {
        const sel = gw.resolveAgentModel()
        modelLine = `model: ${sel.provider}/${sel.model}`
      } catch (e) {
        modelLine = `model: ${e.message}`
      }
      const home = gw.resolveHomeTarget(platform || 'telegram')
      const homeLine = home
        ? `home: chat ${home.chatId}${home.threadId ? ` topic ${home.threadId}` : ''}`
        : 'home: (not set)'
      const pending = gw.pairing.listPending().length
      const up = Math.max(0, Math.round((Date.now() - gw.stats.startedAt) / 1000))
      const hh = String(Math.floor(up / 3600)).padStart(2, '0')
      const mm = String(Math.floor((up % 3600) / 60)).padStart(2, '0')
      const ss = String(up % 60).padStart(2, '0')
      return reply([
        'Messenger gateway',
        `adapters: ${[...gw.adapters.keys()].join(', ') || '(none)'}`,
        `active chats: ${gw.chats.size}`,
        modelLine,
        homeLine,
        `pairing pending: ${pending}`,
        `transport: ${gw.tg().transport || 'poll'}`,
        `sessionScope: ${gw.config.agent?.sessionScope || 'user'}`,
        `delivered: ${gw.stats.sent}`,
        `errors: ${gw.stats.errors}`,
        `polling conflict: ${gw.tgAdapter?.pollingConflict ? 'yes' : 'no'}`,
        `uptime: ${hh}:${mm}:${ss}`,
      ].join('\n'))
    }

    if (cmd === '/model') {
      if (parts.length >= 3) {
        if (!gw.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
        const provider = parts[1]
        const model = parts.slice(2).join(' ')
        try {
          const adm = gw.ctx.get('agentDefaultModel')
          if (adm?.saveSelection) {
            await adm.saveSelection({ provider, model })
          }
          gw.config.agent = { ...gw.config.agent, provider, model }
          try {
            await gw.hooks?.persistAgentModel?.({ provider, model })
          } catch (e) {
            gw.ctx.logger?.warn?.(`persist agent model: ${e.message}`)
          }
          return reply(t('model.switched', { provider, model }, locale))
        } catch (e) {
          return reply(`Failed to switch model: ${e.message}`)
        }
      }
      try {
        const current = gw.resolveAgentModel()
        const catalog = await listModelCatalog(gw.ctx, current)
        if (!catalog.providers.length) {
          return reply(`Current model: <code>${current.provider}/${current.model}</code>\nSwitch: <code>/model &lt;provider&gt; &lt;model&gt;</code>`)
        }
        const kb = buildProvidersKeyboard(catalog.providers, current)
        return reply([
          t('model.title', {}, locale),
          t('model.current', { current: `${current.provider}/${current.model}` }, locale),
        ].join('\n'), {
          replyMarkup: kb,
        })
      } catch (e) {
        return reply(e.message)
      }
    }

    if (cmd === '/pair') {
      if (!gw.isUserAllowed(userId)) return reply('Only users in allowlist can approve /pair.')
      const code = parts[1]
      if (!code) return reply('Usage: /pair CODE')
      const res = gw.pairing.approveCode(code, userId)
      if (!res.ok) return reply(`Failed: ${res.error}`)
      const merged = gw.effectiveAllowedIds()
      for (const a of gw.adapterList) a.setAllowedUserIds?.(merged)
      try { await gw.hooks?.persistAllowedUserIds?.(merged) } catch (e) {
        gw.ctx.logger?.warn?.(`persist allowlist: ${e.message}`)
      }
      return reply(`Approved user ID ${res.userId}${res.username ? ` (@${res.username})` : ''}.`)
    }

    if (cmd === '/sethome') {
      if (!gw.isUserAllowed(userId)) return reply(t('msg.not_allowed', {}, locale))
      const name = normalizeHomeName(parts[1] || 'default') || 'default'
      try {
        const nextTg = upsertHome(gw.tg(), { name, chatId, threadId })
        await gw.hooks?.persistHomes?.(nextTg)
        gw.config.telegram = nextTg
        return reply(`Home "${name}": chat ${chatId}${threadId ? ` topic ${threadId}` : ''}`)
      } catch (e) {
        return reply(`Failed to save home: ${e.message}`)
      }
    }

    if (cmd === '/home') {
      const homes = listHomes(gw.tg())
      if (!homes.length) return reply('Home is not set. /sethome or /sethome <name>')
      return reply(['Homes:', ...homes.map((h) => `• ${h.name}: chat ${h.chatId}${h.threadId ? ` topic ${h.threadId}` : ''}`)].join('\n'))
    }

    if (cmd === '/setalert') {
      return handleSetAlertCommand(gw, input, locale)
    }

    if (cmd === '/alert') {
      return handleAlertCommand(gw, input, parts)
    }


    if (cmd === '/remind') {
      const sub = parts[1]?.toLowerCase()
      if (sub === 'list') {
        const active = await gw.scheduler.list(chatId)
        if (!active.length) return reply('No active reminders for this chat.')
        const lines = [
          '⏰ <b>Active Reminders:</b>',
          '',
          ...active.map((tItem) => {
            const left = formatRemaining(tItem.dueAt - Date.now(), locale)
            return `• <code>${tItem.id}</code> (in ${left}): ${tItem.text}`
          }),
          '',
          'Cancel: <code>/remind cancel ID</code>',
        ]
        return reply(lines.join('\n'))
      }
      if (sub === 'cancel') {
        const targetId = parts[2]?.trim()
        if (!targetId) return reply('Specify reminder ID: <code>/remind cancel ID</code>')
        const ok = await gw.scheduler.cancel(targetId, chatId)
        return reply(ok ? `✅ Reminder <code>${targetId}</code> cancelled.` : `❌ Reminder <code>${targetId}</code> not found.`)
      }
      const timeArg = parts[1]
      const textArg = parts.slice(2).join(' ').trim()
      const delayMs = parseRelativeTime(timeArg)
      if (!delayMs || !textArg) {
        return reply([
          '⏰ <b>Reminders:</b>',
          'Create: <code>/remind &lt;time&gt; &lt;text&gt;</code>',
          'Examples: <code>/remind 10m Call colleague</code>, <code>/remind 2h Check deploy</code>',
          'List: <code>/remind list</code>',
          'Cancel: <code>/remind cancel ID</code>',
        ].join('\n'))
      }
      const dueAt = Date.now() + delayMs
      const task = await gw.scheduler.schedule({
        platform: platform || 'telegram',
        chatId,
        threadId: threadId || 0,
        userId,
        text: textArg,
        dueAt,
      })
      const left = formatRemaining(delayMs, locale)
      return reply(t('remind.scheduled', { time: new Date(dueAt).toLocaleTimeString(), duration: left, text: textArg }, locale))
    }

    if (cmd === '/voice') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'summary') {
        const val = parts[2]?.toLowerCase()
        if (val === 'on' || val === 'off') {
          if (!gw.config.tts) gw.config.tts = {}
          gw.config.tts.voiceSummary = val === 'on'
          return reply(`Voice summary (TL;DR): ${val === 'on' ? 'enabled' : 'disabled'}`)
        }
        const state = gw.config.tts?.voiceSummary ? 'on' : 'off'
        return reply(`Voice summary (TL;DR): ${state}\nToggle: <code>/voice summary on|off</code>`)
      }
      if (sub === 'on' || sub === 'off') {
        gw.voicePrefs.set(userId, sub === 'on')
        return reply(sub === 'on' ? 'Voice replies: on (for you)' : 'Voice replies: off (for you)')
      }
      const pref = gw.voicePrefs.get(userId)
      const mode = gw.tg().voiceMode || 'mirror'
      const prefLine = pref === null ? 'not set (/voice on|off)' : (pref ? 'on' : 'off')
      const summaryState = gw.config.tts?.voiceSummary ? 'on' : 'off'
      return reply(`voiceMode=${mode}\nyour /voice: ${prefLine}\nglobal tts: ${gw.config.tts?.enabled ? 'on' : 'off'}\nvoice summary: ${summaryState}`)
    }

    if (cmd === '/topic') {
      const topicName = parts.slice(1).join(' ').trim()
      if (!topicName) {
        return reply('Usage: <code>/topic &lt;name&gt;</code>\nCreates a new topic in supergroup with an isolated session.')
      }
      const tgAdapter = gw.getAdapter('telegram')
      if (!tgAdapter?.createForumTopic) {
        return reply('Topic creation is available only in Telegram.')
      }
      try {
        const res = await tgAdapter.createForumTopic(chatId, topicName)
        const newThreadId = res?.message_thread_id
        await reply(`🎯 Created new topic <b>«${topicName}»</b> (ID: <code>${newThreadId}</code>).\nSwitch to the topic to continue working!`)
        if (newThreadId) {
          await tgAdapter.sendTo(chatId, {
            text: `👋 Hello! This is an isolated session for task <b>«${topicName}»</b>.\nHow can I help?`,
          }, { threadId: newThreadId })
        }
        return
      } catch (err) {
        return reply(`Failed to create topic: ${err.message}\n(Ensure the bot is group administrator with Manage Topics permission)`)
      }
    }

    if (cmd === '/top') {
      const mem = process.memoryUsage()
      const rssMb = (mem.rss / 1024 / 1024).toFixed(1)
      const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1)
      const sec = Math.floor((Date.now() - gw.stats.startedAt) / 1000)
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0')
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
      const ss = String(sec % 60).padStart(2, '0')
      let activeReminders = 0
      try { activeReminders = (await gw.scheduler.list()).length } catch (err) { gw.logger?.debug?.('scheduler.list error in /top:', err?.message || err) }
      let currentModel = 'not set'
      try {
        const m = gw.resolveAgentModel()
        currentModel = `${m.provider}/${m.model}`
      } catch (err) {
        gw.logger?.debug?.('resolveAgentModel error in /top:', err?.message || err)
      }

      return reply([
        '📊 <b>DSH System & Resources:</b>',
        `• <b>Memory (RSS):</b> ${rssMb} MB`,
        `• <b>Heap:</b> ${heapMb} MB`,
        `• <b>Uptime:</b> ${hh}:${mm}:${ss}`,
        `• <b>Active chats:</b> ${gw.chats.size}`,
        `• <b>Queued reminders:</b> ${activeReminders}`,
        `• <b>Active model:</b> <code>${currentModel}</code>`,
        `• <b>Messages sent:</b> ${gw.stats.sent}`,
        `• <b>Errors:</b> ${gw.stats.errors}`,
      ].join('\n'))
    }

    if (cmd === '/keyboard') {
      const sub = String(parts[1] || '').toLowerCase()
      const tgAdapter = gw.getAdapter('telegram')
      if (sub === 'on') {
        if (tgAdapter) tgAdapter.quickActions = true
        return reply('Quick action keyboard enabled.', {
          replyMarkup: buildQuickActionsKeyboard(),
        })
      }
      if (sub === 'off') {
        if (tgAdapter) tgAdapter.quickActions = false
        return reply('Quick action keyboard disabled.', {
          replyMarkup: REMOVE_REPLY_KEYBOARD,
        })
      }
      const curState = tgAdapter?.quickActions ? 'enabled' : 'disabled'
      return reply([
        '⌨️ <b>Quick Action Keyboard:</b>',
        `Current state: <b>${curState}</b>`,
        '',
        'Commands:',
        '<code>/keyboard on</code> — show buttons',
        '<code>/keyboard off</code> — hide buttons',
      ].join('\n'))
    }

    if (cmd === '/tts') {
      const sub = String(parts[1] || 'status').toLowerCase()
      if (sub === 'on' || sub === 'off') {
        gw.chatTts.set(chatId, sub === 'on')
        return reply(sub === 'on' ? 'Speech in this chat: on' : 'Speech in this chat: off')
      }
      const cur = gw.chatTts.get(chatId)
      const line = cur === null ? 'not set (/tts on|off)' : (cur ? 'on' : 'off')
      return reply(`Speech in this chat: ${line}\nglobal tts: ${gw.config.tts?.enabled ? 'on' : 'off'}`)
    }

    if (cmd === '/mute') {
      gw.setMuted(chatId, true)
      return reply(t('msg.muted_on', {}, locale))
    }

    if (cmd === '/unmute') {
      gw.setMuted(chatId, false)
      return reply(t('msg.muted_off', {}, locale))
    }

    return reply(t('msg.unknown_command', { cmd }, locale))
  }
