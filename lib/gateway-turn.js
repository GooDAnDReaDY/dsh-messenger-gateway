import { readFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ensureContentArray } from './content-guard.js'
import { getPersona } from './personas.js'
import { MESSENGER_RELAY_INSTRUCTION, stripReasoningPreamble, splitText } from './text.js'
import { formatInboundDocument, documentOnlyHint, parseDocument } from './documents.js'
import { t } from './locales/index.js'
import { processDiagramsAndTables } from './artifacts.js'
import { prepareTtsText, toTelegramVoiceFile } from './tts.js'
import { shouldSpeakReply } from './voice-prefs.js'
import { speakText, transcribeVoice } from './integrations.js'
import { attachInboundPhoto, photoOnlyHint } from './photos.js'
import { buildOutboundFiles, stripImageUrls } from './outbound.js'
import {
  buildStreamPreview, formatProgressLine, createEditScheduler, startTypingHeartbeat
} from './stream.js'

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

export async function answerApproval(gw, chatKeyValue, req, next) {
    try {
      const chat = gw.chats.get(chatKeyValue)
      if (!chat?.target) return next()
      const tool = req.toolName || 'tool'
      if (chat.sessionAllowlist?.has(tool)) {
        return 'allowed-once'
      }
      const locale = gw.resolveLocale(chat.target)
      const reason = req.reason ? `\n<i>${req.reason}</i>` : ''
      let detail = ''
      if (req.input && typeof req.input === 'object') {
        try {
          const jsonStr = JSON.stringify(req.input, null, 2)
          detail = `\n<pre><code>${jsonStr.slice(0, 500)}</code></pre>`
        } catch { /* safe JSON serialization fallback */ }
      }
      const text = t('ask.confirm_title', { tool, reason: reason + detail }, locale)
      const buttons = [
        [
          { id: 'allow_once', text: t('ask.allow_once', {}, locale) },
          { id: 'allow_session', text: t('ask.allow_session', {}, locale) },
          { id: 'deny', text: t('ask.deny', {}, locale) },
        ],
      ]
      const result = await gw.messengerAsk(chat.target, { text, buttons }, 300_000)
      if (result?.buttonId === 'allow_once' || result?.buttonId === 'allow') return 'allowed-once'
      if (result?.buttonId === 'allow_session') {
        if (!chat.sessionAllowlist) chat.sessionAllowlist = new Set()
        chat.sessionAllowlist.add(tool)
        return 'allowed-once'
      }
      if (result?.buttonId === 'deny') return 'rejected'
      return next()
    } catch {
      return next()
    }
  }

export async function buildUserContent(gw, input, signal) {
    const { text, attachments = [], replyText, steer, personaOverride } = input
    const parts = []
    parts.push(String(gw.config.agent?.instructionPrefix || MESSENGER_RELAY_INSTRUCTION))
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
    chat.turnActive = true
    const sessionId = chat.agent.session.id
    const tg = gw.tg()
    const streaming = tg.streaming === true && typeof startStream === 'function'
    const progressEnabled = tg.progressEnabled !== false
    const collector = { parts: [], lastText: '', streamText: '', toolName: '', images: [], reason: undefined, onStream: undefined }
    gw.pending.set(sessionId, collector)
    let stopTyping = () => {}
    let stream = null
    let scheduler = null
    let progress = null
    try {
      if (signal.aborted) return
      if (typeof react === 'function' && tg.reactionsEnabled !== false) {
        react('👀').catch?.(() => {})
      }
      if (typeof typing === 'function') stopTyping = startTypingHeartbeat(typing, 4000)
      if (streaming) {
        try {
          stream = await startStream()
          scheduler = createEditScheduler((text) => stream.edit(text), Number(tg.streamEditIntervalMs) || 1200)
          collector.onStream = (text, toolName) => {
            if (text) stopTyping()
            if (!progressEnabled && !text) return
            scheduler.push(buildStreamPreview(text, progressEnabled ? toolName : ''))
          }
          if (progressEnabled) scheduler.push(buildStreamPreview('', ''))
        } catch (e) {
          gw.ctx.logger?.warn?.(`stream start: ${e.message}`)
          stream = null
        }
      } else if (progressEnabled && typeof startProgress === 'function') {
        try {
          progress = await startProgress()
          const editProgress = createEditScheduler((text) => progress.edit(text), 800)
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
        if (typeof react === 'function') react('').catch?.(() => {})
        const stoppedMsg = t('msg.turn_stopped', {}, gw.resolveLocale(input))
        if (stream) try { await stream.finalize(stoppedMsg) } catch (err) { gw.recordApiFailure('stream.finalize.stopped', err) }
        else return reply(stoppedMsg)
        return
      }
      const sessions = gw.ctx.get?.('sessions') || gw.ctx.sessions
      await sessions?.flush?.(chat.agent.session)
      if (progress) try { await progress.remove() } catch (err) { gw.logger?.debug?.('progress.remove failed after turn:', err?.message || err) }
      progress = null
      if (typeof react === 'function') react('').catch?.(() => {})
      const rawAnswer = stripReasoningPreamble(stripImageUrls(collector.lastText || collector.streamText || collector.parts.join('\n\n')))
      const processed = processDiagramsAndTables(rawAnswer, {
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
        }).catch(() => {})
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
    } catch (err) {
      if (!signal?.aborted) {
        gw.sendAlert('error', {
          code: err?.code || 'EXCEPTION',
          message: err?.message || String(err),
          sessionId,
          chatId: input.chatId,
          threadId: input.threadId,
        }).catch(() => {})
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
      if (typeof react === 'function') react('').catch?.(() => {})
      chat.turnActive = false
      chat.abort = undefined
      gw.pending.delete(sessionId)
    }
  }
