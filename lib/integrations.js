export function formatApiError(data, status) {
  const err = data?.error
  const msg = typeof err === 'string' ? err
    : (err?.message || err?.code || JSON.stringify(data).slice(0, 200))
  return `${msg} (HTTP ${status})`
}

export async function postJson(baseUrl, path, body, signal) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(`${path} failed: ${formatApiError(data, res.status)}`)
  }
  return data
}

/** Transcribe audio via dsh-voice message chain (Telegram voice/audio). */
export async function transcribeVoice(baseUrl, bytes, mimeType, mode = 'message', signal) {
  const data = await postJson(baseUrl, '/dsh-voice/transcribe', {
    dataBase64: Buffer.from(bytes).toString('base64'),
    mimeType: mimeType || 'audio/ogg',
    mode,
  }, signal)
  return String(data.text || '').trim()
}

export async function speakText(baseUrl, text, signal) {
  const data = await postJson(baseUrl, '/dsh-tts/speak', { text }, signal)
  return {
    audio: Buffer.from(data.audioBase64, 'base64'),
    mime: data.mime || 'audio/mpeg',
    provider: data.provider,
  }
}
