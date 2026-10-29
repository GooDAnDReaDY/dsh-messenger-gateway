import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import { validateTelegramWebAppData, createArtifactStore, createWebAppHtml, createWebAppHandler } from '../lib/webapp.js'
import { buildQuickActionsKeyboard } from '../lib/commands.js'
import { handleGatewayCommand } from '../lib/gateway-commands.js'

function generateValidInitData(botToken, userObj = { id: 12345678, first_name: 'TestUser' }, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams()
  params.set('auth_date', String(authDate))
  params.set('query_id', 'AAHdF6IQAAAAAN0XohDhrOrc')
  params.set('user', JSON.stringify(userObj))

  const keys = Array.from(params.keys()).sort()
  const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  params.set('hash', hash)

  return params.toString()
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { res.headers[k.toLowerCase()] = v },
    writeHead(status, headers = {}) {
      res.statusCode = status
      for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v
    },
    end(data) { res.body = data ? String(data) : '' },
  }
  return res
}

test('validateTelegramWebAppData verifies authentic Telegram WebApp data', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
  const initData = generateValidInitData(token, { id: 98765432, first_name: 'Alex' })

  const res = validateTelegramWebAppData(initData, token)
  assert.equal(res.ok, true)
  assert.equal(res.user?.id, 98765432)
  assert.equal(res.user?.first_name, 'Alex')
  assert.equal(res.queryId, 'AAHdF6IQAAAAAN0XohDhrOrc')
})

test('validateTelegramWebAppData rejects tampered initData', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
  const initData = generateValidInitData(token)
  // Tamper with user
  const tampered = initData.replace('TestUser', 'HackerUser')

  const res = validateTelegramWebAppData(tampered, token)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'invalid_hash')
})

test('validateTelegramWebAppData rejects expired initData', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
  const oldDate = Math.floor(Date.now() / 1000) - 100000 // > 24 hours ago
  const initData = generateValidInitData(token, { id: 1 }, oldDate)

  const res = validateTelegramWebAppData(initData, token, 86400)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'expired')
})

test('createArtifactStore handles addition, retrieval, and ring buffer eviction', () => {
  const store = createArtifactStore(3)

  store.add({ id: 'art-1', title: 'Flowchart', type: 'mermaid', svg: '<svg id="1"></svg>', chatId: '100' })
  store.add({ id: 'art-2', title: 'Pie', type: 'pie', svg: '<svg id="2"></svg>', chatId: '200' })
  store.add({ id: 'art-3', title: 'Chart', type: 'xychart', svg: '<svg id="3"></svg>', chatId: '100' })

  assert.equal(store.size, 3)
  assert.equal(store.get('art-1')?.title, 'Flowchart')
  assert.equal(store.get('art-2')?.title, 'Pie')

  // List filtered by chatId
  const list100 = store.list(10, '100')
  assert.equal(list100.length, 2)
  assert.equal(list100[0].id, 'art-3')
  assert.equal(list100[1].id, 'art-1')

  // Ring buffer eviction
  store.add({ id: 'art-4', title: 'New Diagram', type: 'mermaid' })
  assert.equal(store.size, 3)
  assert.equal(store.get('art-1'), null) // art-1 evicted
  assert.equal(store.get('art-4')?.title, 'New Diagram')
})

test('createWebAppHtml returns complete HTML with Telegram WebApp script and container', () => {
  const html = createWebAppHtml({ title: 'Test Dashboard' })
  assert.ok(html.includes('<!DOCTYPE html>'))
  assert.ok(html.includes('https://telegram.org/js/telegram-web-app.js'))
  assert.ok(html.includes('Test Dashboard'))
  assert.ok(html.includes('id="tab-artifacts"'))
  assert.ok(html.includes('id="tab-health"'))
  assert.ok(html.includes('id="tab-sessions"'))
})

test('buildQuickActionsKeyboard appends web_app button when webAppUrl is provided', () => {
  const kbDefault = buildQuickActionsKeyboard()
  assert.equal(kbDefault.keyboard.length, 2)

  const kbWithApp = buildQuickActionsKeyboard('https://example.com/dsh-messenger-gateway/webapp')
  assert.equal(kbWithApp.keyboard.length, 3)
  assert.deepEqual(kbWithApp.keyboard[2][0], {
    text: '📊 Open Dashboard',
    web_app: { url: 'https://example.com/dsh-messenger-gateway/webapp' },
  })
})

test('handleGatewayCommand /app returns WebApp button when configured', async () => {
  let sentText = null
  let sentOpts = null
  const mockGw = {
    resolveWebAppUrl: () => 'https://hub.example.com/dsh-messenger-gateway/webapp',
    resolveLocale: () => 'en',
  }

  const input = {
    chatId: 123,
    reply: async (msg, opts = {}) => {
      sentText = typeof msg === 'string' ? msg : msg?.text
      sentOpts = opts || {}
    },
  }

  const res = await handleGatewayCommand(mockGw, 'chat:123', '/app', input)
  assert.equal(res.handled, true)
  assert.ok(sentText.includes('DSH Gateway Dashboard'))
  assert.equal(sentOpts.replyMarkup?.inline_keyboard[0][0].text, '📊 Open Dashboard')
  assert.equal(sentOpts.replyMarkup?.inline_keyboard[0][0].web_app?.url, 'https://hub.example.com/dsh-messenger-gateway/webapp')
})

test('createWebAppHandler serves HTML and protects API endpoints with Telegram initData', async () => {
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
  const store = createArtifactStore()
  store.add({ id: 'art-demo', title: 'System Architecture', type: 'mermaid', svg: '<svg></svg>' })

  let outboxRetried = false
  const mockGw = {
    stats: { sent: 10, errors: 0, startedAt: Date.now() - 5000 },
    messenger: { activeChats: () => 2, adapters: () => ['telegram'] },
    getBotInfo: () => ({ botUsername: 'TestBot' }),
    artifactStore: store,
    outbox: {
      pendingCount: 1,
      dlqCount: 0,
      retryDlq: async () => { outboxRetried = true; return 1 },
    },
  }

  const handler = createWebAppHandler({
    getGateway: () => mockGw,
    getConfig: () => ({ telegram: { botToken, transport: 'poll' } }),
    ctx: null,
  })

  // 1. Root HTML request
  const mockResHtml = createMockRes()
  await handler({ method: 'GET', url: '/dsh-messenger-gateway/webapp', headers: {} }, mockResHtml)
  assert.equal(mockResHtml.statusCode, 200)
  assert.equal(mockResHtml.headers['content-type'], 'text/html; charset=utf-8')
  assert.ok(mockResHtml.body.includes('DSH Gateway Dashboard'))

  // 2. Unauthenticated API request -> 401
  const mockResUnauthorized = createMockRes()
  await handler({ method: 'GET', url: '/dsh-messenger-gateway/webapp/api/status', headers: {} }, mockResUnauthorized)
  assert.equal(mockResUnauthorized.statusCode, 401)
  assert.equal(JSON.parse(mockResUnauthorized.body).error, 'unauthorized')

  // 3. Authenticated API request with initData
  const validInitData = generateValidInitData(botToken, { id: 1001, first_name: 'Dmitry' })
  const mockResStatus = createMockRes()
  await handler({
    method: 'GET',
    url: '/dsh-messenger-gateway/webapp/api/status',
    headers: { authorization: `tma ${validInitData}` },
  }, mockResStatus)

  assert.equal(mockResStatus.statusCode, 200)
  const statusData = JSON.parse(mockResStatus.body)
  assert.equal(statusData.ok, true)
  assert.equal(statusData.botUsername, 'TestBot')
  assert.equal(statusData.outbox?.pending, 1)

  // 4. Artifacts endpoint
  const mockResArtifacts = createMockRes()
  await handler({
    method: 'GET',
    url: '/dsh-messenger-gateway/webapp/api/artifacts',
    headers: { authorization: `tma ${validInitData}` },
  }, mockResArtifacts)
  assert.equal(mockResArtifacts.statusCode, 200)
  const artData = JSON.parse(mockResArtifacts.body)
  assert.equal(artData.artifacts.length, 1)
  assert.equal(artData.artifacts[0].title, 'System Architecture')

  // 5. Action endpoint (outbox_retry)
  const mockResAction = createMockRes()
  const bodyPayload = Buffer.from(JSON.stringify({ action: 'outbox_retry' }))
  const reqStream = Readable.from([bodyPayload])
  reqStream.method = 'POST'
  reqStream.url = '/dsh-messenger-gateway/webapp/api/action'
  reqStream.headers = { authorization: `tma ${validInitData}` }

  await handler(reqStream, mockResAction)
  assert.equal(mockResAction.statusCode, 200)
  assert.equal(JSON.parse(mockResAction.body).retried, 1)
  assert.equal(outboxRetried, true)
})
