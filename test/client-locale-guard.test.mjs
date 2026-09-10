import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { listModelCatalog } from '../lib/models.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientCode = readFileSync(join(root, 'lib/client.js'), 'utf8')

function createClientModule() {
  let factoryFn = null
  const fakeLoader = {
    load({ id, factory }) {
      factoryFn = factory
    }
  }
  const fakeRequire = (mod) => {
    if (mod === 'react') {
      return {
        createElement: () => ({}),
        useState: (init) => [init, () => {}],
        useMemo: (fn) => fn(),
        useCallback: (fn) => fn,
        useSyncExternalStore: (sub, get) => get(),
      }
    }
    return {}
  }
  const fn = new Function('window', clientCode)
  fn({ __ModuleLoader__: fakeLoader })
  return factoryFn(fakeRequire)
}

test('client apply survives duplicate locale.register throwing already has locale', () => {
  const mod = createClientModule()
  assert.equal(typeof mod.apply, 'function')

  let registerCalls = 0
  let slotRegistered = false
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))

  try {
    const fakeCtx = {
      effect(fn) {
        return fn()
      },
      locale: {
        register(ns, dicts) {
          registerCalls++
          if (registerCalls > 1) {
            throw new Error(`already has locale ${ns}`)
          }
        },
      },
      slots: {
        inject(name, cb) {
          return cb()
        },
        register(item, comp) {
          slotRegistered = true
          assert.equal(item.name, 'settings.plugin.item')
          assert.equal(item.key, 'dsh-messenger-gateway')
        },
      },
    }

    // First apply: success
    mod.apply(fakeCtx)
    assert.equal(slotRegistered, true)
    assert.equal(registerCalls, 1)

    // Second apply: duplicate locale registration throws
    slotRegistered = false
    assert.doesNotThrow(() => {
      mod.apply(fakeCtx)
    })
    assert.equal(slotRegistered, true)
    assert.equal(registerCalls, 2)
    assert.ok(warnings.some(w => w.includes('словарь уже зарегистрирован')))
  } finally {
    console.warn = origWarn
  }
})

test('listModelCatalog accesses llm service via ctx.get("llm") when ctx.llm is undefined', async () => {
  const fakeLlm = {
    async listProviders() {
      return [{ id: 'mock-p', name: 'Mock Provider' }]
    },
    async listModels(pId) {
      return [{ id: 'mock-m', name: 'Mock Model' }]
    },
  }
  const fakeCtx = {
    get(name) {
      if (name === 'llm') return fakeLlm
      return undefined
    },
    llm: undefined,
  }

  const catalog = await listModelCatalog(fakeCtx)
  assert.equal(catalog.providers.length, 1)
  assert.equal(catalog.providers[0].id, 'mock-p')
  assert.deepEqual(catalog.modelsByProvider.get('mock-p'), [{ id: 'mock-m', name: 'Mock Model' }])
})
