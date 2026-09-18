import { basename } from 'node:path'
import {
  IMAGE_EXT_TO_MIME, VIDEO_EXT_TO_MIME, classifyDocument,
  extOf, TELEGRAM_MAX_DOC_BYTES,
} from '../media.js'
import { TEXT_INJECT_EXTS } from '../documents.js'

export async function extractTelegramInboundMedia(adapter, msg, initialText, maxDocBytes = TELEGRAM_MAX_DOC_BYTES, maxTextInjectBytes = 100 * 1024) {
  let text = initialText || ''
  const attachments = []

    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1]
      const { path, file } = await adapter.downloadByFileId(largest.file_id, 'photo', extOf('', '') || '.jpg')
      const ext = extOf(file.file_path, '') || '.jpg'
      attachments.push({ kind: 'photo', path, mime: IMAGE_EXT_TO_MIME[ext] || 'image/jpeg' })
    }
    if (msg.sticker) {
      const st = msg.sticker
      if (st.is_video) {
        try {
          const { path } = await adapter.downloadByFileId(st.file_id, 'sticker-video', '.webm', st.file_unique_id || '')
          attachments.push({ kind: 'animation', path, mime: 'video/webm', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.webm` })
          if (st.emoji) text = `${text}\n[Video sticker ${st.emoji}]`.trim()
        } catch (e) {
          text = `${text}\n[Video sticker ${st.emoji || ''} (download failed: ${e.message})]`.trim()
        }
      } else if (st.is_animated) {
        try {
          const { path } = await adapter.downloadByFileId(st.file_id, 'sticker-anim', '.tgs', st.file_unique_id || '')
          attachments.push({ kind: 'document', path, mime: 'application/x-tgsticker', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.tgs` })
          if (st.emoji) text = `${text}\n[Animated sticker ${st.emoji}]`.trim()
        } catch (e) {
          text = `${text}\n[Animated sticker ${st.emoji || ''} (download failed: ${e.message})]`.trim()
        }
      } else {
        const { path } = await adapter.downloadByFileId(st.file_id, 'sticker', '.webp', st.file_unique_id || '')
        attachments.push({ kind: 'sticker', path, mime: 'image/webp', emoji: st.emoji || '', name: `sticker${st.emoji || ''}.webp` })
      }
    }
    if (msg.voice) {
      const { path } = await adapter.downloadByFileId(msg.voice.file_id, 'voice', '.ogg')
      attachments.push({ kind: 'voice', path, mime: 'audio/ogg' })
    }
    if (msg.audio) {
      const ext = extOf(msg.audio.file_name, msg.audio.mime_type) || '.mp3'
      const { path } = await adapter.downloadByFileId(msg.audio.file_id, 'audio', ext, msg.audio.file_name || '')
      attachments.push({ kind: 'audio', path, mime: msg.audio.mime_type || 'audio/mpeg' })
    }
    if (msg.video) {
      const ext = extOf(msg.video.file_name, msg.video.mime_type) || '.mp4'
      if ((msg.video.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Video too large]`.trim()
      } else {
        const { path } = await adapter.downloadByFileId(msg.video.file_id, 'video', ext, msg.video.file_name || '')
        attachments.push({ kind: 'video', path, mime: msg.video.mime_type || VIDEO_EXT_TO_MIME[ext] || 'video/mp4', name: msg.video.file_name || basename(path) })
      }
    }
    if (msg.video_note) {
      const vn = msg.video_note
      if ((vn.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Video note too large]`.trim()
      } else {
        const { path } = await adapter.downloadByFileId(vn.file_id, 'videonote', '.mp4')
        attachments.push({ kind: 'video', path, mime: 'video/mp4', name: 'video_note.mp4' })
      }
    }
    if (msg.animation) {
      const an = msg.animation
      const ext = extOf(an.file_name, an.mime_type) || '.mp4'
      if ((an.file_size || 0) > maxDocBytes) {
        text = `${text}\n[Animation too large]`.trim()
      } else {
        const { path } = await adapter.downloadByFileId(an.file_id, 'anim', ext, an.file_name || '')
        attachments.push({ kind: 'animation', path, mime: an.mime_type || 'video/mp4', name: an.file_name || basename(path) })
      }
    }
    if (msg.document) {
      const doc = msg.document
      const ext = extOf(doc.file_name, doc.mime_type)
      const kind = classifyDocument(ext, doc.mime_type)
      if (doc.file_size > maxDocBytes) {
        text = `${text}\n[Document too large: ${doc.file_name || 'file'}]`.trim()
      } else if (kind === 'unsupported') {
        const { path } = await adapter.downloadByFileId(doc.file_id, 'doc', ext, doc.file_name || '')
        attachments.push({ kind: 'document', path, mime: doc.mime_type || 'application/octet-stream', name: doc.file_name || basename(path) })
      } else {
        const { path, bytes } = await adapter.downloadByFileId(doc.file_id, 'doc', ext, doc.file_name || '')
        if (kind === 'image') attachments.push({ kind: 'photo', path, mime: IMAGE_EXT_TO_MIME[ext] || doc.mime_type || 'image/jpeg', name: doc.file_name })
        else if (kind === 'video') attachments.push({ kind: 'video', path, mime: VIDEO_EXT_TO_MIME[ext] || doc.mime_type || 'video/mp4', name: doc.file_name })
        else if (bytes.length <= maxTextInjectBytes && TEXT_INJECT_EXTS.has(ext)) {
          const body = new TextDecoder('utf-8', { fatal: false }).decode(bytes).slice(0, maxTextInjectBytes)
          text = `${text}\n\n[Document ${doc.file_name}]\n${body}`.trim()
        } else attachments.push({ kind: 'document', path, mime: doc.mime_type || 'application/octet-stream', name: doc.file_name || basename(path) })
      }
    }


  return { text, attachments }
}

export async function probeTelegramHealth(adapter, timeoutMs = 10000) {
  if (!adapter.token) {
    return { ok: false, error: 'Telegram bot token is empty' }
  }
  const start = Date.now()
  try {
    const res = await fetch(`https://api.telegram.org/bot${adapter.token}/getMe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 10000)),
    })
    const latencyMs = Date.now() - start
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        latencyMs,
        error: json.description || `HTTP ${res.status}`,
      }
    }
    const me = json.result || {}
    adapter.botId = Number(me.id) || adapter.botId
    adapter.botUsername = String(me.username || adapter.botUsername)
    return {
      ok: true,
      latencyMs,
      botId: adapter.botId,
      botUsername: adapter.botUsername,
      firstName: me.first_name || '',
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

