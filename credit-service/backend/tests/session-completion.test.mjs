// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, debugged implementation
// Author review: I validated correctness and edited for style.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { creditAuthMiddleware } from '../dist/middleware/session.middleware.js'
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused'
process.env.CREDIT_SERVICE_INTERNAL_TOKEN ??= 'test-token'
process.env.KAFKA_TOPIC_USER_EVENTS ??= 'user-events'
process.env.KAFKA_TOPIC_USER_DLQ ??= 'user-events-dlq'
process.env.KAFKA_TOPIC_ERRAND_EVENTS ??= 'errand-events'
process.env.KAFKA_TOPIC_ERRAND_DLQ ??= 'errand-events-dlq'

test('credit rejects an unverified identity', () => {
  const next = (error) => assert.equal(error?.code, 'FORBIDDEN')
  creditAuthMiddleware[1]({ user: { sub: 'sub', emailVerified: false } }, { locals: {} }, next)
})
test('credit accepts a verified identity without profile state', () => {
  const res = { locals: {} }
  creditAuthMiddleware[1]({ user: { sub: 'sub', emailVerified: true } }, res, (error) =>
    assert.equal(error, undefined),
  )
  assert.equal(res.locals.creditUserId, 'sub')
})
