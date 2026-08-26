import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generatePairingCode, createPairingStore } from '../lib/pairing.js'

test('generatePairingCode length and alphabet', () => {
  const c = generatePairingCode()
  assert.equal(c.length, 8)
  assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
})

test('pairing store approve flow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msgw-pair-'))
  const store = createPairingStore(join(dir, 'pairing.json'))
  const { code } = store.requestCode(42, { username: 'vadim' })
  const res = store.approveCode(code, 1)
  assert.equal(res.ok, true)
  assert.equal(res.userId, 42)
  assert.equal(store.isApproved(42), true)
})

test('listPending and rejectCode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'msgw-pair2-'))
  const store = createPairingStore(join(dir, 'pairing.json'))
  const { code } = store.requestCode(7, { username: 'u' })
  assert.equal(store.listPending().length, 1)
  assert.equal(store.listPending()[0].code, code)
  const rej = store.rejectCode(code)
  assert.equal(rej.ok, true)
  assert.equal(store.listPending().length, 0)
})
