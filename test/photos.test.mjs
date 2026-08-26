import test from 'node:test'
import assert from 'node:assert/strict'
import { photoOnlyHint } from '../lib/photos.js'

test('photoOnlyHint for single photo without caption', () => {
  assert.equal(photoOnlyHint([{ kind: 'photo' }], ''), '[Пользователь отправил фото]')
})

test('photoOnlyHint skipped when caption present', () => {
  assert.equal(photoOnlyHint([{ kind: 'photo' }], 'look'), '')
})

test('photoOnlyHint for multiple photos', () => {
  assert.equal(photoOnlyHint([{ kind: 'photo' }, { kind: 'photo' }], ''), '[Пользователь отправил 2 фото]')
})
