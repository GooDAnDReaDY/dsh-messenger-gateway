import test from 'node:test'
import assert from 'node:assert/strict'
import { t, getLocaleDictionary, locales, en, zh } from '../lib/locales/index.js'

test('locales dictionary exports en and zh', () => {
  assert.ok(locales.en)
  assert.ok(locales.zh)
  assert.equal(typeof en, 'object')
  assert.equal(typeof zh, 'object')
})

test('getLocaleDictionary resolves zh and falls back to en', () => {
  assert.equal(getLocaleDictionary('zh'), zh)
  assert.equal(getLocaleDictionary('zh-CN'), zh)
  assert.equal(getLocaleDictionary('en'), en)
  assert.equal(getLocaleDictionary('ru'), en)
  assert.equal(getLocaleDictionary(null), en)
})

test('t() interpolates parameters correctly', () => {
  const renderedEn = t('msg.unknown_command', { cmd: '/foobar' }, 'en')
  assert.equal(renderedEn, 'Unknown command /foobar. /help')

  const renderedZh = t('msg.unknown_command', { cmd: '/foobar' }, 'zh')
  assert.equal(renderedZh, '未知命令 /foobar。发送 /help')
})

test('t() falls back to en if key is missing in zh', () => {
  const res = t('cmd.help', {}, 'zh')
  assert.equal(res, '显示帮助信息')

  const fallback = t('non_existent_key_123', {}, 'zh')
  assert.equal(fallback, 'non_existent_key_123')
})

test('dictionary key parity between en and zh', () => {
  const enKeys = Object.keys(en)
  const zhKeys = new Set(Object.keys(zh))
  for (const k of enKeys) {
    assert.ok(zhKeys.has(k), `Missing key in zh: ${k}`)
  }
})
