import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSemver,
  isNewerVersion,
  isTrustedUpdateRequest,
  registerPluginUpdater,
} from '../lib/updater.js'

test('parseSemver parses semantic version strings correctly', () => {
  assert.deepEqual(parseSemver('0.3.21'), { core: [0, 3, 21], prerelease: [] })
  assert.deepEqual(parseSemver('v1.2.3-rc.1'), { core: [1, 2, 3], prerelease: ['rc', '1'] })
  assert.equal(parseSemver('invalid-version'), undefined)
  assert.equal(parseSemver(''), undefined)
  assert.equal(parseSemver(null), undefined)
})

test('isNewerVersion compares version precedence according to semver spec', () => {
  assert.equal(isNewerVersion('0.3.21', '0.3.22'), true)
  assert.equal(isNewerVersion('0.3.21', '0.4.0'), true)
  assert.equal(isNewerVersion('0.3.21', '1.0.0'), true)
  assert.equal(isNewerVersion('0.3.22', '0.3.21'), false)
  assert.equal(isNewerVersion('0.3.21', '0.3.21'), false)
  assert.equal(isNewerVersion('1.0.0-rc.1', '1.0.0-rc.2'), true)
  assert.equal(isNewerVersion('1.0.0-rc.1', '1.0.0'), true)
  assert.equal(isNewerVersion('invalid', '0.3.22'), false)
  assert.equal(isNewerVersion('0.3.21', 'invalid'), false)
})

test('isTrustedUpdateRequest validates loopback and update header', () => {
  // Missing header x-dsh-plugin-update
  assert.equal(
    isTrustedUpdateRequest({
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    }),
    false,
    'missing update header must be rejected'
  )

  // Remote IP address
  assert.equal(
    isTrustedUpdateRequest({
      headers: { 'x-dsh-plugin-update': '1', origin: 'http://192.168.1.50:3000', host: '192.168.1.50:3000' },
      socket: { remoteAddress: '192.168.1.50' },
    }),
    false,
    'remote IP must be rejected'
  )

  // Cross-site request
  assert.equal(
    isTrustedUpdateRequest({
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'cross-site',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    false,
    'cross-site request must be rejected'
  )

  // Host/Origin mismatch
  assert.equal(
    isTrustedUpdateRequest({
      headers: {
        'x-dsh-plugin-update': '1',
        origin: 'http://localhost:4000',
        host: 'localhost:3000',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    false,
    'mismatched origin and host must be rejected'
  )

  // Valid loopback same-origin request
  assert.equal(
    isTrustedUpdateRequest({
      headers: {
        'x-dsh-plugin-update': '1',
        'sec-fetch-site': 'same-origin',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    true,
    'valid loopback same-origin request must be accepted'
  )
})

test('registerPluginUpdater mounts routes and enforces HTTP methods', async () => {
  let registered = null
  const fakeCtx = {
    webServer: {
      register: (route) => {
        registered = route
        return () => {}
      },
    },
  }

  registerPluginUpdater(fakeCtx, {
    endpoint: '/dsh-messenger-gateway/update',
    packageName: '@goodandready/dsh-messenger-gateway',
  })

  assert.ok(registered)
  assert.equal(registered.path, '/dsh-messenger-gateway/update')
  assert.equal(registered.kind, 'exact')

  // DELETE request returns 405 Method Not Allowed
  let status = 0
  await registered.handler({ method: 'DELETE', headers: {} }, {
    writeHead: (s) => { status = s },
    end: () => {},
  })
  assert.equal(status, 405)

  // POST without trusted headers returns 403 Forbidden
  let postStatus = 0
  let responseBody = ''
  await registered.handler(
    {
      method: 'POST',
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    },
    {
      writeHead: (s) => { postStatus = s },
      end: (b) => { responseBody = b },
    }
  )
  assert.equal(postStatus, 403)
  assert.match(responseBody, /untrusted|cross-origin/i)
})
