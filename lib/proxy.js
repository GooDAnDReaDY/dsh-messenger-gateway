// Outbound proxy support for Telegram Bot API calls (HTTP/HTTPS CONNECT and SOCKS5).
//
// Telegram is blocked in some networks, so the gateway needs to reach
// api.telegram.org through a proxy. This module is dependency-free: it tunnels a
// raw TCP socket to the target through the configured proxy and then lets the
// regular node:https stack (with normal certificate verification) talk over it
// via a minimal custom agent.
//
// Supported proxy URLs:
//   http://[user:pass@]host:port
//   https://[user:pass@]host:port
//   socks5://[user:pass@]host:port   (socks5h:// and socks:// are aliases)
//
// Configuration precedence (first non-empty wins): plugin setting -> environment
// (DSH_MESSENGER_TELEGRAM_PROXY, TELEGRAM_PROXY, HTTPS_PROXY, ALL_PROXY, HTTP_PROXY).
// Setting the value to off/none/direct disables the setting and the environment.

import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'

const ENV_KEYS = [
  'DSH_MESSENGER_TELEGRAM_PROXY',
  'TELEGRAM_PROXY',
  'HTTPS_PROXY',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
  'HTTP_PROXY',
  'http_proxy',
]

const DISABLED_VALUES = new Set(['off', 'none', 'no', 'direct', 'false', '0', '-'])

const PROXY_KINDS = {
  'http:': { kind: 'http', protocol: 'http', defaultPort: 80 },
  'https:': { kind: 'https', protocol: 'https', defaultPort: 443 },
  'socks:': { kind: 'socks5', protocol: 'socks5', defaultPort: 1080 },
  'socks5:': { kind: 'socks5', protocol: 'socks5', defaultPort: 1080 },
  'socks5h:': { kind: 'socks5', protocol: 'socks5', defaultPort: 1080 },
}

function decodePart(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function bareHost(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '')
}

/** Parse a proxy URL into a spec object; returns null when no proxy is configured. */
export function parseProxySpec(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (DISABLED_VALUES.has(value.toLowerCase())) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`
  let url
  try {
    url = new URL(candidate)
  } catch {
    throw new Error(`invalid proxy URL: ${value}`)
  }
  const entry = PROXY_KINDS[url.protocol.toLowerCase()]
  if (!entry) {
    throw new Error(`unsupported proxy protocol "${url.protocol}" (use http://, https:// or socks5://)`)
  }
  const host = bareHost(url.hostname)
  if (!host) throw new Error(`invalid proxy URL: ${value}`)
  const spec = {
    kind: entry.kind,
    protocol: entry.protocol,
    host,
    port: Number(url.port) || entry.defaultPort,
    username: decodePart(url.username),
    password: decodePart(url.password),
    raw: value,
  }
  spec.label = maskProxyUrl(spec)
  return spec
}

/** Credential-safe proxy label for logs and the settings UI. */
export function maskProxyUrl(specOrUrl) {
  const spec = typeof specOrUrl === 'string' ? parseProxySpec(specOrUrl) : specOrUrl
  if (!spec) return ''
  const auth = (spec.username || spec.password) ? `${encodeURIComponent(spec.username)}:***@` : ''
  return `${spec.protocol}://${auth}${spec.host}:${spec.port}`
}

/**
 * Resolve the effective proxy URL: explicit plugin setting first, environment
 * second. Returns '' when no proxy should be used.
 */
export function resolveProxySetting(configured, env = process.env) {
  const explicit = String(configured ?? '').trim()
  if (explicit) {
    if (DISABLED_VALUES.has(explicit.toLowerCase())) return ''
    return explicit
  }
  for (const key of ENV_KEYS) {
    const value = String(env?.[key] ?? '').trim()
    if (!value) continue
    if (DISABLED_VALUES.has(value.toLowerCase())) return ''
    return value
  }
  return ''
}

/** True when no_proxy/NO_PROXY says the host must be reached directly. */
export function shouldBypassProxy(host, env = process.env) {
  const rules = String(env?.no_proxy ?? env?.NO_PROXY ?? '').trim()
  if (!rules) return false
  const target = String(host || '').toLowerCase()
  for (const rawRule of rules.split(',')) {
    const rule = rawRule.trim().toLowerCase()
    if (!rule) continue
    if (rule === '*') return true
    const bare = rule.startsWith('.') ? rule.slice(1) : rule
    if (target === bare || target.endsWith(`.${bare}`)) return true
  }
  return false
}

function basicAuthHeader(spec) {
  if (!spec.username && !spec.password) return undefined
  return `Basic ${Buffer.from(`${spec.username}:${spec.password}`).toString('base64')}`
}

function isAborted(signal) {
  return Boolean(signal?.aborted)
}

function abortReason(signal, fallback = 'proxy request aborted') {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  if (reason !== undefined) return new Error(String(reason))
  return new Error(fallback)
}

/** Tunnel to host:port through an http(s) proxy using the CONNECT method. */
function connectViaHttpProxy(spec, host, port, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const mod = spec.kind === 'https' ? https : http
    const headers = { host: `${host}:${port}` }
    const auth = basicAuthHeader(spec)
    if (auth) headers['proxy-authorization'] = auth
    const options = {
      host: spec.host,
      port: spec.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
      headers,
      agent: false,
    }
    if (spec.kind === 'https') options.servername = spec.host

    let settled = false
    const req = mod.request(options)
    const cleanup = () => {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
    }
    const fail = (err) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    const onAbort = () => {
      req.destroy(abortReason(signal))
      fail(abortReason(signal))
    }
    req.setTimeout(Math.max(1000, Number(timeoutMs) || 20000), () => {
      req.destroy(new Error(`proxy CONNECT timeout after ${timeoutMs}ms`))
    })
    req.on('error', (err) => fail(err))
    req.on('response', (res) => {
      res.resume()
      fail(new Error(`proxy CONNECT rejected (HTTP ${res.statusCode}${res.statusCode === 407 ? ' proxy authentication required' : ''})`))
    })
    req.on('connect', (res, socket, head) => {
      if (settled) {
        socket.destroy()
        return
      }
      if (res.statusCode !== 200) {
        socket.destroy()
        fail(new Error(`proxy CONNECT rejected (HTTP ${res.statusCode}${res.statusCode === 407 ? ' proxy authentication required' : ''})`))
        return
      }
      settled = true
      cleanup()
      socket.setNoDelay(true)
      if (head && head.length) socket.unshift(head)
      resolve(socket)
    })
    if (signal) {
      if (isAborted(signal)) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    req.end()
  })
}

/** Small exact-length reader used for the SOCKS5 handshake. */
class SocketReader {
  constructor(socket) {
    this.socket = socket
    this.buffer = Buffer.alloc(0)
    this.error = null
    this.closed = false
    this.waiters = []
    this.onData = (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.wake()
    }
    this.onError = (err) => {
      this.error = err
      this.wake()
    }
    this.onClose = () => {
      this.closed = true
      this.wake()
    }
    socket.on('data', this.onData)
    socket.on('error', this.onError)
    socket.on('close', this.onClose)
  }

  wake() {
    const waiters = this.waiters
    this.waiters = []
    for (const resolve of waiters) resolve()
  }

  async read(size) {
    while (this.buffer.length < size) {
      if (this.error) throw this.error
      if (this.closed) throw new Error('proxy closed the connection during SOCKS5 handshake')
      await new Promise((resolve) => this.waiters.push(resolve))
    }
    const out = this.buffer.subarray(0, size)
    this.buffer = this.buffer.subarray(size)
    return out
  }

  detach() {
    this.socket.removeListener('data', this.onData)
    this.socket.removeListener('error', this.onError)
    this.socket.removeListener('close', this.onClose)
    const rest = this.buffer
    this.buffer = Buffer.alloc(0)
    return rest
  }
}

function socksErrorMessage(code) {
  const map = {
    0x01: 'general SOCKS server failure',
    0x02: 'connection not allowed by ruleset',
    0x03: 'network unreachable',
    0x04: 'host unreachable',
    0x05: 'connection refused',
    0x06: 'TTL expired',
    0x07: 'command not supported',
    0x08: 'address type not supported',
  }
  return map[code] || `error 0x${Number(code).toString(16)}`
}

function encodeSocksTarget(host, port) {
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port, 0)
  if (net.isIPv4(host)) {
    return Buffer.concat([Buffer.from([0x01]), Buffer.from(host.split('.').map(Number)), portBuf])
  }
  if (net.isIPv6(host)) {
    return Buffer.concat([Buffer.from([0x04]), expandIpv6(host), portBuf])
  }
  const name = Buffer.from(host, 'utf8')
  if (name.length > 255) throw new Error(`SOCKS5 target host too long: ${host}`)
  return Buffer.concat([Buffer.from([0x03, name.length]), name, portBuf])
}

function expandIpv6(host) {
  const [head, tail] = host.split('::')
  const headParts = head ? head.split(':').filter(Boolean) : []
  const tailParts = tail !== undefined && tail ? tail.split(':').filter(Boolean) : []
  const missing = 8 - headParts.length - tailParts.length
  const parts = [...headParts, ...Array(Math.max(0, missing)).fill('0'), ...tailParts]
  const buf = Buffer.alloc(16)
  parts.slice(0, 8).forEach((part, index) => buf.writeUInt16BE(parseInt(part || '0', 16) || 0, index * 2))
  return buf
}

function writeAll(socket, buffer) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      socket.removeListener('error', onError)
      reject(err)
    }
    socket.once('error', onError)
    socket.write(buffer, () => {
      socket.removeListener('error', onError)
      resolve()
    })
  })
}

/** Tunnel to host:port through a SOCKS5 proxy (remote DNS resolution). */
async function connectViaSocks5(spec, host, port, { signal, timeoutMs }) {
  const socket = net.connect({ host: spec.host, port: spec.port })
  socket.setNoDelay(true)
  const reader = new SocketReader(socket)
  const cleanup = () => {
    if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
  }
  const onAbort = () => {
    socket.destroy(abortReason(signal))
  }
  const timer = setTimeout(
    () => socket.destroy(new Error(`SOCKS5 handshake timeout after ${timeoutMs}ms`)),
    Math.max(1000, Number(timeoutMs) || 20000),
  )
  if (signal) {
    if (isAborted(signal)) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    const useAuth = Boolean(spec.username || spec.password)
    await writeAll(socket, useAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00]))
    const greeting = await reader.read(2)
    if (greeting[0] !== 0x05) throw new Error(`SOCKS5 proxy reply has unsupported version 0x${greeting[0].toString(16)}`)
    if (greeting[1] === 0xff) throw new Error('SOCKS5 proxy refused all authentication methods')
    if (greeting[1] === 0x02) {
      if (!useAuth) throw new Error('SOCKS5 proxy requires username/password authentication')
      const user = Buffer.from(spec.username, 'utf8')
      const pass = Buffer.from(spec.password, 'utf8')
      await writeAll(socket, Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]))
      const authReply = await reader.read(2)
      if (authReply[1] !== 0x00) throw new Error('SOCKS5 proxy rejected the supplied username/password')
    } else if (greeting[1] !== 0x00) {
      throw new Error(`SOCKS5 proxy selected unsupported authentication method 0x${greeting[1].toString(16)}`)
    }
    await writeAll(socket, Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), encodeSocksTarget(host, port)]))
    const replyHead = await reader.read(4)
    if (replyHead[0] !== 0x05) throw new Error('SOCKS5 proxy returned a malformed reply')
    if (replyHead[1] !== 0x00) {
      throw new Error(`SOCKS5 proxy could not connect to ${host}:${port} (${socksErrorMessage(replyHead[1])})`)
    }
    const atyp = replyHead[3]
    const addrLength = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : (await reader.read(1))[0]
    await reader.read(addrLength + 2)
    const leftover = reader.detach()
    if (leftover.length) socket.unshift(leftover)
    return socket
  } catch (err) {
    reader.detach()
    socket.destroy()
    throw err
  } finally {
    clearTimeout(timer)
    cleanup()
  }
}

async function openTunnel(spec, host, port, options) {
  return spec.kind === 'socks5'
    ? connectViaSocks5(spec, host, port, options)
    : connectViaHttpProxy(spec, host, port, options)
}

function wrapTls(socket, servername, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      socket.destroy(abortReason(signal))
      reject(abortReason(signal))
    }
    const tlsSocket = tls.connect({ socket, servername, ALPNProtocols: ['http/1.1'], minVersion: 'TLSv1.2' }, () => {
      cleanup()
      resolve(tlsSocket)
    })
    tlsSocket.once('error', (err) => {
      cleanup()
      reject(err)
    })
    if (signal) {
      if (isAborted(signal)) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Minimal http.Agent-compatible object: every request gets a fresh tunnel, so
 * there is no socket pool to maintain. Node calls addRequest() and receives the
 * connected socket back through req.onSocket().
 */
class ProxyTunnelAgent {
  constructor({ spec, timeoutMs, logger }) {
    this.spec = spec
    this.timeoutMs = timeoutMs
    this.logger = logger
    this.protocol = 'https:'
    this.defaultPort = 443
    this.keepAlive = false
  }

  getName() {
    return `dsh-telegram-proxy:${this.spec.label}`
  }

  keepSocketAlive() {
    return false
  }

  reuseSocket(socket) {
    try { socket?.destroy() } catch { /* ignore */ }
  }

  destroy() {
    /* nothing pooled */
  }

  addRequest(req, options = {}) {
    const targetHost = options.host || options.hostname
    const targetPort = Number(options.port) || (options.protocol === 'https:' ? 443 : 80)
    const signal = options.__dshAbortSignal
    const servername = options.servername || targetHost
    openTunnel(this.spec, targetHost, targetPort, { signal, timeoutMs: this.timeoutMs })
      .then(async (raw) => {
        try {
          if (signal?.aborted) throw abortReason(signal)
          return options.protocol === 'https:' ? await wrapTls(raw, servername, { signal }) : raw
        } catch (err) {
          raw.destroy()
          throw err
        }
      })
      .then((socket) => {
        if (req.destroyed) {
          socket.destroy()
          return
        }
        req.onSocket(socket)
      })
      .catch((err) => {
        this.logger?.debug?.(`telegram proxy tunnel failed (${this.spec.label}): ${err?.message || err}`)
        failRequest(req, err)
      })
  }
}

// A ClientRequest that never received a socket does not surface destroy(err):
// Node only emits 'error' once the request owns a socket. Report the failure
// explicitly so the awaiting fetch() rejects instead of hanging.
function failRequest(req, err) {
  try { req.destroy() } catch { /* ignore */ }
  try { req.emit('error', err) } catch { /* ignore */ }
}

function headersToObject(headers) {
  if (!headers) return {}
  if (typeof headers.forEach === 'function' && typeof headers.get === 'function') {
    const out = {}
    headers.forEach((value, key) => { out[key] = value })
    return out
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

async function serializeBody(body) {
  if (body === undefined || body === null) return { buffer: null, contentType: undefined }
  if (typeof body === 'string') return { buffer: Buffer.from(body, 'utf8'), contentType: undefined }
  if (Buffer.isBuffer(body)) return { buffer: body, contentType: undefined }
  if (body instanceof Uint8Array) return { buffer: Buffer.from(body), contentType: undefined }
  if (body instanceof ArrayBuffer) return { buffer: Buffer.from(body), contentType: undefined }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { buffer: Buffer.from(body.toString(), 'utf8'), contentType: 'application/x-www-form-urlencoded;charset=UTF-8' }
  }
  if (typeof FormData !== 'undefined' && typeof Request !== 'undefined' && body instanceof FormData) {
    // Let the platform multipart encoder build the body, then read it back.
    const prepared = new Request('http://dsh-messenger-gateway.invalid/', { method: 'POST', body })
    const buffer = Buffer.from(await prepared.arrayBuffer())
    return { buffer, contentType: prepared.headers.get('content-type') || undefined }
  }
  return { buffer: Buffer.from(String(body), 'utf8'), contentType: undefined }
}

function makeResponse(res, buffer, url) {
  const headers = res.headers || {}
  return {
    ok: Number(res.statusCode) >= 200 && Number(res.statusCode) < 300,
    status: Number(res.statusCode),
    statusText: String(res.statusMessage || ''),
    url,
    headers: {
      get: (name) => {
        const value = headers[String(name).toLowerCase()]
        return value === undefined ? null : String(value)
      },
      has: (name) => headers[String(name).toLowerCase()] !== undefined,
      forEach: (cb) => {
        for (const [key, value] of Object.entries(headers)) cb(String(value), key)
      },
      entries: () => Object.entries(headers)[Symbol.iterator](),
    },
    async text() { return buffer.toString('utf8') },
    async json() { return JSON.parse(buffer.toString('utf8')) },
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    },
    async blob() { return new Blob([buffer]) },
  }
}

function requestOverTunnel({ spec, url, method, headers, body, signal, timeoutMs, logger }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    const onAbort = () => {
      const reason = abortReason(signal)
      failRequest(req, reason)
      reject(reason)
    }
    let req
    serializeBody(body).then((payload) => {
      const outgoing = { ...headers }
      delete outgoing['content-length']
      delete outgoing['Content-Length']
      if (payload.contentType && !outgoing['content-type'] && !outgoing['Content-Type']) {
        outgoing['content-type'] = payload.contentType
      }
      if (!outgoing.host && !outgoing.Host) outgoing.host = url.host
      if (signal?.aborted) {
        reject(abortReason(signal))
        return
      }
      const agent = new ProxyTunnelAgent({ spec, timeoutMs, logger })
      req = mod.request({
        protocol: url.protocol,
        host: url.hostname,
        hostname: url.hostname,
        port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: String(method || 'GET').toUpperCase(),
        headers: outgoing,
        servername: url.hostname,
        agent,
        __dshAbortSignal: signal,
      }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
          resolve(makeResponse(res, Buffer.concat(chunks), url.href))
        })
        res.on('error', (err) => {
          if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
          reject(err)
        })
      })
      req.on('error', (err) => {
        if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
        reject(err)
      })
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      req.end(payload.buffer ?? undefined)
    }, reject)
  })
}

/** Canonical proxy URL (compat with the upstream `normalizeProxyUrl`). */
export function normalizeProxyUrl(raw) {
  const spec = parseProxySpec(raw)
  if (!spec) return ''
  const auth = (spec.username || spec.password)
    ? `${encodeURIComponent(spec.username)}:${encodeURIComponent(spec.password)}@`
    : ''
  return `${spec.protocol}://${auth}${spec.host}:${spec.port}`
}

/** Custom Telegram Bot API root (upstream name for the api base URL). */
export function normalizeApiRoot(rawUrl) {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) return 'https://api.telegram.org'
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch (err) {
    throw new Error(`Invalid apiRoot URL "${trimmed}": ${err.message}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported apiRoot protocol "${parsed.protocol}". Must be http: or https:`)
  }
  return trimmed.replace(/\/+$/, '')
}

/**
 * Build a fetch()-compatible function that routes every request through the
 * proxy. Returns null when no proxy is configured (callers keep global fetch).
 * Throws on malformed proxy URLs so the failure is visible in the plugin log.
 */
export function createProxiedFetch(configuredProxy, options = {}) {
  const env = options.env || process.env
  const resolved = resolveProxySetting(configuredProxy, env)
  if (!resolved) return null
  const spec = parseProxySpec(resolved)
  if (!spec) return null
  const timeoutMs = Number(options.timeoutMs) || 20_000
  const logger = options.logger
  const proxied = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : (input instanceof URL ? input.href : input?.url)
    const url = new URL(href)
    if (shouldBypassProxy(url.hostname, env)) return fetch(input, init)
    return requestOverTunnel({
      spec,
      url,
      method: init.method || 'GET',
      headers: headersToObject(init.headers),
      body: init.body,
      signal: init.signal,
      timeoutMs,
      logger,
    })
  }
  proxied.proxy = spec
  proxied.label = spec.label
  proxied.raw = resolved
  return proxied
}

/** Human readable proxy state for logs and the settings UI diagnostics. */
export function describeProxy(configuredProxy, env = process.env) {
  const explicit = String(configuredProxy ?? '').trim()
  try {
    const resolved = resolveProxySetting(configuredProxy, env)
    if (!resolved) return { configured: explicit, source: explicit ? 'settings' : 'env', active: false, label: '' }
    const spec = parseProxySpec(resolved)
    if (!spec) return { configured: explicit, active: false, label: '' }
    return {
      configured: explicit,
      source: explicit ? 'settings' : 'env',
      active: true,
      label: spec.label,
      kind: spec.kind,
    }
  } catch (err) {
    return { configured: explicit, active: false, error: err.message, label: '' }
  }
}
