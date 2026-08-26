/** Prepare agent text for dsh-tts and map audio to Telegram voice notes. */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_TTS_MAX_CHARS = 4000

export function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function prepareTtsText(answer, maxChars = DEFAULT_TTS_MAX_CHARS) {
  const stripped = stripMarkdownForSpeech(answer)
  if (!stripped || stripped.length < 2) return ''
  const limit = Math.max(1, Number(maxChars) || DEFAULT_TTS_MAX_CHARS)
  return stripped.slice(0, limit)
}

export function voiceFileNameForMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('ogg') || m.includes('opus')) return 'reply.ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'reply.mp3'
  if (m.includes('wav')) return 'reply.wav'
  return 'reply.dat'
}

export function isOggOpusMime(mime) {
  const m = String(mime || '').toLowerCase()
  return m.includes('ogg') || m.includes('opus')
}

export function voiceReplyFile(spoken) {
  const mime = spoken?.mime || 'audio/mpeg'
  return {
    bytes: spoken.audio,
    mime,
    kind: 'voice',
    name: voiceFileNameForMime(mime),
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (chunk) => { err += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`))
    })
  })
}

/** Convert arbitrary TTS audio bytes to OGG/Opus for Telegram sendVoice. */
export async function convertToOggOpus(audioBytes, inputMime = 'audio/mpeg') {
  const dir = await mkdtemp(join(tmpdir(), 'msgw-tts-'))
  const ext = voiceFileNameForMime(inputMime).split('.').pop() || 'mp3'
  const input = join(dir, `in.${ext}`)
  const output = join(dir, 'out.ogg')
  try {
    await writeFile(input, audioBytes)
    await runFfmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', input,
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-vbr', 'on',
      '-application', 'voip',
      output,
    ])
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Build a Telegram voice-note file from dsh-tts output.
 * Prefer OGG/Opus; if conversion fails and binary missing, fall back to audio (not voice-note).
 */
export async function toTelegramVoiceFile(spoken, { logger } = {}) {
  if (!spoken?.audio?.length) return null
  if (isOggOpusMime(spoken.mime)) {
    return {
      bytes: spoken.audio,
      mime: 'audio/ogg',
      kind: 'voice',
      name: 'reply.ogg',
    }
  }
  try {
    const ogg = await convertToOggOpus(spoken.audio, spoken.mime)
    return {
      bytes: ogg,
      mime: 'audio/ogg',
      kind: 'voice',
      name: 'reply.ogg',
    }
  } catch (err) {
    logger?.warn?.(`tts opus convert skipped: ${err.message}`)
    // Telegram sendVoice rejects mp3; send as audio file instead of failing silently.
    return {
      bytes: spoken.audio,
      mime: spoken.mime || 'audio/mpeg',
      kind: 'audio',
      name: voiceFileNameForMime(spoken.mime),
    }
  }
}
