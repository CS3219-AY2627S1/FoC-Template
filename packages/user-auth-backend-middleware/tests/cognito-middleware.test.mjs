/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated Cognito authentication middleware tests
 * Author review: Verified edge cases are covered.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCognitoFixture } from './cognito-token-fixture.mjs'
import {
  readCookie,
  userAuthMiddleware,
  userAuthAdminMiddleware,
  userAuthSuperAdminMiddleware,
  verifyCognitoTokens,
} from '../dist/index.js'

test('Cognito access and ID tokens enforce identity and group roles', async () => {
  const fixture = await createCognitoFixture('middleware-test')
  try {
    const userCookie = fixture.cookie('user-sub')
    const adminCookie = fixture.cookie('admin-sub', { groups: ['AdminGroup'] })
    const superCookie = fixture.cookie('super-sub', { groups: ['SuperAdminGroup'] })
    const identify = (cookie) =>
      verifyCognitoTokens(readCookie(cookie, 'relay_access'), readCookie(cookie, 'relay_id'))
    assert.equal((await identify(userCookie)).role, 'user')
    assert.equal((await identify(adminCookie)).role, 'admin')
    assert.equal((await identify(superCookie)).role, 'super-admin')
    await assert.rejects(
      identify(
        `relay_access=${readCookie(userCookie, 'relay_access')}; relay_id=${readCookie(adminCookie, 'relay_id')}`,
      ),
    )
    await assert.rejects(identify('relay_access=invalid; relay_id=invalid'))

    async function run(handler, cookie) {
      let status = 200,
        body,
        passed = false
      const req = { header: () => cookie }
      const res = {
        status(code) {
          status = code
          return this
        },
        json(value) {
          body = value
          return this
        },
      }
      await handler(req, res, () => {
        passed = true
      })
      return { status, body, passed, user: req.user }
    }
    assert.equal((await run(userAuthMiddleware, userCookie)).passed, true)
    assert.equal((await run(userAuthAdminMiddleware, userCookie)).status, 403)
    assert.equal((await run(userAuthSuperAdminMiddleware, adminCookie)).status, 403)
    assert.equal((await run(userAuthAdminMiddleware, adminCookie)).passed, true)
    assert.equal((await run(userAuthAdminMiddleware, superCookie)).passed, true)
    assert.equal((await run(userAuthSuperAdminMiddleware, superCookie)).passed, true)
    assert.equal((await run(userAuthAdminMiddleware, undefined)).status, 401)
  } finally {
    await fixture.close()
  }
})
