import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  getPersona,
  listPersonas,
  createPersonaStore,
  BUILTIN_PERSONAS,
} from '../lib/personas.js'

test('listPersonas returns all builtin personas', () => {
  const personas = listPersonas()
  assert.ok(personas.length >= 7)
  const ids = personas.map((p) => p.id)
  assert.ok(ids.includes('default'))
  assert.ok(ids.includes('coder'))
  assert.ok(ids.includes('architect'))
  assert.ok(ids.includes('reviewer'))
  assert.ok(ids.includes('writer'))
  assert.ok(ids.includes('translator'))
  assert.ok(ids.includes('concise'))
})

test('getPersona retrieves persona by id case-insensitively', () => {
  const coder = getPersona('CODER')
  assert.ok(coder)
  assert.equal(coder.id, 'coder')
  assert.equal(coder.icon, '💻')
  assert.ok(coder.instruction.includes('senior software engineer'))

  const def = getPersona('unknown_random_id')
  assert.equal(def, null)
})

test('createPersonaStore persists and loads chat personas', () => {
  const file = join(tmpdir(), `test-personas-${randomUUID()}.json`)
  const store = createPersonaStore(file)

  assert.equal(store.get(12345), 'default')

  store.set(12345, 'coder')
  assert.equal(store.get(12345), 'coder')

  // Reload store from same file
  const reloaded = createPersonaStore(file)
  assert.equal(reloaded.get(12345), 'coder')

  // Reset to default
  reloaded.set(12345, 'default')
  assert.equal(reloaded.get(12345), 'default')
})
