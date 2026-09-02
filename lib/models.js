export const MODEL_PAGE_SIZE = 10

export async function listModelCatalog(ctx, fallback = {}) {
  const result = {
    providers: [],
    modelsByProvider: new Map(),
  }

  // 1. Try ctx.llm if available
  if (ctx?.llm?.listProviders) {
    try {
      const providers = await ctx.llm.listProviders()
      for (const p of providers || []) {
        const pId = p.id || p
        result.providers.push({ id: pId, name: p.name || pId })
        try {
          const models = await ctx.llm.listModels(pId)
          result.modelsByProvider.set(
            pId,
            (models || []).map((m) => ({ id: m.id || m, name: m.name || m.id || m }))
          )
        } catch {
          result.modelsByProvider.set(pId, [])
        }
      }
    } catch {}
  }

  // 2. If no providers from ctx.llm, check settings / fallback
  if (!result.providers.length && fallback.provider) {
    result.providers.push({ id: fallback.provider, name: fallback.provider })
    if (fallback.model) {
      result.modelsByProvider.set(fallback.provider, [{ id: fallback.model, name: fallback.model }])
    }
  }

  return result
}

// In-memory registry for model picker callback tokens to avoid 64-byte Telegram limit
const modelIndexStore = new Map()
const modelToKeyMap = new Map()
let modelIndexCounter = 0

export function storeModelSelection(provider, model) {
  const compositeKey = `${provider}::${model}`
  const existingKey = modelToKeyMap.get(compositeKey)
  if (existingKey && modelIndexStore.has(existingKey)) {
    modelIndexStore.get(existingKey).time = Date.now()
    return existingKey
  }

  const key = String(++modelIndexCounter)
  modelIndexStore.set(key, { provider, model, time: Date.now() })
  modelToKeyMap.set(compositeKey, key)

  // Cleanup entries older than 1 hour
  if (modelIndexStore.size > 200) {
    const cutoff = Date.now() - 3600000
    for (const [k, v] of modelIndexStore.entries()) {
      if (v.time < cutoff) {
        modelIndexStore.delete(k)
        modelToKeyMap.delete(`${v.provider}::${v.model}`)
      }
    }
  }
  return key
}

export function getStoredModelSelection(key) {
  return modelIndexStore.get(key)
}

export function buildProvidersKeyboard(providers, current = {}) {
  const rows = []
  for (const p of providers) {
    const isCurrent = p.id === current.provider
    rows.push([{
      text: `${isCurrent ? '✅ ' : '🔹 '}${p.name || p.id}`,
      callback_data: `mdl:p:${p.id}`,
    }])
  }
  return { inline_keyboard: rows }
}

export function buildModelsKeyboard(providerId, models, currentModel, page = 0, pageSize = MODEL_PAGE_SIZE) {
  const totalPages = Math.ceil(models.length / pageSize) || 1
  const curPage = Math.max(0, Math.min(page, totalPages - 1))
  const start = curPage * pageSize
  const pageModels = models.slice(start, start + pageSize)

  const rows = []
  for (const m of pageModels) {
    const isCurrent = m.id === currentModel
    const key = storeModelSelection(providerId, m.id)
    rows.push([{
      text: `${isCurrent ? '✅ ' : ''}${m.name || m.id}`,
      callback_data: `mdl:s:${key}`,
    }])
  }

  // Navigation row
  const navRow = []
  if (curPage > 0) {
    navRow.push({ text: '⬅️', callback_data: `mdl:pg:${providerId}:${curPage - 1}` })
  }
  if (totalPages > 1) {
    navRow.push({ text: `${curPage + 1}/${totalPages}`, callback_data: `mdl:cur` })
  }
  if (curPage < totalPages - 1) {
    navRow.push({ text: '➡️', callback_data: `mdl:pg:${providerId}:${curPage + 1}` })
  }
  if (navRow.length) rows.push(navRow)

  // Back row
  rows.push([{ text: '🔙 Назад к провайдерам', callback_data: 'mdl:back' }])

  return { inline_keyboard: rows, page: curPage, totalPages }
}
