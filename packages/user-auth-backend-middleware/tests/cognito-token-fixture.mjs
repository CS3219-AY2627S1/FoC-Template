/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated Cognito token test fixtures
 * Author review: Verified token generation correctness and that tests correctly obtain valid tokens.
 */

import { createServer } from 'node:http'
import { createSign, generateKeyPairSync } from 'node:crypto'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}
export async function createCognitoFixture(kid = 'test-key') {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }
  const requests = []
  const server = createServer((req, res) => {
    requests.push(req.url)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const issuer = `http://127.0.0.1:${server.address().port}/us-east-1_test`
  process.env.COGNITO_ISSUER = issuer
  process.env.COGNITO_JWKS_URI = `http://127.0.0.1:${server.address().port}/jwks`
  process.env.COGNITO_CLIENT_ID = 'test'
  process.env.COGNITO_USER_POOL_ID = 'us-east-1_test'
  process.env.COGNITO_ADMIN_GROUP_NAME = 'AdminGroup'
  process.env.COGNITO_SUPERADMIN_GROUP_NAME = 'SuperAdminGroup'
  function sign(payload) {
    const data = `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode(payload)}`
    return `${data}.${createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url')}`
  }
  function cookie(sub, { groups = [], verified = true } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const base = { iss: issuer, sub, iat: now, exp: now + 900 }
    const access = sign({
      ...base,
      token_use: 'access',
      client_id: 'test',
      'cognito:groups': groups,
    })
    const id = sign({
      ...base,
      token_use: 'id',
      aud: 'test',
      email: 'test@example.com',
      email_verified: verified,
    })
    return `relay_access=${access}; relay_id=${id}`
  }
  return {
    cookie,
    requests,
    server,
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
