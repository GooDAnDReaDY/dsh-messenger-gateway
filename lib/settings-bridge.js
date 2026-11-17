export function setupSettings(ctx, { namespace, Config, resolveConfig, baseConfig, sync, logger }) {
  let settingsApi
  let currentConfig = resolveConfig(ctx.fiber?.config ?? baseConfig ?? {})
  let source = () => currentConfig
  const watchers = new Set()
  let readLive = () => null

  const applyLiveConfig = (nextRaw) => {
    const live = nextRaw ?? readLive() ?? ctx.fiber?.config ?? baseConfig
    if (live) {
      currentConfig = resolveConfig(live)
      sync()
      for (const cb of watchers) {
        try { cb(currentConfig) } catch (err) { logger?.debug?.(`${namespace}: watcher error:`, err?.message || err) }
      }
    }
  }

  // Bus listeners are registered INSIDE a ctx.effect (#223): when the plugin
  // instance is disposed the unbinds run even if the settings service never
  // mounted, and a repeated apply cannot accumulate stale listeners.
  const unbinds = []
  const unbindBusListeners = () => {
    for (const unbind of unbinds.splice(0)) {
      try { unbind() } catch (err) { logger?.debug?.(`${namespace}: unbind error:`, err?.message || err) }
    }
  }
  const registerBusListeners = () => {
    if (typeof ctx?.on !== 'function') return
    const u1 = ctx.on('loader/volatile-update', () => applyLiveConfig())
    if (typeof u1 === 'function') unbinds.push(u1)
    const u2 = ctx.on('internal/update', (cfg) => applyLiveConfig(cfg))
    if (typeof u2 === 'function') unbinds.push(u2)
    const u3 = ctx.on('app-boot/config-reload', () => applyLiveConfig())
    if (typeof u3 === 'function') unbinds.push(u3)
  }
  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => {
      registerBusListeners()
      return unbindBusListeners
    }, `${namespace}: bus listeners`)
  } else {
    registerBusListeners()
  }

  let mounted = false
  const mountSettings = (sctx) => {
    // Idempotent mount (#223): a settings service that re-emits its mount
    // event must not re-register watchers or duplicate subscriptions. A call
    // without a service does not count as a mount.
    if (mounted) return
    const service = sctx?.settings || (typeof sctx?.get === 'function' ? sctx.get('settings') : null)
    const effect = typeof sctx?.effect === 'function' ? sctx.effect.bind(sctx) : (typeof ctx.effect === 'function' ? ctx.effect.bind(ctx) : null)
    if (!service) return
    mounted = true

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
      } catch (err) {
        logger?.debug?.(`${namespace}: getRevision failed:`, err?.message || err)
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

    readLive = readLiveSettings
    const liveVal = readLiveSettings()
    if (liveVal) currentConfig = resolveConfig(liveVal)
    source = () => currentConfig

    const persist = async (next) => {
      const payload = resolveConfig(next)
      if (typeof service.replace === 'function') {
        await service.replace(namespace, payload, getRevision())
      } else if (typeof service.update === 'function') {
        await service.update(namespace, payload, getRevision())
      } else if (typeof service.mutate === 'function') {
        await service.mutate(namespace, [{ op: 'set', path: [], value: payload }])
      } else {
        throw new Error('settings service cannot persist configuration')
      }
      currentConfig = payload
      sync()
      for (const cb of watchers) {
        try { cb(currentConfig) } catch (err) { logger?.debug?.(`${namespace}: watcher error:`, err?.message || err) }
      }
      return currentConfig
    }

    let writeChain = Promise.resolve()
    settingsApi = {
      get: () => source(),
      replace: async (next) => persist(next),
      update: async (patch) => persist({ ...source(), ...patch }),
      // Serialized write mutex (#221): concurrent read-modify-write writers
      // (PUT /config, chat persist hooks) chain through this queue and each
      // re-reads the current config at execution time, so no update is lost.
      writeExclusive: (fn) => {
        const run = writeChain.then(() => fn(settingsApi))
        writeChain = run.then(() => {}, () => {})
        return run
      },
      watch: (cb) => {
        if (typeof cb === 'function') watchers.add(cb)
        const unwatchService = typeof service.watch === 'function' ? service.watch(cb) : null
        return () => {
          watchers.delete(cb)
          if (typeof unwatchService === 'function') unwatchService()
        }
      },
    }

    const onFn = typeof sctx?.on === 'function' ? sctx.on.bind(sctx) : (typeof ctx?.on === 'function' ? ctx.on.bind(ctx) : null)
    let unbindDocumentUpdated = null
    if (onFn) {
      const d1 = onFn('settings/document-updated', (updatedNs) => {
        if (updatedNs === namespace) applyLiveConfig()
      })
      if (typeof d1 === 'function') unbindDocumentUpdated = d1
    }

    if (effect) {
      effect(() => () => {
        // Bus listeners (loader/volatile-update etc.) belong to the top-level
        // effect above; this dispose only cleans the settings-service side
        // (#223).
        if (unbindDocumentUpdated) {
          try { unbindDocumentUpdated() } catch (err) { logger?.debug?.(`${namespace}: unbind error:`, err?.message || err) }
          unbindDocumentUpdated = null
        }
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
