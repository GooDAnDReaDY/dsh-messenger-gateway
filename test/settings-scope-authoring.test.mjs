import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = readFileSync(join(root, 'lib/client.js'), 'utf8')

test('settings card binds configForms and gates on snapshot status (Issue #44)', () => {
  assert.match(client, /configForms\.get\(\s*NS\s*\)/)
  assert.match(client, /snapStatus === 'loading'/)
  assert.match(client, /snapStatus !== 'ready'/)
  assert.match(client, /getSnapshot/)
  assert.doesNotMatch(client, /fetch\('\/dsh-messenger-gateway\/config'/)
})

test('settings.plugin.item registers key+locale NS and injects ctx (Issue #45)', () => {
  assert.match(client, /name:\s*'settings\.plugin\.item'/)
  assert.match(client, /key:\s*NS/)
  assert.match(client, /locale:\s*NS/)
  assert.match(client, /inject:\s*\(\)\s*=>\s*\(\{\s*ctx\s*\}\)/)
  assert.match(client, /(?:exports\.)?inject\s*[:=]\s*\['slots',\s*'locale',\s*'configForms'\]/)
  assert.doesNotMatch(client, /settings\.section/)
})

test('save collects every field error instead of aborting on first', () => {
  assert.match(client, /SETTINGS_KEYS/)
  assert.match(client, /broken\.push/)
  assert.match(client, /for \(const key of SETTINGS_KEYS\)/)
})

test('settings surface registers the Plugins page row seat first, legacy seats stay as fallbacks (Issue #82)', () => {
  // Row seat key is '<package name>#<row id>', row id as cordis.patch.yml declares it.
  assert.match(client, /const PKG = '@goodandready\/dsh-messenger-gateway'/)
  assert.match(client, /const ROW_ID = 'dsh-messenger-gateway'/)
  assert.match(client, /const ROW_CONFIG_KEY = PKG \+ '#' \+ ROW_ID/)
  assert.match(client, /name: 'plugins\.row\.config',\s*key: ROW_CONFIG_KEY,/)
  assert.match(client, /registerSlotWhenReady\('plugins\.row\.config'/)

  // Newest seat first; the legacy seat must survive as a fallback.
  const rowSeat = client.indexOf("registerSlotWhenReady('plugins.row.config'")
  const legacySeat = client.indexOf("registerSlotWhenReady('settings.plugin.item'")
  assert.ok(rowSeat > -1 && legacySeat > -1, 'both seats are registered')
  assert.ok(rowSeat < legacySeat, 'row seat is registered before the legacy seat')

  // view-aware: one-liner for summary, bare form for the host page (no own card chrome).
  assert.match(client, /props\.view === 'summary'/)
  assert.match(client, /props\.view === 'page'/)
  assert.match(client, /className: 'msgw-page-seat'/)
  assert.match(client, /const t = props\?\.t \|\| makeT\(props\?\.locale\)/)
  assert.match(client, /React\.createElement\(SettingsPage, \{ \.\.\.props, ctx: cardCtx, t \}\)/)

  // The page view must not wrap the form in our own card/border.
  const pageStart = client.indexOf("props.view === 'page'")
  const cardStart = client.indexOf("className: 'msgw-card msgw-section-card'")
  assert.ok(pageStart > -1 && cardStart > pageStart, 'page branch precedes the card render')
  const pageBranch = client.slice(pageStart, cardStart)
  assert.doesNotMatch(pageBranch, /msgw-card/)
  // No second settings root is invented.
  assert.doesNotMatch(client, /settings\.section/)
})

test('Issue #94: PluginCard safely resolves ctx and queries core IconChevronDownOutline14', () => {
  // 1. IconChevronDownOutline14 queried
  assert.match(client, /props\?\.ctx\?\.get\?\.?\('icons'\)\?\.IconChevronDownOutline14/)

  // 2. PluginCard uses safe cardCtx without undeclared global ctx fallback
  assert.match(client, /const cardCtx = \(props && props\.ctx\) \|\| \(typeof ctx !== 'undefined' \? ctx : undefined\)/)
  assert.doesNotMatch(client, /ctx: \(props && props\.ctx\) \|\| ctx,/)
})