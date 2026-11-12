import test from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

test('pack-check: no release tarballs in source root (#184)', () => {
  const rootFiles = fs.readdirSync(process.cwd())
  const strayTarballs = rootFiles.filter((f) => f.endsWith('.tgz'))
  assert.deepEqual(strayTarballs, [], 'Source root must not contain stray .tgz archives')
})

test('pack-check: script runs cleanly without oversized files (#184)', () => {
  const result = execSync('node scripts/pack-check.mjs', { encoding: 'utf8' })
  assert.match(result, /\[pack:check\] OK:/)
})
