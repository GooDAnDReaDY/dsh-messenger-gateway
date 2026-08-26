#!/usr/bin/env node
/** HTTP smoke against a running dsh-web with messenger-gateway. */
const base = process.env.MSGW_BASE || 'http://127.0.0.1:3080'

async function get(path) {
  const res = await fetch(base + path)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, text }
}

const fails = []
function check(name, ok, detail = '') {
  if (ok) console.log('OK ', name)
  else { console.log('FAIL', name, detail); fails.push(name) }
}

const status = await get('/dsh-messenger-gateway/status')
check('status 200', status.status === 200, String(status.status))
check('status ok', status.json?.ok === true)
check('status running', status.json?.running === true)
check('telegram adapter', (status.json?.adapters || []).includes('telegram'))

const cfg = await get('/dsh-messenger-gateway/config')
check('config 200', cfg.status === 200)
check('config has telegram', Boolean(cfg.json?.config?.telegram))

const client = await get('/plugins/@goodandready/dsh-messenger-gateway/client.js')
check('client.js 200', client.status === 200)
check('client ModuleLoader', client.text.includes('__ModuleLoader__.load'))
check('client no glue className', !client.text.includes("form'className"))

if (fails.length) {
  console.error('smoke failed:', fails.join(', '))
  process.exit(1)
}
console.log('smoke passed')
