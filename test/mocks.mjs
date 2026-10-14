// Test doubles: an HTTPS "Telegram Bot API" server, an HTTP CONNECT proxy and a
// SOCKS5 proxy. Used by run-tests.mjs to exercise lib/proxy.js end to end.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { cert, key } from './fixtures/tls.mjs'

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

/** Minimal Bot API double: JSON methods + multipart upload + file download. */
export async function startMockTelegram() {
  const requests = []
  const server = https.createServer({ cert, key }, (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      requests.push({ method: req.method, url: req.url, headers: req.headers, body })
      const json = (payload, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      const match = /^\/bot([^/]+)\/(.+)$/.exec(req.url || '')
      const fileMatch = /^\/file\/bot([^/]+)\/(.+)$/.exec(req.url || '')
      if (fileMatch) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end(Buffer.from('hello-from-telegram'))
        return
      }
      if (!match) return json({ ok: false, description: 'not found' }, 404)
      const method = match[2]
      const text = body.toString('utf8')
      if (method === 'getMe') return json({ ok: true, result: { id: 777, username: 'mock_bot', first_name: 'Mock' } })
      if (method === 'getUpdates') return json({ ok: true, result: [] })
      if (method === 'getFile') return json({ ok: true, result: { file_id: 'F1', file_path: 'docs/file.txt', file_size: 19 } })
      if (method === 'sendMessage') return json({ ok: true, result: { message_id: 1, text: JSON.parse(text || '{}').text || '' } })
      if (method === 'sendDocument' || method === 'sendPhoto' || method === 'sendVoice' || method === 'sendAudio' || method === 'sendVideo') {
        const contentType = String(req.headers['content-type'] || '')
        return json({
          ok: true,
          result: {
            message_id: 42,
            multipart: contentType.includes('multipart/form-data'),
            filename: /filename="([^"]+)"/.exec(text)?.[1] || '',
            payload_contains_marker: text.includes('MARKER-42'),
            bytes: body.length,
          },
        })
      }
      return json({ ok: false, description: `unknown method ${method}` }, 404)
    })
  })
  const port = await listen(server)
  return {
    port,
    requests,
    url: `https://localhost:${port}`,
    close: () => {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}

/** Minimal HTTP CONNECT proxy; optionally requires proxy auth. */
export async function startHttpConnectProxy({ username = '', password = '', delayMs = 0 } = {}) {
  const connections = []
  const server = http.createServer((req, res) => {
    res.writeHead(405, { 'content-type': 'text/plain' })
    res.end('CONNECT only')
  })
  server.on('connect', (req, clientSocket, head) => {
    const expected = !username && !password
      ? null
      : `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    if (expected && req.headers['proxy-authorization'] !== expected) {
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="test"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      return
    }
    const [host, port] = String(req.url).split(':')
    connections.push({ host, port: Number(port) })
    const upstream = net.connect(Number(port), host, () => {
      const establish = () => {
        if (clientSocket.destroyed) {
          upstream.destroy()
          return
        }
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head?.length) upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
      }
      if (delayMs > 0) setTimeout(establish, delayMs)
      else establish()
    })
    upstream.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => upstream.destroy())
  })
  const port = await listen(server)
  return {
    port,
    connections,
    url: `http://${username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''}127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}

/** Minimal SOCKS5 proxy (CONNECT command, optional username/password auth). */
export async function startSocks5Proxy({ username = '', password = '' } = {}) {
  const connections = []
  const server = net.createServer((socket) => {
    let stage = 'greeting'
    let buffer = Buffer.alloc(0)
    const requireAuth = Boolean(username || password)
    const finish = (replyCode) => {
      socket.write(Buffer.from(replyCode))
    }
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      try {
        if (stage === 'greeting') {
          if (buffer.length < 2) return
          const nmethods = buffer[1]
          if (buffer.length < 2 + nmethods) return
          buffer = buffer.subarray(2 + nmethods)
          socket.write(Buffer.from([0x05, requireAuth ? 0x02 : 0x00]))
          stage = requireAuth ? 'auth' : 'request'
          return
        }
        if (stage === 'auth') {
          if (buffer.length < 2) return
          const ulen = buffer[1]
          if (buffer.length < 2 + ulen + 1) return
          const plen = buffer[2 + ulen]
          if (buffer.length < 2 + ulen + 1 + plen) return
          const user = buffer.subarray(2, 2 + ulen).toString('utf8')
          const pass = buffer.subarray(3 + ulen, 3 + ulen + plen).toString('utf8')
          buffer = buffer.subarray(3 + ulen + plen)
          const ok = user === username && pass === password
          socket.write(Buffer.from([0x01, ok ? 0x00 : 0x01]))
          if (!ok) {
            socket.destroy()
            return
          }
          stage = 'request'
          return
        }
        if (stage === 'request') {
          if (buffer.length < 4) return
          const atyp = buffer[3]
          let host = ''
          let offset = 4
          if (atyp === 0x01) {
            if (buffer.length < 10) return
            host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`
            offset = 8
          } else if (atyp === 0x03) {
            const len = buffer[4]
            if (buffer.length < 5 + len + 2) return
            host = buffer.subarray(5, 5 + len).toString('utf8')
            offset = 5 + len
          } else if (atyp === 0x04) {
            if (buffer.length < 22) return
            host = '::1'
            offset = 20
          } else {
            socket.destroy()
            return
          }
          const port = buffer.readUInt16BE(offset)
          buffer = buffer.subarray(offset + 2)
          connections.push({ host, port })
          const upstream = net.connect(port, host, () => {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x1f, 0x90]))
            if (buffer.length) upstream.write(buffer)
            upstream.pipe(socket)
            socket.pipe(upstream)
          })
          upstream.on('error', () => {
            socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            socket.destroy()
          })
          socket.on('error', () => upstream.destroy())
          socket.removeListener('data', onData)
          stage = 'tunnel'
          return
        }
      } catch {
        socket.destroy()
      }
    }
    socket.on('data', onData)
    socket.on('error', () => socket.destroy())
  })
  const port = await listen(server)
  return {
    port,
    connections,
    url: `socks5://${username || password ? `${username}:${password}@` : ''}127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}
