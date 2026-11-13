/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated HTTP request and authentication integration test cases.
 * Author review: Verified edge cases are handled and HTTP endpoints work
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createCognitoFixture } from '../../../packages/user-auth-backend-middleware/tests/cognito-token-fixture.mjs'
import { createApp, closeAppResources } from '../dist/app.js'
import { prisma } from '../dist/repositories/credit.repository.js'

test('credit HTTP reads verify JWTs locally and isolate user data', async (t) => {
  const owner = randomUUID()
  const other = randomUUID()
  const empty = randomUUID()
  const ids = [owner, other, empty]
  const prefix = randomUUID()
  const token = randomUUID()
  const fixture = await createCognitoFixture('credit-test')
  const authRequests = fixture.requests
  const ownerCookie = fixture.cookie(owner)
  const emptyCookie = fixture.cookie(empty)
  const api = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => api.once('listening', resolve))
  const url = `http://127.0.0.1:${api.address().port}`
  async function request(path, cookie, method = 'GET', body, serviceToken = true) {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...(cookie
          ? { Cookie: cookie === 'owner' ? ownerCookie : cookie === 'empty' ? emptyCookie : cookie }
          : {}),
        ...(path === '/internal/credit/reserve' && serviceToken
          ? { 'x-credit-service-token': process.env.CREDIT_SERVICE_INTERNAL_TOKEN }
          : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : text }
  }
  try {
    await prisma.creditBalance.create({
      data: { userId: owner, availableCredit: '75.25', reserveCredit: '12.5' },
    })
    await prisma.transactionRecord.createMany({
      data: [
        {
          reference: `errand:${prefix}-out:CREDIT_TRANSFER`,
          senderId: owner,
          receiverId: other,
          type: 'CREDIT_TRANSFER',
          amount: '12.5',
          time: new Date('2026-01-01'),
        },
        {
          reference: `errand:${prefix}-in:CREDIT_TRANSFER`,
          senderId: other,
          receiverId: owner,
          type: 'CREDIT_TRANSFER',
          amount: '3.25',
          time: new Date('2026-01-02'),
        },
        {
          reference: `errand:${prefix}-self:CREDIT_RESERVE`,
          senderId: owner,
          receiverId: owner,
          type: 'CREDIT_RESERVE',
          amount: '2.1',
          time: new Date('2026-01-03'),
        },
        {
          reference: `user:${prefix}-private:INITIAL_ALLOCATION`,
          senderId: other,
          receiverId: other,
          type: 'INITIAL_ALLOCATION',
          amount: 100,
          time: new Date('2026-01-04'),
        },
      ],
    })
    await t.test('missing cookie is rejected without contacting User Service', async () => {
      const count = authRequests.length
      for (const path of ['/api/credit', '/api/credit/history']) {
        const response = await request(path, undefined, 'GET')
        assert.equal(response.status, 401)
        assert.equal(response.body.error.code, 'UNAUTHENTICATED')
      }
      assert.equal(authRequests.length, count)
    })
    await t.test('malformed access tokens fail closed', async () => {
      for (const path of ['/api/credit', '/api/credit/history']) {
        assert.equal((await request(path, 'relay_access=invalid')).status, 401)
      }
    })
    await t.test('balance matches the contract and forwards service authentication', async () => {
      const response = await request('/api/credit', 'owner')
      assert.equal(response.status, 200)
      assert.deepEqual(Object.keys(response.body).sort(), [
        'availableCredit',
        'lastUpdated',
        'reserveCredit',
        'userId',
      ])
      assert.equal(response.body.userId, owner)
      assert.equal(response.body.availableCredit, 75.25)
      assert.equal(response.body.reserveCredit, 12.5)
      assert.ok(Number.isFinite(Date.parse(response.body.lastUpdated)))
      assert.ok(authRequests.length >= 1)
    })
    await t.test(
      'history includes incoming/outgoing records once, newest first, and excludes other users',
      async () => {
        const response = await request('/api/credit/history', 'owner')
        assert.equal(response.status, 200)
        assert.deepEqual(
          response.body.records.map((record) => record.reference.id),
          [`${prefix}-self`, `${prefix}-in`, `${prefix}-out`],
        )
        assert.equal(response.body.records[1].amount, 3.25)
        assert.deepEqual(response.body.records[1].reference, {
          service: 'errand',
          id: `${prefix}-in`,
          type: 'CREDIT_TRANSFER',
        })
        assert.ok(response.body.records.every((record) => typeof record.amount === 'number'))
      },
    )
    await t.test('history applies a 100-record limit and skips the requested offset', async () => {
      const data = Array.from({ length: 105 }, (_, n) => ({
        reference: `errand:${prefix}-page-${String(n).padStart(3, '0')}:CREDIT_RESERVE`,
        senderId: owner,
        receiverId: owner,
        type: 'CREDIT_RESERVE',
        amount: 1,
        time: new Date(Date.UTC(2026, 1, 1, 0, n)),
      }))
      await prisma.transactionRecord.createMany({ data })
      try {
        const first = await request('/api/credit/history', 'owner')
        const second = await request('/api/credit/history?offset=100', 'owner')
        const beyond = await request('/api/credit/history?offset=108', 'owner')
        assert.equal(first.status, 200)
        assert.equal(first.body.records.length, 100)
        assert.equal(first.body.records[0].reference.id, `${prefix}-page-104`)
        assert.equal(second.status, 200)
        assert.equal(second.body.records.length, 8)
        assert.equal(second.body.records[0].reference.id, `${prefix}-page-004`)
        assert.deepEqual(beyond.body.records, [])
      } finally {
        await prisma.transactionRecord.deleteMany({
          where: { reference: { startsWith: `errand:${prefix}-page-` } },
        })
      }
    })
    await t.test('history rejects malformed offsets', async () => {
      for (const offset of [
        '-1',
        '1.5',
        'foo',
        '1e2',
        '1&offset=2',
        '2147483648',
        '9007199254740992',
      ]) {
        const response = await request(`/api/credit/history?offset=${offset}`, 'owner')
        assert.equal(response.status, 400, offset)
        assert.equal(response.body.code, 'INVALID_REQUEST')
      }
    })
    await t.test('caller cannot select another user and malformed userId is rejected', async () => {
      for (const path of ['/api/credit', '/api/credit/history']) {
        const forbidden = await request(`${path}?userId=${other}`, 'owner')
        assert.equal(forbidden.status, 403)
        assert.equal(forbidden.body.code, 'FORBIDDEN')
        assert.equal((await request(`${path}?userId=`, 'owner')).status, 400)
        assert.equal((await request(`${path}?userId=a&userId=b`, 'owner')).status, 400)
        assert.equal((await request(`${path}?userId=${owner}`, 'owner')).status, 200)
      }
    })
    await t.test(
      'missing balance returns 404 and missing history returns an empty list',
      async () => {
        const balance = await request('/api/credit', 'empty')
        assert.equal(balance.status, 404)
        assert.equal(balance.body.code, 'USER_NOT_FOUND')
        assert.deepEqual(await request('/api/credit/history', 'empty'), {
          status: 200,
          body: { records: [] },
        })
      },
    )
    await t.test('internal reserve validates service token, amount, and reference', async () => {
      const reference = { service: 'delivery', id: `${prefix}-reserve`, type: 'CREDIT_RESERVE' }
      const body = { transactionReference: reference, userId: owner, amount: 10.25 }
      assert.equal((await request('/internal/credit/reserve', 'owner', 'POST')).status, 400)
      assert.equal(
        (await request('/internal/credit/reserve', undefined, 'POST', body, false)).status,
        401,
      )
      assert.equal(
        (
          await request('/internal/credit/reserve', 'owner', 'POST', {
            ...body,
            amount: -1,
          })
        ).body.code,
        'INVALID_CREDIT_AMOUNT',
      )
      assert.equal(
        (
          await request('/internal/credit/reserve', 'owner', 'POST', {
            ...body,
            amount: '10',
          })
        ).status,
        422,
      )
      assert.equal(
        (
          await request('/internal/credit/reserve', 'owner', 'POST', {
            ...body,
            transactionReference: { ...reference, type: 'CREDIT_TRANSFER' },
          })
        ).status,
        400,
      )
      assert.equal(
        (
          await request('/internal/credit/reserve', 'empty', 'POST', {
            ...body,
            userId: empty,
          })
        ).status,
        404,
      )
      const zero = await request('/internal/credit/reserve', 'owner', 'POST', {
        ...body,
        transactionReference: { ...reference, id: `${prefix}-zero` },
        amount: 0,
      })
      assert.equal(zero.status, 200)
      assert.equal(zero.body.availableCredit, 75.25)
      assert.equal(zero.body.reserveCredit, 12.5)
      const first = await request('/internal/credit/reserve', 'owner', 'POST', body)
      assert.equal(first.status, 200)
      assert.equal(first.body.status, 'RESERVE_SUCCESS')
      assert.equal(first.body.availableCredit, 65)
      assert.equal(first.body.reserveCredit, 22.75)
      const replay = await request('/internal/credit/reserve', 'owner', 'POST', body)
      assert.equal(replay.status, 409)
      assert.equal(replay.body.code, 'TRANSACTION_CONFLICT')
      assert.equal(
        (
          await request('/internal/credit/reserve', 'owner', 'POST', {
            ...body,
            amount: 9,
          })
        ).status,
        409,
      )
      const insufficient = await request('/internal/credit/reserve', 'owner', 'POST', {
        ...body,
        transactionReference: { ...reference, id: `${prefix}-too-much` },
        amount: 100,
      })
      assert.equal(insufficient.status, 422)
      assert.equal(insufficient.body.code, 'INSUFFICIENT_CREDITS')
      const history = await request('/api/credit/history', 'owner')
      assert.equal(
        history.body.records.filter((record) => record.reference.id === reference.id).length,
        1,
      )
    })
    await t.test(
      'concurrent reservations cannot spend the same available balance twice',
      async () => {
        const reserve = (id) =>
          request('/internal/credit/reserve', 'owner', 'POST', {
            transactionReference: { service: 'errand', id, type: 'CREDIT_RESERVE' },
            userId: owner,
            amount: 40,
          })
        const responses = await Promise.all([
          reserve(`${prefix}-race-a`),
          reserve(`${prefix}-race-b`),
        ])
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 422])
        const balance = await request('/api/credit', 'owner')
        assert.equal(balance.body.availableCredit, 25)
        assert.equal(balance.body.reserveCredit, 62.75)
      },
    )
    await t.test('simultaneous retries of one reservation charge only once', async () => {
      const body = {
        transactionReference: {
          service: 'errand',
          id: `${prefix}-same-reference`,
          type: 'CREDIT_RESERVE',
        },
        userId: owner,
        amount: 10,
      }
      const responses = await Promise.all([
        request('/internal/credit/reserve', 'owner', 'POST', body),
        request('/internal/credit/reserve', 'owner', 'POST', body),
      ])
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
      assert.equal(
        responses.find((response) => response.status === 409).body.code,
        'TRANSACTION_CONFLICT',
      )
      const balance = await request('/api/credit', 'owner')
      assert.equal(balance.body.availableCredit, 15)
      assert.equal(balance.body.reserveCredit, 72.75)
    })
    await t.test('no public credit mutation endpoint is exposed', async () => {
      assert.equal((await request('/api/credit', 'owner', 'POST')).status, 404)
      assert.equal(
        (await request('/api/credit/reserve', 'owner', 'POST', { amount: 1 })).status,
        404,
      )
      assert.equal(
        (await request('/api/credit/reserve', undefined, 'POST', { amount: 1 })).status,
        404,
      )
    })
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] },
    })
    await prisma.creditBalance.deleteMany({ where: { userId: { in: ids } } })
    api.closeAllConnections()
    await Promise.all([new Promise((resolve) => api.close(resolve)), fixture.close()])
    await closeAppResources()
  }
})
