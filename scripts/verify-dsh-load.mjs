#!/usr/bin/env node
import { existsSync, lstatSync } from 'node:fs'
import { symlink, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localNm = join(root, 'node_modules')
const deps = process.env.DSH_PROFILE_NODE_MODULES
const required = process.env.DSH_LOAD_REQUIRED === '1'

if (!deps || !existsSync(join(deps, '@deepseek-ai/schemastery/package.json'))) {
  const msg = '[verify-dsh-load] set DSH_PROFILE_NODE_MODULES to web profile node_modules'
  if (required) { console.error(msg); process.exit(1) }
  console.warn(msg + ' (skip)')
  process.exit(0)
}

let linked = false
if (!existsSync(localNm)) {
  await symlink(deps, localNm, 'dir')
  linked = true
}

try {
  const { Config } = await import(join(root, 'lib/config.js'))
  Config({})
  Config({ telegram: { enabled: true, textFormat: 'html' } })
  console.log('[verify-dsh-load] OK config schema')
} finally {
  if (linked) {
    try { if (lstatSync(localNm).isSymbolicLink()) await unlink(localNm) } catch {}
  }
}
