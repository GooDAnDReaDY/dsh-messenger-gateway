import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMultiSelectKeyboard,
  normalizeAskOptions,
  parseAskCallback,
  buildCallbackData,
} from '../lib/ask.js'

test('normalizeAskOptions flattens strings and objects', () => {
  const opts = normalizeAskOptions(['Option A', { id: 'b', text: 'Option B', selected: true }])
  assert.equal(opts.length, 2)
  assert.deepEqual(opts[0], { id: '1', text: 'Option A', selected: false })
  assert.deepEqual(opts[1], { id: 'b', text: 'Option B', selected: true })
})

test('buildMultiSelectKeyboard renders checkboxes and action buttons', () => {
  const token = 'testtoken123'
  const options = [
    { id: 'opt1', text: 'Alpha' },
    { id: 'opt2', text: 'Beta' },
  ]
  const selected = new Set(['opt1'])
  const { replyMarkup, callbackKeys, page, maxPages } = buildMultiSelectKeyboard(token, options, selected, 0, 6)

  assert.equal(page, 0)
  assert.equal(maxPages, 1)
  assert.ok(replyMarkup?.inline_keyboard)

  const rows = replyMarkup.inline_keyboard
  assert.equal(rows.length, 3)
  assert.equal(rows[0][0].text, '☑️ Alpha')
  assert.equal(rows[1][0].text, '⬜️ Beta')
  assert.equal(rows[2][0].text, '✅ Готово')
  assert.equal(rows[2][1].text, '❌ Отмена')

  assert.ok(callbackKeys.includes(buildCallbackData(token, 't:opt1')))
  assert.ok(callbackKeys.includes(buildCallbackData(token, 't:opt2')))
  assert.ok(callbackKeys.includes(buildCallbackData(token, 'done')))
  assert.ok(callbackKeys.includes(buildCallbackData(token, 'cancel')))
})

test('buildMultiSelectKeyboard handles pagination correctly', () => {
  const token = 'testtoken123'
  const options = Array.from({ length: 15 }, (_, i) => ({ id: `opt_${i}`, text: `Item ${i + 1}` }))
  const selected = new Set(['opt_0', 'opt_14'])

  const page0 = buildMultiSelectKeyboard(token, options, selected, 0, 6)
  assert.equal(page0.maxPages, 3)
  assert.equal(page0.page, 0)
  assert.equal(page0.replyMarkup.inline_keyboard.length, 8)
  const navRow0 = page0.replyMarkup.inline_keyboard[6]
  assert.equal(navRow0.length, 2)
  assert.equal(navRow0[0].text, '1/3')
  assert.equal(navRow0[1].text, 'Вперед ➡️')

  const page1 = buildMultiSelectKeyboard(token, options, selected, 1, 6)
  assert.equal(page1.page, 1)
  const navRow1 = page1.replyMarkup.inline_keyboard[6]
  assert.equal(navRow1.length, 3)
  assert.equal(navRow1[0].text, '⬅️ Назад')
  assert.equal(navRow1[1].text, '2/3')
  assert.equal(navRow1[2].text, 'Вперед ➡️')

  const page2 = buildMultiSelectKeyboard(token, options, selected, 2, 6)
  assert.equal(page2.page, 2)
  const navRow2 = page2.replyMarkup.inline_keyboard[3]
  assert.equal(navRow2[0].text, '⬅️ Назад')
  assert.equal(navRow2[1].text, '3/3')
})

test('parseAskCallback parses actions, toggles, pages and single select', () => {
  assert.deepEqual(parseAskCallback('tok1:done'), { token: 'tok1', kind: 'done', id: 'done' })
  assert.deepEqual(parseAskCallback('tok1:cancel'), { token: 'tok1', kind: 'cancel', id: 'cancel' })
  assert.deepEqual(parseAskCallback('tok1:t:opt_1'), { token: 'tok1', kind: 'toggle', id: 'opt_1' })
  assert.deepEqual(parseAskCallback('tok1:p:2'), { token: 'tok1', kind: 'page', page: 2 })
  assert.deepEqual(parseAskCallback('tok1:custom_btn'), { token: 'tok1', kind: 'select', id: 'custom_btn' })
  assert.deepEqual(parseAskCallback('invalid'), { token: undefined, kind: 'unknown', id: 'invalid' })
})
