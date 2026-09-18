import { t } from './locales/index.js'
import {
  parseCallbackData, parseAskCallback, targetMatchesAsk,
  releaseCallbacks, buildMultiSelectKeyboard, indexCallbacks, REMOVE_KEYBOARD
} from './ask.js'
import {
  listModelCatalog, buildProvidersKeyboard, buildModelsKeyboard, storeModelSelection
} from './models.js'

export async function handleGatewayCallback(gw, cb) {
    if (cb.userId && !gw.isUserAllowed(cb.userId)) {
      try { await cb.answer(t('msg.not_allowed', {}, 'en')) } catch (err) { gw.recordApiFailure('cb.answer.not_allowed', err) }
      return
    }
    const indexed = gw.callbackIndex.get(cb.data)
    const { token, buttonId } = parseCallbackData(cb.data)
    const askToken = indexed || token
    if (askToken && gw.pendingAsks.has(askToken)) {
      const pending = gw.pendingAsks.get(askToken)
      if (!targetMatchesAsk(pending, cb)) {
        await cb.answer(t('ask.other_chat', {}, 'en'))
        return
      }
      const action = parseAskCallback(cb.data)
      if (pending.isMulti) {
        if (action.kind === 'toggle') {
          if (pending.selected.has(action.id)) pending.selected.delete(action.id)
          else pending.selected.add(action.id)
          releaseCallbacks(gw.callbackIndex, pending.callbackKeys)
          const nextKb = buildMultiSelectKeyboard(askToken, pending.options, pending.selected, pending.page, pending.pageSize, pending.payload)
          pending.callbackKeys = nextKb.callbackKeys
          indexCallbacks(gw.callbackIndex, nextKb.callbackKeys, askToken)
          try {
            if (cb.editReplyMarkup) await cb.editReplyMarkup(nextKb.replyMarkup)
            else await cb.editMessage(cb.message?.text || 'Selection', nextKb.replyMarkup)
          } catch (err) {
            gw.recordApiFailure('cb.editMessage.ask_multi_toggle', err)
          }
          await cb.answer(pending.selected.has(action.id) ? 'Selected' : 'Deselected')
          return
        }
        if (action.kind === 'page') {
          pending.page = action.page
          releaseCallbacks(gw.callbackIndex, pending.callbackKeys)
          const nextKb = buildMultiSelectKeyboard(askToken, pending.options, pending.selected, pending.page, pending.pageSize, pending.payload)
          pending.callbackKeys = nextKb.callbackKeys
          indexCallbacks(gw.callbackIndex, nextKb.callbackKeys, askToken)
          try {
            if (cb.editReplyMarkup) await cb.editReplyMarkup(nextKb.replyMarkup)
            else await cb.editMessage(cb.message?.text || 'Selection', nextKb.replyMarkup)
          } catch (err) {
            gw.recordApiFailure('cb.editMessage.ask_multi_page', err)
          }
          await cb.answer()
          return
        }
        if (action.kind === 'done') {
          gw.pendingAsks.delete(askToken)
          clearTimeout(pending.timer)
          releaseCallbacks(gw.callbackIndex, pending.callbackKeys)
          await cb.answer('OK')
          try { await cb.editMessage(cb.message?.text || 'Done', REMOVE_KEYBOARD) } catch (err) { gw.recordApiFailure('cb.editMessage.ask_multi_done', err) }
          pending.resolve({ buttonId: 'done', selected: Array.from(pending.selected), data: cb.data })
          return
        }
        if (action.kind === 'cancel') {
          gw.pendingAsks.delete(askToken)
          clearTimeout(pending.timer)
          releaseCallbacks(gw.callbackIndex, pending.callbackKeys)
          await cb.answer('Cancelled')
          try { await cb.editMessage(cb.message?.text || 'Cancelled', REMOVE_KEYBOARD) } catch (err) { gw.recordApiFailure('cb.editMessage.ask_multi_cancel', err) }
          pending.resolve({ buttonId: 'cancel', selected: [], data: cb.data })
          return
        }
      }
      gw.pendingAsks.delete(askToken)
      clearTimeout(pending.timer)
      releaseCallbacks(gw.callbackIndex, pending.callbackKeys)
      await cb.answer('OK')
      try { await cb.editMessage(cb.message?.text || 'Done', REMOVE_KEYBOARD) } catch (err) { gw.recordApiFailure('cb.editMessage.ask_single_done', err) }
      pending.resolve({ buttonId: action.id || buttonId, data: cb.data })
      return
    }

    // Model picker interactive flow
    if (cb.data?.startsWith('mdl:')) {
      const parts = cb.data.split(':')
      const sub = parts[1]
      // Step 2: Selected provider -> show its models (10 per page)
      if (sub === 'p') {
        const providerId = parts.slice(2).join(':')
        const current = gw.resolveAgentModel()
        const catalog = await listModelCatalog(gw.ctx, current)
        const models = catalog.modelsByProvider.get(providerId) || []
        if (!models.length) {
          await cb.answer(t('model.no_models', {}, 'en'))
          return
        }
        const kb = buildModelsKeyboard(providerId, models, current.model, 0)
        await cb.answer()
        const text = [
          `🤖 <b>Provider:</b> <code>${providerId}</code>`,
          `Select model (page ${kb.page + 1}/${kb.totalPages}):`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch (err) {
          gw.recordApiFailure('cb.editMessage.model_picker_provider', err)
        }
        return
      }
      // Pagination for models
      if (sub === 'pg') {
        const page = parseInt(parts[parts.length - 1], 10) || 0
        const providerId = parts.slice(2, -1).join(':')
        const current = gw.resolveAgentModel()
        const catalog = await listModelCatalog(gw.ctx, current)
        const models = catalog.modelsByProvider.get(providerId) || []
        const kb = buildModelsKeyboard(providerId, models, current.model, page)
        await cb.answer()
        const text = [
          `🤖 <b>Provider:</b> <code>${providerId}</code>`,
          `Select model (page ${kb.page + 1}/${kb.totalPages}):`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch (err) {
          gw.recordApiFailure('cb.editMessage.model_picker_page', err)
        }
        return
      }
      // Back to providers
      if (sub === 'back') {
        const current = gw.resolveAgentModel()
        const catalog = await listModelCatalog(gw.ctx, current)
        const kb = buildProvidersKeyboard(catalog.providers, current)
        await cb.answer()
        const text = [
          '🤖 <b>Choose Provider:</b>',
          `Current: <code>${current.provider}/${current.model}</code>`,
        ].join('\n')
        try {
          if (cb.editMessage) await cb.editMessage(text, kb)
        } catch (err) {
          gw.recordApiFailure('cb.editMessage.model_picker_back', err)
        }
        return
      }
      // Select model
      if (sub === 's') {
        const key = parts[2]
        const stored = getStoredModelSelection(key)
        if (!stored) {
          await cb.answer(t('ask.expired', {}, 'en'))
          return
        }
        const { provider, model } = stored
        try {
          const adm = gw.ctx.get('agentDefaultModel')
          if (adm?.saveSelection) {
            await adm.saveSelection({ provider, model })
          }
          gw.config.agent = { ...gw.config.agent, provider, model }
          try {
            await gw.hooks?.persistAgentModel?.({ provider, model })
          } catch (e) {
            gw.ctx.logger?.warn?.(`persist agent model: ${e.message}`)
          }
          await cb.answer(t('ask.chose', { choice: model }, 'en'))
          try {
            if (cb.editMessage) await cb.editMessage(t('model.switched', { provider, model }, 'en'), REMOVE_KEYBOARD)
          } catch (err) {
            gw.recordApiFailure('cb.editMessage.model_picker_switched', err)
          }
        } catch (err) {
          await cb.answer(`Error: ${err.message}`)
        }
        return
      }
      if (sub === 'cur') {
        await cb.answer()
        return
      }
    }

    await cb.answer()
  }
