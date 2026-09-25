import { timingSafeEqual } from 'node:crypto'

export async function readBody(req, maxBytes = 1_048_576) {
  const cl = Number(req?.headers?.['content-length'])
  if (Number.isFinite(cl) && cl > maxBytes) {
    const err = new Error(`Payload Too Large: content-length ${cl} exceeds ${maxBytes}`)
    err.status = 413
    err.statusCode = 413
    throw err
  }
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) {
      const err = new Error(`Payload Too Large: exceeded ${maxBytes} bytes`)
      err.status = 413
      err.statusCode = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function writeJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function isTrustedSettingsRequest(req) {
  const host = String(req.headers?.host || '')
  if (!host) return false

  const origin = String(req.headers?.origin || '')
  if (origin) {
    try { return new URL(origin).host === host } catch { return false }
  }

  const secFetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (secFetchSite === 'same-origin') return true

  const referer = String(req.headers?.referer || '')
  if (referer) {
    try { return new URL(referer).host === host } catch { return false }
  }

  return false
}

export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

