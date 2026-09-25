export function setupSettings(ctx, { namespace, Config, resolveConfig, baseConfig, sync, logger }) {
  let settingsApi
  let source = () => resolveConfig(baseConfig ?? {})

  const mountSettings = (sctx) => {
    const service = sctx?.settings || (typeof sctx?.get === 'function' ? sctx.get('settings') : null)
    const effect = typeof sctx?.effect === 'function' ? sctx.effect.bind(sctx) : (typeof ctx.effect === 'function' ? ctx.effect.bind(ctx) : null)
    if (!service) return

    if (typeof service.register === 'function') {
      settingsApi = service.register(namespace, Config, { base: baseConfig || {} })
      source = () => resolveConfig(settingsApi.get() ?? baseConfig ?? {})
      if (effect) effect(() => settingsApi.watch(sync), `${namespace}: settings`)
      return
    }

    if (typeof service.configure === 'function') {
      try {
        const dispose = service.configure({ auto: false }, ctx.fiber)
        if (effect && typeof dispose === 'function') effect(() => dispose, `${namespace}: configure`)
      } catch (err) {
        logger?.warn?.(`${namespace}: settings configure failed: ${err.message}`)
      }
    }

    const getRevision = () => {
      try {
        return service.describe?.()?.find?.((row) => row.ns === namespace)?.revision
      } catch {
        return undefined
      }
    }

    const readLiveSettings = () => {
      try {
        if (typeof service.describe === 'function') {
          const desc = service.describe()?.find?.((row) => row.ns === namespace)
          if (desc?.value && typeof desc.value === 'object') return desc.value
        }
        if (typeof service.get === 'function') {
          const val = service.get(namespace)
          if (val && typeof val === 'object') return val
        }
      } catch (err) {
        logger?.warn?.(`${namespace}: readLiveSettings failed: ${err.message}`)
      }
      return null
    }

    const liveVal = readLiveSettings()
    let currentConfig = resolveConfig(liveVal ?? baseConfig ?? {})
    source = () => currentConfig

    const persist = async (next) => {
      const payload = Config(next)
      if (typeof service.replace === 'function') {
        await service.replace(namespace, payload, getRevision())
      } else if (typeof service.update === 'function') {
        await service.update(namespace, payload, getRevision())
      } else if (typeof service.mutate === 'function') {
        await service.mutate(namespace, [{ op: 'set', path: [], value: payload }])
      } else {
        throw new Error('settings service cannot persist configuration')
      }
      currentConfig = resolveConfig(payload)
      sync()
      return currentConfig
    }

    settingsApi = {
      get: () => source(),
      replace: async (next) => persist(next),
      update: async (patch) => persist({ ...source(), ...patch }),
      watch: (cb) => {
        if (typeof service.watch === 'function') return service.watch(cb)
        return () => {}
      },
    }

    const onFn = typeof sctx?.on === 'function' ? sctx.on.bind(sctx) : (typeof ctx?.on === 'function' ? ctx.on.bind(ctx) : null)
    const disposeDocUpdated = onFn
      ? onFn('settings/document-updated', (updatedNs) => {
          if (updatedNs === namespace) {
            const nextVal = readLiveSettings()
            if (nextVal) {
              currentConfig = resolveConfig(nextVal)
              sync()
            }
          }
        })
      : null

    if (effect) {
      effect(() => () => {
        if (typeof disposeDocUpdated === 'function') disposeDocUpdated()
        settingsApi = undefined
      }, `${namespace}: settings`)
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], mountSettings)
  } else {
    mountSettings({ settings: ctx.get?.('settings') || ctx.settings, effect: ctx.effect })
  }

  return {
    getSource: () => source(),
    getSettingsApi: () => settingsApi,
  }
}
