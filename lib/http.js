import { timingSafeEqual } from 'node:crypto'

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

