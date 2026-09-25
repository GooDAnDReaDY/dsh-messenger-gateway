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

export function isLoopback(value) {
  const address = String(value || '').toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.')
}

export function isTrustedSettingsRequest(req) {
  const remote = req?.socket?.remoteAddress
  const host = String(req?.headers?.host || '')
  if (!host) return false

  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false

  const origin = String(req?.headers?.origin || '')
  if (origin) {
    try {
      const url = new URL(origin)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      return url.host.toLowerCase() === host.toLowerCase()
    } catch {
      return false
    }
  }

  const referer = String(req?.headers?.referer || '')
  if (referer) {
    try {
      const url = new URL(referer)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      return url.host.toLowerCase() === host.toLowerCase()
    } catch {
      return false
    }
  }

  if (site === 'same-origin') {
    if (remote !== undefined && !isLoopback(remote)) return false
    return true
  }

  return isLoopback(remote)
}

export function isAuthorizedMessengerRequest(req, webhooksConfig) {
  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false

  if (isTrustedSettingsRequest(req)) return true
  if (isLoopback(req?.socket?.remoteAddress)) return true

  const secret = String(webhooksConfig?.secret || '').trim()
  if (secret) {
    const authHeader = req?.headers?.authorization || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const tokenHeader = req?.headers?.['x-webhook-secret'] || ''
    const provided = bearer || tokenHeader
    if (provided && timingSafeCompare(provided, secret)) {
      return true
    }
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

