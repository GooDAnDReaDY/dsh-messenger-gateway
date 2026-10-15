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

function isPrivateIPv4(address) {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = Number(p)
    if (n < 0 || n > 255) return false
  }
  const o0 = Number(parts[0])
  const o1 = Number(parts[1])
  if (o0 === 10) return true
  if (o0 === 192 && o1 === 168) return true
  if (o0 === 172 && o1 >= 16 && o1 <= 31) return true
  if (o0 === 169 && o1 === 254) return true
  return false
}

export function isPrivateAddress(value) {
  let address = String(value || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (address.startsWith('::ffff:')) {
    address = address.slice('::ffff:'.length)
  }
  if (isLoopback(address)) return true
  if (isPrivateIPv4(address)) return true

  if (address.includes(':')) {
    const firstHextet = address.split(':')[0]
    const num = Number.parseInt(firstHextet, 16)
    if (!Number.isNaN(num)) {
      if ((num & 0xfe00) === 0xfc00) return true // fc00::/7 ULA (RFC 4193)
      if ((num & 0xffc0) === 0xfe80) return true // fe80::/10 Link-Local (RFC 4291)
    }
  }
  return false
}

export const isLoopbackOrLan = isPrivateAddress

export function isTrustedSettingsRequest(req, expectedSecret) {
  const remote = req?.socket?.remoteAddress
  const host = String(req?.headers?.host || '')
  if (!host) return false

  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false

  const secret = String(expectedSecret || '').trim()
  if (secret) {
    const authHeader = req?.headers?.authorization || ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const tokenHeader = req?.headers?.['x-webhook-secret'] || ''
    const provided = bearer || tokenHeader
    if (provided && timingSafeCompare(provided, secret)) {
      return true
    }
  }

  // Reject non-private / WAN requests without secret
  if (remote !== undefined && !isPrivateAddress(remote)) {
    return false
  }

  // If host is loopback (localhost/127.0.0.1/::1), remote address must also be loopback
  const hostName = host.split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')
  if (isLoopback(hostName) && remote !== undefined && !isLoopback(remote)) {
    return false
  }

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
    if (remote === undefined || isLoopback(remote)) {
      return true
    }
  }

  return isLoopback(remote)
}

export function isAuthorizedMessengerRequest(req, webhooksConfig) {
  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false

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

  const remote = req?.socket?.remoteAddress
  if (remote !== undefined && !isLoopback(remote)) {
    return false
  }

  return isTrustedSettingsRequest(req, secret) || isLoopback(remote)
}

export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

