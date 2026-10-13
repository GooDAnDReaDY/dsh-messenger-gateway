import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks5h:', 'socks:'])

export function normalizeProxyUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed) return ''
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch (err) {
    throw new Error(`Invalid proxy URL "${trimmed}": ${err.message}`)
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported proxy protocol "${parsed.protocol}". Supported protocols: http, https, socks5, socks5h`)
  }
  return parsed.toString()
}

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

export function createTelegramDispatcher(proxyUrl, options = {}) {
  const normalized = normalizeProxyUrl(proxyUrl)
  if (!normalized) return null

  let undici
  try {
    undici = require('undici')
  } catch (err) {
    throw new Error(`Cannot configure proxy: "undici" module is not available in runtime environment (${err.message})`)
  }

  const ProxyAgent = undici.ProxyAgent
  if (typeof ProxyAgent !== 'function') {
    throw new Error('Cannot configure proxy: "undici.ProxyAgent" is not available')
  }

  try {
    const agent = new ProxyAgent({
      uri: normalized,
      ...(options.agentOptions || {}),
    })
    options.logger?.info?.(`dsh-messenger-gateway: configured Telegram proxy dispatcher via ${new URL(normalized).protocol}//${new URL(normalized).host}`)
    return agent
  } catch (err) {
    throw new Error(`Failed to create proxy dispatcher for "${normalized}": ${err.message}`)
  }
}
