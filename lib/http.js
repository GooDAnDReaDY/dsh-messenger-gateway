import { timingSafeEqual } from 'node:crypto'

export async function readBody(req, maxBytes = 1_048_576) {
  const cl = Number(req?.headers?.['content-length'])
  if (Number.isFinite(cl) && cl > maxBytes) {
    const err = /** @type {any} */ (new Error(`Payload Too Large: content-length ${cl} exceeds ${maxBytes}`))
    err.status = 413
    err.statusCode = 413
    throw err
  }
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) {
      const err = /** @type {any} */ (new Error(`Payload Too Large: exceeded ${maxBytes} bytes`))
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


export function getConnection(ctx) {
  try {
    const fromCtx = ctx?.reflect?.get
      ? (ctx.reflect.get('connection') || ctx?.connection)
      : (ctx?.get ? (ctx.get('connection') || ctx?.connection) : Reflect.get(ctx || {}, 'connection'))
    if (fromCtx) return fromCtx
    if (ctx?.root) {
      return getConnection(ctx.root)
    }
    return undefined
  } catch {
    return undefined
  }
}

// Loopback hostnames allowed in the Host/Origin/Referer headers for requests
// trusted by loopback remote address. DNS rebinding serves evil.com from
// 127.0.0.1: Host and Origin would match each other but the hostname is not in
// this pin-list, so the request is rejected (#198). Ports are ignored — the
// profile port is not known to the auth layer.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isPinnedLoopbackHost(hostHeader) {
  const raw = String(hostHeader || '').toLowerCase().trim()
  if (!raw) return false
  let name = raw
  if (name.startsWith('[')) {
    const end = name.indexOf(']')
    if (end === -1) return false
    name = name.slice(1, end)
  } else {
    const colon = name.indexOf(':')
    if (colon !== -1) name = name.slice(0, colon)
  }
  return LOOPBACK_HOSTNAMES.has(name)
}

export function isTrustedSettingsRequest(req, expectedSecret, ctx = null, { trustProxy = false } = {}) {
  const remote = req?.socket?.remoteAddress
  // Never trust x-forwarded-host: it is fully attacker-controlled unless the
  // operator explicitly enables trustProxy behind a local reverse proxy.
  const host = String(req?.headers?.host || '')
  if (!host) return false

  const site = String(req?.headers?.['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') return false

  // 1. Explicit secret authentication (Bearer token or x-webhook-secret header)
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

  const hostName = host.split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')

  // If host is loopback (localhost/127.0.0.1/::1), remote address must also be loopback
  if (isLoopback(hostName) && remote !== undefined && !isLoopback(remote)) {
    return false
  }

  // 2. Local loopback remote address (CLI, tests, local host processes):
  // Host and Origin must be pinned loopback hostnames (DNS rebinding defense).
  if (remote !== undefined && isLoopback(remote)) {
    if (!trustProxy && !isPinnedLoopbackHost(host)) return false
    const origin = String(req?.headers?.origin || '')
    if (origin) {
      try {
        const url = new URL(origin)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        if (!trustProxy && !isPinnedLoopbackHost(url.host)) return false
        if (trustProxy && url.host.toLowerCase() !== host.toLowerCase() && !isLoopback(url.hostname)) return false
      } catch {
        return false
      }
    }
    const referer = String(req?.headers?.referer || '')
    if (referer) {
      try {
        const url = new URL(referer)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        if (!trustProxy && !isPinnedLoopbackHost(url.host)) return false
        if (trustProxy && url.host.toLowerCase() !== host.toLowerCase() && !isLoopback(url.hostname)) return false
      } catch {
        return false
      }
    }
    return true
  }

  // 3. Mock/unit-test requests without socket where host is loopback and browser origin/referer/site is verified
  if (remote === undefined && isLoopback(hostName)) {
    const origin = String(req?.headers?.origin || '')
    if (origin) {
      try {
        const url = new URL(origin)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        return isPinnedLoopbackHost(url.host) && isPinnedLoopbackHost(host)
      } catch {
        return false
      }
    }
    const referer = String(req?.headers?.referer || '')
    if (referer) {
      try {
        const url = new URL(referer)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
        return isPinnedLoopbackHost(url.host) && isPinnedLoopbackHost(host)
      } catch {
        return false
      }
    }
    if (site === 'same-origin') {
      return true
    }
    return false
  }

  // 4. DSH Connection Service session authentication (DSH Web UI browser session) (#157)
  const conn = getConnection(ctx) || req?.connectionService || req?.connection
  if (conn && typeof conn.requestRejection === 'function') {
    let rejection
    try {
      rejection = conn.requestRejection(req)
    } catch {
      return false
    }
    if (rejection === undefined) {
      // DSH peer session is authenticated! Enforce same-origin CSRF protection
      const origin = String(req?.headers?.origin || '')
      if (origin) {
        try {
          const url = new URL(origin)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
          if (url.host.toLowerCase() !== host.toLowerCase()) return false
        } catch {
          return false
        }
      }
      const referer = String(req?.headers?.referer || '')
      if (referer) {
        try {
          const url = new URL(referer)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
          if (url.host.toLowerCase() !== host.toLowerCase()) return false
        } catch {
          return false
        }
      }
      return true
    }
    return false
  }

  // 5. Remote caller (LAN RFC 1918 or WAN) without secret and without DSH connection session:
  // LAN is NOT authentication! Fail-closed (#157).
  if (remote !== undefined && isPrivateAddress(remote)) {
    return false
  }
  return false
}

export function isAuthorizedMessengerRequest(req, webhooksConfig, ctx = null, { trustProxy = false } = {}) {
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

  const host = String(req?.headers?.host || '')
  const hostName = host.split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')
  const remote = req?.socket?.remoteAddress

  if (isLoopback(hostName) && remote !== undefined && !isLoopback(remote)) {
    return false
  }

  if (remote !== undefined && isLoopback(remote)) {
    // DNS rebinding defense (#198): the Host header must be a pinned loopback
    // name; a matched attacker domain resolving to 127.0.0.1 is rejected.
    if (!trustProxy && !isPinnedLoopbackHost(host)) return false
    const origin = String(req?.headers?.origin || '')
    if (origin) {
      try {
        const url = new URL(origin)
        if (!trustProxy && !isPinnedLoopbackHost(url.host)) return false
      } catch {
        return false
      }
    }
    return true
  }

  if (remote === undefined && isLoopback(hostName)) {
    const origin = String(req?.headers?.origin || '')
    if (origin) {
      try {
        const url = new URL(origin)
        return isPinnedLoopbackHost(url.host) && isPinnedLoopbackHost(host)
      } catch {
        return false
      }
    }
    return false
  }

  const conn = getConnection(ctx) || req?.connectionService || req?.connection
  if (conn && typeof conn.requestRejection === 'function') {
    try {
      if (conn.requestRejection(req) === undefined) return true
    } catch {
      return false
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

