// Run against a provisioned test account with a completed profile:
// NODE_EXTRA_CA_CERTS=floci/eks/.floci-ca.pem RELAY_SHELL_URL=https://... \
// RELAY_TEST_EMAIL=... RELAY_TEST_PASSWORD=... node tests/integration/direct-api-routing.mjs
// Optionally stop local host Pods first and set RELAY_EXPECT_HOST_UNAVAILABLE=1.
import assert from 'node:assert/strict'
import { connect } from 'node:http2'

const origin = process.env.RELAY_SHELL_URL
assert.ok(origin && process.env.RELAY_TEST_EMAIL && process.env.RELAY_TEST_PASSWORD,
  'Set RELAY_SHELL_URL, RELAY_TEST_EMAIL, and RELAY_TEST_PASSWORD')
const session = connect(origin)
let cookie = ''

function request(path, { method = 'GET', body, stream = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = session.request({
      ':path': path, ':method': method, origin,
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    })
    const chunks = []
    let headers
    req.setTimeout(15000, () => req.destroy(new Error(`Timeout: ${path}`)))
    req.on('error', reject)
    req.on('response', (value) => {
      headers = value
      if (value['set-cookie']) {
        cookie = value['set-cookie'].map((item) => item.split(';')[0]).join('; ')
      }
      if (stream) {
        resolve({ status: Number(value[':status']), headers: value })
        req.close()
      }
    })
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve({
      status: Number(headers[':status']), headers,
      text: Buffer.concat(chunks).toString('utf8'),
    }))
    req.end(body ? JSON.stringify(body) : undefined)
  })
}

try {
  if (process.env.RELAY_EXPECT_HOST_UNAVAILABLE === '1') {
    const shell = await request('/')
    // Traefik can remove a route with no endpoints (404), or return 503.
    assert.ok([404, 503].includes(shell.status), 'Host must be unavailable during this check')
    console.log(`PASS: host unavailable (${shell.status})`)
  }
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: process.env.RELAY_TEST_EMAIL, password: process.env.RELAY_TEST_PASSWORD },
  })
  assert.equal(login.status, 200, 'Login must work through ingress')
  assert.ok(cookie, 'Login must set cookies')
  console.log('PASS: login and session cookies')

  for (const path of ['/api/auth/me', '/api/user/me', '/api/supplier', '/api/errands', '/api/credit']) {
    const result = await request(path)
    assert.equal(result.status, 200, `${path}: ${result.text}`)
    JSON.parse(result.text)
    console.log(`PASS: authenticated ${path}`)
  }
  const notifications = await request('/api/notifications/stream', { stream: true })
  assert.equal(notifications.status, 200)
  assert.match(notifications.headers['content-type'], /text\/event-stream/)
  console.log('PASS: authenticated notification SSE connection')
  const remote = await request('/remotes/user/remoteEntry.js')
  assert.equal(remote.status, 200)
  console.log('PASS: remote assets accessible')
} finally {
  session.destroy()
}
