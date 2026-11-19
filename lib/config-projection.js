import { homedir } from 'node:os'
import { join } from 'node:path'
import { Config, plainConfig, resolveInternalBaseUrl } from './config.js'
import { describeProxy, maskProxyUrl } from './proxy.js'
import { listHomes } from './homes.js'
import { resolveEffectiveCwd, getCwdWarning } from './workspace.js'

// Extracted from the plugin entry point (#233): the schema-driven public
// projection and the resolved-config normalization live here so index.js
// only wires lifecycle.

export function resolveConfig(raw) {
  // Unwrap once here: everything downstream reads plain values.
  const plain = plainConfig(raw)
  const cfg = plainConfig(Config(plain))
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  if (!cfg.media.cacheDir) {
    cfg.media = { ...cfg.media, cacheDir: join(home, 'messenger-gateway', 'cache') }
  }
  return cfg
}

// Fields with role('secret') in the schema (#232): the projection never
// exposes the value — only a `<field>Configured` flag (plus proxyUrlMasked
// for the proxy). Keeping this list explicit makes the security surface
// reviewable.
export const SECRET_FIELDS = new Set([
  'telegram.botToken',
  'telegram.webhookSecret',
  'telegram.proxyUrl',
  'discord.botToken',
  'slack.botToken',
  'webhooks.secret',
  'memory.token',
])

// Fields never exposed to the client (server-internal values).
export const HIDDEN_FIELDS = new Set([
  'media.cacheDir',
])

export function publicConfig(cfg, gw, ctx) {
  const proxy = describeProxy(cfg.telegram?.proxyUrl)
  // Schema-driven projection (#232): start from the resolved config itself —
  // every schema field is projected automatically — then replace secrets
  // with configured-flags and append derived runtime values. The parity test
  // asserts every resolved schema leaf is covered.
  const projected = {}
  for (const [section, value] of Object.entries(cfg)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const out = {}
      for (const [key, v] of Object.entries(value)) {
        const path = `${section}.${key}`
        if (HIDDEN_FIELDS.has(path)) continue
        if (SECRET_FIELDS.has(path)) {
          out[`${key}Configured`] = Boolean(String(v ?? '').trim())
          if (path === 'telegram.proxyUrl') out.proxyUrlMasked = maskProxyUrl(v || '')
          continue
        }
        out[key] = v
      }
      projected[section] = out
    } else {
      projected[section] = value
    }
  }
  const tg = projected.telegram || {}
  // Derived runtime values (not stored config) appended on top of the walk.
  tg.homes = listHomes(cfg.telegram)
  tg.proxyActive = Boolean(proxy.active)
  tg.proxyLabel = proxy.label || ''
  tg.proxySource = proxy.source || ''
  tg.proxyError = proxy.error || ''
  projected.internalBaseURL = gw?.baseUrl?.() || resolveInternalBaseUrl(cfg, ctx)
  projected.discord = {
    ...projected.discord,
    webhookConfigured: Boolean(String(cfg.discord?.webhookUrl || '').trim()),
  }
  projected.slack = {
    ...projected.slack,
    webhookConfigured: Boolean(String(cfg.slack?.webhookUrl || '').trim()),
  }
  projected.agent = {
    ...projected.agent,
    effectiveCwd: resolveEffectiveCwd(cfg.agent?.cwd, ctx?.logger),
    defaultCwd: process.cwd(),
    cwdWarning: getCwdWarning(cfg.agent?.cwd),
  }
  return projected
}
