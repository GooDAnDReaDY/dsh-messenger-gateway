import test from 'node:test'
import assert from 'node:assert/strict'
import {
  listModelCatalog,
  buildProvidersKeyboard,
  buildModelsKeyboard,
  storeModelSelection,
  getStoredModelSelection,
} from '../lib/models.js'

test('listModelCatalog extracts providers and models from ctx.llm', async () => {
  const fakeCtx = {
    llm: {
      listProviders: async () => [{ id: 'openai', name: 'OpenAI' }, { id: 'deepseek', name: 'DeepSeek' }],
      listModels: async (pId) => {
        if (pId === 'openai') return [{ id: 'gpt-4o' }]
        if (pId === 'deepseek') return [{ id: 'deepseek-chat' }]
        return []
      },
    },
  }

  const catalog = await listModelCatalog(fakeCtx)
  assert.equal(catalog.providers.length, 2)
  assert.equal(catalog.providers[0].id, 'openai')
  assert.deepEqual(catalog.modelsByProvider.get('openai'), [{ id: 'gpt-4o', name: 'gpt-4o' }])
  assert.deepEqual(catalog.modelsByProvider.get('deepseek'), [{ id: 'deepseek-chat', name: 'deepseek-chat' }])
})

test('listModelCatalog falls back to current model when ctx.llm unavailable', async () => {
  const catalog = await listModelCatalog({}, { provider: 'custom-prov', model: 'custom-model' })
  assert.equal(catalog.providers.length, 1)
  assert.equal(catalog.providers[0].id, 'custom-prov')
  assert.deepEqual(catalog.modelsByProvider.get('custom-prov'), [{ id: 'custom-model', name: 'custom-model' }])
})

test('buildProvidersKeyboard creates inline keyboard with checkmark for current', () => {
  const providers = [{ id: 'p1', name: 'Provider 1' }, { id: 'p2', name: 'Provider 2' }]
  const kb = buildProvidersKeyboard(providers, { provider: 'p2' })
  assert.equal(kb.inline_keyboard.length, 2)
  assert.equal(kb.inline_keyboard[0][0].text, '🔹 Provider 1')
  assert.equal(kb.inline_keyboard[0][0].callback_data, 'mdl:p:p1')
  assert.equal(kb.inline_keyboard[1][0].text, '✅ Provider 2')
  assert.equal(kb.inline_keyboard[1][0].callback_data, 'mdl:p:p2')
})

test('buildModelsKeyboard paginates 10 models per page with navigation and back button', () => {
  const models = []
  for (let i = 1; i <= 25; i++) {
    models.push({ id: `model-${i}`, name: `Model ${i}` })
  }

  // Page 0 (models 1-10)
  const kb0 = buildModelsKeyboard('test-prov', models, 'model-2', 0, 10)
  assert.equal(kb0.page, 0)
  assert.equal(kb0.totalPages, 3)
  // 10 model rows + 1 nav row + 1 back row = 12 rows
  assert.equal(kb0.inline_keyboard.length, 12)
  assert.equal(kb0.inline_keyboard[0][0].text, 'Model 1')
  assert.equal(kb0.inline_keyboard[1][0].text, '✅ Model 2')

  // Navigation row on page 0
  const navRow0 = kb0.inline_keyboard[10]
  assert.equal(navRow0.length, 2)
  assert.equal(navRow0[0].text, '1/3')
  assert.equal(navRow0[1].text, '➡️')

  // Back row
  const backRow = kb0.inline_keyboard[11]
  assert.equal(backRow[0].text, '🔙 Назад к провайдерам')
  assert.equal(backRow[0].callback_data, 'mdl:back')

  // Page 1 (models 11-20)
  const kb1 = buildModelsKeyboard('test-prov', models, 'model-2', 1, 10)
  const navRow1 = kb1.inline_keyboard[10]
  assert.equal(navRow1.length, 3)
  assert.equal(navRow1[0].text, '⬅️')
  assert.equal(navRow1[1].text, '2/3')
  assert.equal(navRow1[2].text, '➡️')
})

test('storeModelSelection and getStoredModelSelection store and retrieve selection', () => {
  const key = storeModelSelection('provX', 'modelY')
  assert.ok(key)
  const retrieved = getStoredModelSelection(key)
  assert.deepEqual(retrieved.provider, 'provX')
  assert.deepEqual(retrieved.model, 'modelY')
})
