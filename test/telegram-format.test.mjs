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
