import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, markdownToTelegramHtml, prepareTelegramText } from '../lib/telegram-format.js'

test('escapeHtml escapes reserved chars', () => {
  assert.equal(escapeHtml('a & b <c>'), 'a &amp; b &lt;c&gt;')
})

test('markdownToTelegramHtml bold and italic', () => {
  assert.equal(markdownToTelegramHtml('**bold** and *italic*'), '<b>bold</b> and <i>italic</i>')
})

test('markdownToTelegramHtml code blocks', () => {
  const out = markdownToTelegramHtml('use `x` and\n```js\na < b\n```')
  assert.match(out, /<code>x<\/code>/)
  assert.match(out, /<pre><code>js\na &lt; b<\/code><\/pre>/)
})

test('markdownToTelegramHtml links and headers', () => {
  const out = markdownToTelegramHtml('## Title\n[site](https://example.com)')
  assert.match(out, /<b>Title<\/b>/)
  assert.match(out, /<a href="https:\/\/example.com">site<\/a>/)
})

test('prepareTelegramText plain mode', () => {
  assert.deepEqual(prepareTelegramText('**x**', 'plain'), { text: '**x**', parseMode: undefined })
})

test('markdownToTelegramHtml gfm 2-col table -> key/value bullets', () => {
  const md = '| Name | Role |\n| --- | --- |\n| Alice | Admin |\n| Bob | User |'
  const out = markdownToTelegramHtml(md)
  assert.match(out, /• <b>Alice<\/b>: Admin/)
  assert.match(out, /• <b>Bob<\/b>: User/)
  assert.doesNotMatch(out, /\|/)
})

test('markdownToTelegramHtml gfm 3-col table -> heading + bullets', () => {
  const md = '| Item | Qty | Price |\n| --- | --- | --- |\n| Apples | 3 | 1.20 |'
  const out = markdownToTelegramHtml(md)
  assert.match(out, /<b>Apples<\/b>/)
  assert.match(out, /• Qty: 3/)
  assert.match(out, /• Price: 1\.20/)
  assert.doesNotMatch(out, /\|/)
})

test('markdownToTelegramHtml table cell renders inline bold', () => {
  const md = '| K | V |\n| --- | --- |\n| note | has **bold** |'
  const out = markdownToTelegramHtml(md)
  assert.match(out, /• <b>note<\/b>: has <b>bold<\/b>/)
})

test('markdownToTelegramHtml task list', () => {
  const out = markdownToTelegramHtml('- [x] done\n- [ ] todo')
  assert.match(out, /☑ done/)
  assert.match(out, /☐ todo/)
})

test('markdownToTelegramHtml details -> summary + body', () => {
  const md = '<details><summary>Spoiler</summary>hidden text</details>'
  const out = markdownToTelegramHtml(md)
  assert.match(out, /<b>Spoiler<\/b>/)
  assert.match(out, /hidden text/)
  assert.doesNotMatch(out, /<details>/)
})

test('markdownToTelegramHtml ignores lone pipe line', () => {
  const out = markdownToTelegramHtml('a | b without table')
  assert.match(out, /a \| b without table/)
})
