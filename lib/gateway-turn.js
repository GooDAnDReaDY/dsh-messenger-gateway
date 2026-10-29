import { readFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ensureContentArray } from './content-guard.js'
import { getPersona } from './personas.js'
import { MESSENGER_RELAY_INSTRUCTION, stripReasoningPreamble, splitText } from './text.js'
import { formatInboundDocument, documentOnlyHint, parseDocument } from './documents.js'
import { t } from './locales/index.js'
import { processDiagramsAndTables, processDiagramsAndTablesAsync } from './artifacts.js'
import { prepareTtsText, toTelegramVoiceFile } from './tts.js'
import { shouldSpeakReply } from './voice-prefs.js'
import { speakText, transcribeVoice } from './integrations.js'
import { attachInboundPhoto, photoOnlyHint } from './photos.js'
import { buildOutboundFiles, stripImageUrls } from './outbound.js'
import {
  buildStreamPreview, formatProgressLine, createEditScheduler, startTypingHeartbeat, parseReasoningStream
} from './stream.js'
import { escapeHtml } from './telegram-format.js'
import { formatCostFooter, normalizeUsage, extractSessionStats, calculateEstimatedCostUsd, checkBudgetThreshold } from './cost-tracker.js'
import { recallUserMemories, recordTurnMemory } from './memory-brain.js'

const PLUGIN = 'dsh-messenger-gateway'

export function whenIdleWithTimeout(agent, timeoutMs, signal) {
  const idle = agent.whenIdle()
  if (!timeoutMs || timeoutMs <= 0) return idle
  return Promise.race([
    idle,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('turn timeout (' + timeoutMs + 'ms)')), timeoutMs)
      timer.unref?.()
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }),
  ])
}

export function isSensitiveTool(toolName) {
  if (!toolName) return false
  const tName = String(toolName).toLowerCase()
  const sensitivePatterns = [
    /command/i, /exec/i, /bash/i, /shell/i, /terminal/i,
    /write/i, /edit/i, /delete/i, /remove/i, /patch/i, /create/i,
    /git/i, /deploy/i, /publish/i, /curl/i, /wget/i, /rm$/i,
  ]
  return sensitivePatterns.some((p) => p.test(tName))
}

export function formatApprovalCard(req, locale = "en") {
  const tool = req.toolName || "tool"
  const reason = req.reason ? `\n<i>${escapeHtml(req.reason)}</i>` : ""
  let detail = ""
  const input = req.input

  if (input && typeof input === "object") {
    const cmd = input.CommandLine || input.command || input.cmd
    if (typeof cmd === "string" && cmd.trim()) {
      detail = `\n<pre><code class="language-bash">${escapeHtml(cmd.trim().slice(0, 800))}</code></pre>`
    } else if (typeof input.Path === "string" && (input.Replacement !== undefined || input.Target !== undefined)) {
      const path = input.Path
      const target = String(input.Target ?? "")
      const repl = String(input.Replacement ?? "")
      const fileBasename = path.split(/[\/\\]/).pop() || "file"
      const diffLines = [
        `--- a/${fileBasename}`,
        `+++ b/${fileBasename}`,
      ]
      if (target) {
        for (const line of target.slice(0, 400).split("\n")) diffLines.push(`- ${line}`)
      }
      if (repl) {
        for (const line of repl.slice(0, 400).split("\n")) diffLines.push(`+ ${line}`)
      }
      detail = `\n<b>File:</b> <code>${escapeHtml(path)}</code>\n<pre><code class="language-diff">${escapeHtml(diffLines.join("\n"))}</code></pre>`
    } else if (typeof input.Path === "string" && typeof input.Content === "string") {
      const path = input.Path
      const snippet = input.Content.slice(0, 500)
      detail = `\n<b>File:</b> <code>${escapeHtml(path)}</code>\n<pre><code>${escapeHtml(snippet)}</code></pre>`
    } else {
      try {
        const jsonStr = JSON.stringify(input, null, 2)
        detail = `\n<pre><code>${escapeHtml(jsonStr.slice(0, 500))}</code></pre>`
      } catch { /* safe JSON fallback */ }
    }
  }

  return t("ask.confirm_title", { tool: escapeHtml(tool), reason: reason + detail }, locale, { escape: false })
}

export async function answerApproval(gw, chatKeyValue, req, next) {
  try {
    const tg = gw.tg ? gw.tg() : (gw.config?.telegram || {})
    if (tg.approvalsEnabled === false || tg.approvalsSensitivity === "disabled") {
      return "allowed-once"
    }
    const tool = req.toolName || "tool"
    const sensitivity = tg.approvalsSensitivity || "mutations"
    if (sensitivity === "mutations" && !isSensitiveTool(tool)) {
      return "allowed-once"
    }

    const chat = gw.chats.get(chatKeyValue)
    if (!chat?.target) return next()
    if (chat.sessionAllowlist?.has(tool)) {
      return "allowed-once"
    }
    const locale = gw.resolveLocale ? gw.resolveLocale(chat.target) : "en"
    const text = formatApprovalCard(req, locale)
    const buttons = [
      [
        { id: "allow_once", text: t("ask.allow_once", {}, locale) },
        { id: "deny", text: t("ask.deny", {}, locale) },
      ],
      [
        { id: "steer", text: t("ask.steer", {}, locale) },
        { id: "allow_session", text: t("ask.allow_session", {}, locale) },
      ],
    ]
    const timeoutMs = Number(tg.approvalsTimeoutMs) || 300_000
    const result = await gw.messengerAsk(chat.target, { text, buttons }, timeoutMs)
    if (result?.buttonId === "allow_once" || result?.buttonId === "allow") return "allowed-once"
    if (result?.buttonId === "allow_session") {
      if (!chat.sessionAllowlist) chat.sessionAllowlist = new Set()
      chat.sessionAllowlist.add(tool)
      return "allowed-once"
    }
    if (result?.buttonId === "steer") {
      try {
        const tgAdapter = gw.adapters?.get ? gw.adapters.get("telegram") : gw.adapters?.telegram
        await tgAdapter?.sendTo?.(chat.target.chatId, { text: t("ask.steer_prompt", {}, locale) }, { threadId: chat.target.threadId || 0 })
      } catch { /* best effort prompt */ }
      return "rejected"
    }
    if (result?.buttonId === "deny" || result?.buttonId === "reject") return "rejected"
    return "rejected"
  } catch {
    return "rejected"
  }
}

export async function buildUserContent(gw, input, signal) {
    const { text, attachments = [], replyText, steer, personaOverride, userId } = input
    const parts = []
    parts.push(String(gw.config.agent?.instructionPrefix || MESSENGER_RELAY_INSTRUCTION))
    if (gw.config?.memory?.enabled !== false && gw.config?.memory?.autoInject !== false && userId) {
      try {
        const recalled = await recallUserMemories({
          config: gw.config.memory,
          userId,
          query: text || replyText || '',
          budget: gw.config.memory?.budget,
          signal,
        })
        if (recalled) parts.push(recalled)
      } catch (memErr) {
        gw.ctx?.logger?.debug?.(`[memory-brain] recall error: ${memErr?.message || memErr}`)
      }
    }
    const activePersonaId = personaOverride || gw.personas.getPersonaForChat(input.chatId, input.threadId)
    const activePersona = getPersona(activePersonaId)
    if (activePersona?.instruction) {
      parts.push(`[Persona: ${activePersona.name} (${activePersona.icon})]\n${activePersona.instruction}`)
    }
    if (steer) parts.push('[Steer / addition to current turn: combine with previous instruction, do not restart from scratch]')
    if (replyText?.trim()) parts.push(`[Replying to message: ${replyText.trim()}]`)
    const blocks = []
    for (const att of attachments) {
      if (att.kind === 'photo' || (att.kind === 'sticker' && att.mime?.startsWith('image/'))) {
        try {
          const { ref } = await attachInboundPhoto(gw.ctx, att, {
            signal,
            maxBytes: Number(gw.config.media?.maxImageBytes) || 20 * 1024 * 1024,
          })
          blocks.push({ type: 'image', attachment: ref })
          if (att.kind === 'sticker' && att.emoji) parts.push(`[Sticker ${att.emoji}]`)
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          parts.push(`[Failed to attach image: ${msg}]`)
        }
      } else if (att.kind === 'voice' || att.kind === 'audio') {
        try {
          const bytes = new Uint8Array(await readFile(att.path))
          const transcript = await transcribeVoice(gw.baseUrl(), bytes, att.mime || 'audio/ogg', 'message', signal)
          parts.push(transcript ? `[Voice message transcript: ${transcript}]` : '[Voice message (unrecognized)]')
        } catch (err) {
          if (signal?.aborted) throw err
          const msg = err instanceof Error ? err.message : String(err)
          gw.ctx.logger?.warn?.(`voice: ${msg}`)
          parts.push(`[Voice message (dsh-voice unavailable: ${msg})]`)
        }
      } else if (att.kind === 'document' || att.kind === 'video' || att.kind === 'animation' || att.kind === 'sticker') {
        let parsed = null
        if (att.kind === 'document' && att.path) {
          try {
            const maxDocBytes = Number(gw.config.media?.maxTextInjectBytes) || 100 * 1024
            parsed = await parseDocument(att.path, { maxBytes: maxDocBytes })
          } catch (err) {
            gw.logger?.debug?.('parseDocument fallback:', err?.message || err)
          }
        }
        parts.push(formatInboundDocument(att, parsed))
      } else {
        parts.push(`[File: ${att.path}${att.name ? ` (${att.name})` : ''}]`)
      }
    }
    const photoHint = photoOnlyHint(attachments, text)
    if (photoHint) parts.push(photoHint)
    const docHint = documentOnlyHint(attachments, text)
    if (docHint) parts.push(docHint)
    if (text?.trim()) parts.push(text.trim())
    const textBlock = parts.filter(Boolean).join('\n\n')
    if (textBlock) blocks.unshift({ type: 'text', text: textBlock })
    if (!blocks.length) blocks.push({ type: 'text', text: '(empty message)' })
    return blocks
  }


export async function runGatewayTurn(gw, chat, input, signal) {
    const { reply, typing, startStream, startProgress, react, inboundWasVoice, userId } = input
    const turnStartTime = Date.now()
    chat.turnActive = true
    const sessionId = chat.agent.session.id
    const tg = gw.tg()
    const streaming = tg.streaming === true && typeof startStream === 'function'
    const progressEnabled = tg.progressEnabled !== false
    const collector = { parts: [], lastText: '', streamText: '', reasoningText: '', toolName: '', images: [], reason: undefined, onStream: undefined }
    gw.pending.set(sessionId, collector)
    let stopTyping = () => {}
    let stream = null
    let scheduler = null
    let progress = null
    try {
      if (signal.aborted) return
      if (typeof react === 'function' && tg.reactionsEnabled !== false) {
        react('👀').catch?.((e) => { gw.logger?.debug?.('react error:', e?.message || e) })
      }
      if (typeof typing === 'function') stopTyping = startTypingHeartbeat(typing, 4000, gw.logger)
      if (streaming) {
        try {
          stream = await startStream()
          const turnStartTime = Date.now()
          scheduler = createEditScheduler((text) => stream.edit(text, { parseMode: 'HTML' }), Number(tg.streamEditIntervalMs) || 1200, 250, gw.logger)
          collector.onStream = (text, toolName, reasoningText) => {
            if (text || reasoningText) stopTyping()
            if (!progressEnabled && !text && !reasoningText) return
            const preview = buildStreamPreview(text, progressEnabled ? toolName : '', 3500, {
              reasoningText,
              startTime: turnStartTime,
              showReasoning: tg.showReasoning !== false,
              thoughtCollapse: tg.thoughtCollapse !== false,
              locale: gw.resolveLocale(input),
            })
            scheduler.push(preview)
          }
          if (progressEnabled) {
            scheduler.push(buildStreamPreview('', '', 3500, {
              startTime: turnStartTime,
              showReasoning: tg.showReasoning !== false,
              thoughtCollapse: tg.thoughtCollapse !== false,
              locale: gw.resolveLocale(input),
            }))
          }
        } catch (e) {
          gw.ctx.logger?.warn?.(`stream start: ${e.message}`)
          stream = null
        }
      } else if (progressEnabled && typeof startProgress === 'function') {
        try {
          progress = await startProgress()
          const editProgress = createEditScheduler((text) => progress.edit(text), 800, 250, gw.logger)
          collector.onStream = (_text, toolName) => {
            editProgress.push(formatProgressLine(toolName))
          }
        } catch (e) {
          gw.ctx.logger?.warn?.(`progress start: ${e.message}`)
          progress = null
        }
      }


      const content = await gw.buildUserContent(input, signal)
      chat.agent.followup(createUserMessage({
        content: ensureContentArray(content),
        source: { kind: 'user', plugin: PLUGIN, form: 'relay', origin: 'telegram' },
      }))
      const turnTimeoutMs = Number(gw.config.agent?.turnTimeoutMs) || 600_000
      await whenIdleWithTimeout(chat.agent, turnTimeoutMs, signal)
      if (signal.aborted) {
        if (progress) try { await progress.remove() } catch (err) { gw.logger?.debug?.('progress.remove failed on abort:', err?.message || err) }
        if (typeof react === 'function') react('').catch?.((e) => { gw.logger?.debug?.('react clear error:', e?.message || e) })
        const stoppedMsg = t('msg.turn_stopped', {}, gw.resolveLocale(input))
        if (stream) try { await stream.finalize(stoppedMsg) } catch (err) { gw.recordApiFailure('stream.finalize.stopped', err) }
        else return reply(stoppedMsg)
        return
      }
      const sessions = gw.ctx.get?.('sessions') || gw.ctx.sessions
      await sessions?.flush?.(chat.agent.session)
      if (progress) try { await progress.remove() } catch (err) { gw.logger?.debug?.('progress.remove failed after turn:', err?.message || err) }
      progress = null
      if (typeof react === 'function') react('').catch?.((e) => { gw.logger?.debug?.('react clear error:', e?.message || e) })
      const rawText = stripImageUrls(collector.lastText || collector.streamText || collector.parts.join('\n\n'))
      const parsedReasoning = parseReasoningStream(rawText, collector.reasoningText)
      const cleanContent = stripReasoningPreamble(parsedReasoning.content || rawText)
      let rawAnswer = cleanContent
      if (parsedReasoning.hasThought && tg.showReasoning !== false) {
        const quoteTag = tg.thoughtCollapse !== false ? '<blockquote expandable>' : '<blockquote>'
        const thoughtHeader = String(gw.resolveLocale(input)).toLowerCase().startsWith('zh') ? '🧠 <i>思考过程:</i>' : '🧠 <i>Thought process:</i>'
        rawAnswer = `${quoteTag}${thoughtHeader}\n${escapeHtml(parsedReasoning.thought)}</blockquote>\n\n${cleanContent}`
      }
      const processed = await processDiagramsAndTablesAsync(rawAnswer, {
        artifactPreviews: gw.tg().artifactPreviews !== false,
      })
      const answer = processed.text
      if (collector.reason?.kind === 'error') {
        const err = collector.reason.error
        const msg = t('msg.agent_error', { code: err?.code || 'error', message: err?.message || 'unknown' }, gw.resolveLocale(input))
        gw.sendAlert('error', {
          code: err?.code || 'AGENT_ERROR',
          message: err?.message || 'unknown',
          sessionId,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch((e) => { gw.recordApiFailure('agent_error.sendAlert', e) })
        if (stream) { await scheduler?.flush(); await stream.finalize(msg) }
        else await reply(msg)
        return
      }
      const files = await buildOutboundFiles(gw.ctx, gw.baseUrl(), collector, { signal, logger: gw.ctx.logger })
      const allFiles = [...files, ...(processed.files || [])]
      if (!answer && !allFiles.length) {
        const noResp = t('msg.no_response', {}, gw.resolveLocale(input))
        if (stream) { await scheduler?.flush(); await stream.finalize(noResp) }
        else await reply(noResp)
        return
      }
      if (collector.usage) {
        chat.lastTurnUsage = collector.usage
        if (!chat.turnStats) chat.turnStats = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turnsCount: 0 }
        chat.turnStats.turnsCount++
        const norm = normalizeUsage(collector.usage)
        chat.turnStats.inputTokens += norm.inputTokens
        chat.turnStats.outputTokens += norm.outputTokens
        chat.turnStats.cacheReadTokens += norm.cacheReadTokens
      }
      if (tg.costFooter && answer) {
        const footer = formatCostFooter({
          durationMs: Date.now() - turnStartTime,
          usage: collector.usage,
          model: gw.config?.agent?.model,
        })
        if (footer) answer += footer
      }
      const maxLen = Number(gw.config.agent?.maxMessageLength) || 4000
      const chunks = answer ? splitText(answer, maxLen) : ['']
      if (stream) {
        await scheduler?.flush()
        await stream.finalize(chunks[0] || t('msg.no_response', {}, gw.resolveLocale(input)))
        for (let i = 1; i < chunks.length; i++) await reply({ text: chunks[i] })
        if (allFiles.length) await reply({ files: allFiles })
      } else {
        for (let i = 0; i < chunks.length; i++) {
          await reply({ text: chunks[i] || undefined, files: i === 0 ? allFiles : [] })
        }
      }
      const chatTtsPref = gw.chatTts.get(chat.target?.chatId)
      const speak = shouldSpeakReply({
        globalTts: Boolean(gw.config.tts?.enabled),
        voiceMode: gw.tg().voiceMode || 'mirror',
        inboundWasVoice: Boolean(inboundWasVoice),
        userPref: gw.voicePrefs.get(userId),
        chatPref: chatTtsPref,
      })
      if (speak && !signal.aborted) {
        const isVoiceSummary = gw.config.tts?.voiceSummary === true
        const ttsText = prepareTtsText(answer, gw.config.tts?.maxChars, { voiceSummary: isVoiceSummary })
        if (ttsText) {
          try {
            const spoken = await speakText(gw.baseUrl(), ttsText, signal)
            const voiceFile = await toTelegramVoiceFile(spoken, { logger: gw.ctx.logger })
            if (!signal.aborted && voiceFile) await reply({ files: [voiceFile] })
          } catch (e) {
            if (!signal?.aborted) gw.ctx.logger?.warn?.(`tts: ${e.message}`)
          }
        }
      }
      const budgetThreshold = Number(tg.budgetAlertThresholdUsd || 0)
      if (budgetThreshold > 0) {
        const stats = extractSessionStats(chat)
        const cost = calculateEstimatedCostUsd({
          inputTokens: stats.promptTokens,
          outputTokens: stats.completionTokens,
          cacheReadTokens: stats.cachedTokens,
        }, gw.config?.agent?.model)
        const warning = checkBudgetThreshold({ currentSpendUsd: cost, thresholdUsd: budgetThreshold })
        if (warning && !chat.budgetWarned) {
          chat.budgetWarned = true
          gw.sendAlert('status', {
            title: 'Budget Alert',
            details: `${warning.message} (Chat: ${input.chatId})`,
          }).catch(() => {})
        }
      }
      if (gw.config?.memory?.enabled !== false && userId && answer && input.text) {
        recordTurnMemory({
          config: gw.config.memory,
          userId,
          userText: input.text,
          assistantText: answer,
          logger: gw.ctx?.logger,
        }).catch?.((recErr) => {
          gw.ctx?.logger?.debug?.(`[memory-brain] recordTurnMemory error: ${recErr?.message || recErr}`)
        })
      }
    } catch (err) {
      if (!signal?.aborted) {
        gw.sendAlert('error', {
          code: err?.code || 'EXCEPTION',
          message: err?.message || String(err),
          sessionId,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch((e) => { gw.recordApiFailure('turn_catch.sendAlert', e) })
        try {
          const excMsg = t('msg.exception', { message: err.message }, gw.resolveLocale(input))
          if (stream) await stream.finalize(excMsg)
          else await reply(excMsg)
        } catch (repErr) {
          gw.recordApiFailure('reply.exception_turn', repErr)
        }
      }
    } finally {
      stopTyping()
      if (progress) try { await progress.remove() } catch (err) { gw.logger?.debug?.('progress.remove failed in finally:', err?.message || err) }
      if (typeof react === 'function') react('').catch?.((e) => { gw.logger?.debug?.('react clear error in finally:', e?.message || e) })
      chat.turnActive = false
      chat.abort = undefined
      gw.pending.delete(sessionId)
    }
  }
