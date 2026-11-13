/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
 * Scope: Generated implementation of application integration checks and local HTTP/2 transport selection
 * Author review: Verified correctness.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchOverHttp2 } from './http2-fetch.mjs'

const request = process.env.RELAY_TEST_HTTP2 === '1' ? fetchOverHttp2 : fetch

const shellUrl = (process.env.RELAY_SHELL_URL ?? 'http://localhost:8080').replace(/\/$/, '')

const frontendServices = [
  { id: 'supplier', federationName: 'supplierFrontend' },
  { id: 'user', federationName: 'userFrontend' },
  { id: 'errand', federationName: 'errandFrontend' },
  { id: 'credit', federationName: 'creditFrontend' },
]

async function fetchText(url) {
  let response

  try {
    response = await request(url)
  } catch (error) {
    throw new Error(`Could not connect to ${url}. Is the Relay environment running?`, {
      cause: error,
    })
  }

  const body = await response.text()
  assert.equal(response.ok, true, `${url} returned HTTP ${response.status}`)
  return body
}

test('the Relay shell is reachable', async () => {
  const body = await fetchText(`${shellUrl}/`)
  assert.match(body, /Relay host application|id=["']root["']/)
})

for (const { id, federationName } of frontendServices) {
  test(`${id} frontend is accessible through the shell`, async () => {
    const url = `${shellUrl}/remotes/${id}/remoteEntry.js`
    const body = await fetchText(url)

    assert.match(body, new RegExp(federationName))
    const exposesMapUrl = body.match(/import __mfExposesMap from ["']([^"']+)["']/)?.[1]
    if (exposesMapUrl) {
      const exposesMap = await fetchText(new URL(exposesMapUrl, shellUrl).toString())
      assert.match(exposesMap, /\.\/App/)
    } else {
      assert.match(body, /App/)
    }
  })
}

test('browser login reaches the auth API through the shell', async () => {
  const response = await request(`${shellUrl}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: shellUrl, 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.notEqual(body.error.code, 'FORBIDDEN')
})

test('cross-origin browser login is rejected', async () => {
  const response = await request(`${shellUrl}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(response.status, 403)
  const body = await response.json()
  assert.equal(body.error.code, 'FORBIDDEN')
})

// A missing ingress route often returns host index.html with HTTP 200 instead
// of an API response. Exercise every public backend boundary without a session.
for (const path of [
  '/api/auth/me',
  '/api/user/me',
  '/api/supplier',
  '/api/errands',
  '/api/credit',
  '/api/notifications/stream',
]) {
  test(`${path} reaches its backend and requires authentication`, async () => {
    const response = await request(`${shellUrl}${path}`)
    const body = await response.text()
    assert.equal(response.status, 401, `${path} must reach the protected API; response: ${body.slice(0, 500)}`)
    assert.doesNotMatch(body, /<!doctype html|id=["']root["']/i)
  })
}
