export async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function isTrustedSettingsRequest(req) {
  const origin = String(req.headers?.origin || '')
  const host = String(req.headers?.host || '')
  if (!origin || !host) return false
  try { return new URL(origin).host === host } catch { return false }
}
