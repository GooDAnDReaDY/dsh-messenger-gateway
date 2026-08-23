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
    const msg = data.error?.message || data.error || JSON.stringify(data).slice(0, 200)
    throw new Error(`${path} failed (HTTP ${res.status}): ${msg}`)
  }
  return data
}

export async function transcribeVoice(baseUrl, bytes, mimeType, mode = 'message') {
  const data = await postJson(baseUrl, '/dsh-voice/transcribe', {
    dataBase64: Buffer.from(bytes).toString('base64'),
    mimeType: mimeType || 'audio/ogg',
    mode,
  })
  return String(data.text || '').trim()
}

export async function speakText(baseUrl, text) {
  const data = await postJson(baseUrl, '/dsh-tts/speak', { text })
  return {
    audio: Buffer.from(data.audioBase64, 'base64'),
    mime: data.mime || 'audio/mpeg',
    provider: data.provider,
  }
}
