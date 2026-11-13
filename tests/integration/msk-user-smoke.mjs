/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
 * Scope: Generated implementation of MSK user registration and event publication smoke checks
 * Author review: Verified test implementation and expected outputs match actual behavior.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { AdminCreateUserCommand, AdminSetUserPasswordCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
const parseText = text => Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
const target = process.env.MSK_SMOKE_TARGET ?? 'compose'
const env = { ...parseText(readFileSync('.env.development', 'utf8')), ...parseText(target === 'eks' ? execFileSync('docker', ['exec', 'relay-floci-eks', 'cat', '/app/data/relay-auth.env'], { encoding: 'utf8' }) : readFileSync('floci/docker/.generated.env', 'utf8')) }
const origin = target === 'eks' ? process.env.MSK_SMOKE_ORIGIN : 'http://localhost:8080'
assert.ok(origin, 'MSK_SMOKE_ORIGIN is required for EKS')
const cognito = new CognitoIdentityProviderClient({ region: env.AWS_DEFAULT_REGION, endpoint: target === 'eks' ? 'http://localhost:4567' : 'http://localhost:4566', credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY } })
const email = 'msk-smoke-' + Date.now() + '@nus.edu.sg'
const password = 'TestPass123!'
await cognito.send(new AdminCreateUserCommand({ UserPoolId: env.COGNITO_USER_POOL_ID, Username: email, UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }], MessageAction: 'SUPPRESS' }))
await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: env.COGNITO_USER_POOL_ID, Username: email, Password: password, Permanent: true }))
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
assert.equal(login.status, 200, 'new user login: ' + await login.text())
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
assert.ok(cookie)
const profile = await fetch(origin + '/api/user/me', { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Smoke' + Date.now() }) })
assert.equal(profile.status, 200, 'new user profile')
let credit
for (let attempt = 0; attempt < 45; attempt++) {
  const response = await fetch(origin + '/api/credit', { headers: { cookie } })
  if (response.ok) {
    credit = await response.json()
    break
  }
  await new Promise(resolve => setTimeout(resolve, 1000))
}
assert.ok(credit, 'credit allocation after user creation')
console.log(JSON.stringify({ email, credit }))
