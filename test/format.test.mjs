// Telegram HTML formatting: command answers carry ready-made HTML tags while the
// pipeline is Markdown-first, so the whitelist/entity handling has to keep both
// working and stay safe against injection.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { markdownToTelegramHtml, prepareTelegramText, stripSafeTags } from '../lib/telegram-format.js'

test('plugin HTML tags survive the Markdown pipeline', () => {
  const skills = prepareTelegramText('🛠️ <b>Agent Tools:</b>\n(no tools registered)', 'html')
  assert.equal(skills.parseMode, 'HTML')
  assert.equal(skills.text, '🛠️ <b>Agent Tools:</b>\n(no tools registered)')

  // entities the plugin writes instead of angle brackets must render as text
  const bind = markdownToTelegramHtml('Usage: <code>/bind &lt;role&gt;</code>')
  assert.equal(bind, 'Usage: <code>/bind &lt;role&gt;</code>')
  assert.ok(!bind.includes('&amp;lt;'), `no double escaping: ${bind}`)
})

test('model Markdown still converts', () => {
  assert.equal(markdownToTelegramHtml('**bold** and `code`'), '<b>bold</b> and <code>code</code>')
  assert.equal(markdownToTelegramHtml('Tom &amp; Jerry'), 'Tom &amp; Jerry')
  assert.equal(markdownToTelegramHtml('`<b>x</b>`'), '<code>&lt;b&gt;x&lt;/b&gt;</code>')
  assert.equal(markdownToTelegramHtml('[site](https://example.com)'), '<a href="https://example.com">site</a>')
})

test('unsafe HTML is escaped, safe links pass', () => {
  const script = markdownToTelegramHtml('<script>alert(1)</script> <b onclick="x()">b</b>')
  assert.ok(!script.includes('<script>'), `script tag escaped: ${script}`)
  assert.ok(!script.includes('<b onclick'), `attributes must not form a real tag: ${script}`)
  assert.ok(script.includes('&lt;script&gt;'))

  const badLink = markdownToTelegramHtml('<a href="javascript:alert(1)">x</a>')
  assert.ok(!/<a href="javascript:/i.test(badLink), `unsafe link escaped: ${badLink}`)

  const goodLink = markdownToTelegramHtml('<a href="https://example.com/a?b=1&amp;c=2">x</a>')
  assert.ok(goodLink.includes('<a href="https://example.com/a?b=1&c=2">x</a>'), `safe link passes: ${goodLink}`)

  // unbalanced closing tags would make Telegram reject the whole message
  assert.ok(!markdownToTelegramHtml('</b> tail').includes('<b>'))
})

test('plain mode strips markup instead of showing tags', () => {
  assert.equal(stripSafeTags('<b>Agent Tools:</b> <code>&lt;x&gt;</code>'), 'Agent Tools: <x>')
  const plain = prepareTelegramText('<b>Agent Tools:</b>', 'plain')
  assert.equal(plain.text, 'Agent Tools:')
  assert.equal(plain.parseMode, undefined)
})
