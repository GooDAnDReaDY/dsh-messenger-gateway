import test from 'node:test'
import assert from 'node:assert/strict'
import { formatApiError } from '../lib/integrations.js'

test('formatApiError reads nested message', () => {
  const s = formatApiError({ ok: false, error: { code: 'chain', message: 'no provider' } }, 502)
  assert.match(s, /no provider/)
  assert.match(s, /502/)
})
