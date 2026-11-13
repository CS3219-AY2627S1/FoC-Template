/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated Cognito authentication and cookie tests
 * Author review: Verified correctness.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AuthController } from '../dist/controllers/auth.controller.js'

test('login forwards Cognito access and ID tokens in secure cookies', async () => {
  const controller = new AuthController({
    login: async () => ({
      user: { sub: 'subject', email: 'user@example.com', emailVerified: true, role: 'user' },
      accessToken: 'cognito-access',
      idToken: 'cognito-id',
      refreshToken: 'cognito-refresh',
    }),
  })
  const headers = []
  let status, body, error
  const res = {
    append(name, value) {
      headers.push([name, value])
      return this
    },
    json(value) {
      body = value
      return this
    },
    status(value) {
      status = value
      return this
    },
  }
  controller.login({ body: { email: 'user@example.com', password: 'password' } }, res, (e) => {
    error = e
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(error, undefined)
  assert.equal(status, undefined)
  assert.equal(body.data.user.subject, 'subject')
  assert.equal(headers.length, 3)
  assert.match(
    headers[0][1],
    /^relay_access=cognito-access;.*HttpOnly; SameSite=Strict; Secure; Max-Age=900$/,
  )
  assert.match(
    headers[1][1],
    /^relay_id=cognito-id;.*HttpOnly; SameSite=Strict; Secure; Max-Age=900$/,
  )
  assert.match(
    headers[2][1],
    /^relay_refresh=cognito-refresh; Path=\/api\/auth; HttpOnly; SameSite=Strict; Secure$/,
  )
})
