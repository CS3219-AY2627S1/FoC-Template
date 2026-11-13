/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated authenticated fetch unit tests
 * Author review: Verified correctness of mock responses, and that edge cases are covered.
 */

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { authFetch } from '../src/index.ts'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('refreshes after an idle tab and replays a POST body', async () => {
  const calls = []
  let refreshed = false
  globalThis.fetch = async (request) => {
    const url = typeof request === 'string' ? request : new URL(request.url).pathname
    calls.push({
      url,
      body:
        request instanceof Request && request.method === 'POST' && url !== '/api/auth/refresh'
          ? await request.text()
          : undefined,
    })
    if (url === '/api/auth/refresh') {
      refreshed = true
      return new Response(null, { status: 200 })
    }
    return new Response(null, { status: refreshed ? 200 : 401 })
  }
  const response = await authFetch('/api/errands', {
    method: 'POST',
    body: JSON.stringify({ title: 'Test' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/errands', '/api/auth/refresh', '/api/errands'],
  )
  assert.equal(calls[0].body, calls[2].body)
})

test('concurrent expired requests share one refresh', async () => {
  let refreshes = 0
  let refreshed = false
  globalThis.fetch = async (request) => {
    const url = typeof request === 'string' ? request : new URL(request.url).pathname
    if (url === '/api/auth/refresh') {
      refreshes++
      await new Promise((resolve) => setTimeout(resolve, 10))
      refreshed = true
      return new Response(null, { status: 200 })
    }
    return new Response(null, { status: refreshed ? 200 : 401 })
  }
  const responses = await Promise.all([authFetch('/api/credit'), authFetch('/api/user/me')])
  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  )
  assert.equal(refreshes, 1)
})

test('failed refresh returns unauthorized without retry loop', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(null, { status: 401 })
  }
  assert.equal((await authFetch('/api/credit')).status, 401)
  assert.equal(calls, 2)
})

test('invalid login does not trigger refresh', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response(null, { status: 401 })
  }
  assert.equal((await authFetch('/api/auth/login', { method: 'POST' })).status, 401)
  assert.equal(calls, 1)
})
