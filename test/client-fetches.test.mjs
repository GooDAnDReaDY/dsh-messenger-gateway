import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('Issue #132: all fetch calls in client.js have an AbortSignal timeout', () => {
  const code = readFileSync(join(root, 'lib/client.js'), 'utf8')
  const lines = code.split('\n')
  const missingSignal = []

  lines.forEach((line, idx) => {
    if (line.includes('fetch(')) {
      const chunk = lines.slice(idx, idx + 10).join(' ')
      if (!chunk.includes('signal:')) {
        missingSignal.push({ line: idx + 1, text: line.trim() })
      }
    }
  })

  assert.equal(missingSignal.length, 0, `All fetch calls in client.js must provide signal, missing: ${JSON.stringify(missingSignal)}`)
})
