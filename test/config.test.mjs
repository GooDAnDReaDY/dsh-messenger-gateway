import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginConfig, plainConfig } from '../lib/config.js'

test('Issue #124: PluginConfig schema defines defaultLocale with fallback to en', () => {
  const defaults = PluginConfig({})
  assert.equal(defaults.defaultLocale, 'en')

  const customZh = PluginConfig({ defaultLocale: 'zh' })
  assert.equal(customZh.defaultLocale, 'zh')

  const unwrapped = plainConfig(customZh)
  assert.equal(unwrapped.defaultLocale, 'zh')
})
