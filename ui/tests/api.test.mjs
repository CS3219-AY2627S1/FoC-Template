import { after, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Compile the API modules in isolation; no browser or additional test dependencies needed.
const directory = await mkdtemp(join(tmpdir(), 'campus-api-test-'))
for (const [source, target] of [['src/api/api.ts', 'api'], ['src/api/models.ts', 'models'], ['src/api/orderDemo.ts', 'orderDemo'], ['src/routes.ts', 'routes']]) {
  const code = (await readFile(new URL(`../${source}`, import.meta.url), 'utf8'))
    .replaceAll('import.meta.env', '({})')
    .replaceAll("'./models'", "'./models.mjs'")
    .replaceAll("'./orderDemo'", "'./orderDemo.mjs'")
    .replaceAll("'../routes'", "'./routes.mjs'")
  await writeFile(join(directory, `${target}.mjs`), ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText)
}
const { makeCampusErrandsAPIRequest: request, makeAuthenticatedCampusErrandsAPIRequest: authenticatedRequest } = await import(pathToFileURL(join(directory, 'api.mjs')).href)
const { CampusErrandsAPIError } = await import(pathToFileURL(join(directory, 'models.mjs')).href)
const config = { service: 'user', url: '/signin', verb: 'POST' }
const originalFetch = globalThis.fetch
const fail = async (message, status) => assert.rejects(request(null, config), (error) =>
  error instanceof CampusErrandsAPIError && error.status === status && error.message === message)
afterEach(() => { globalThis.fetch = originalFetch })
after(() => rm(directory, { recursive: true, force: true }))

test('creation responses are unaffected unless the demo hook is armed', async () => {
  assert.equal(globalThis.window?.orderDemo, undefined)
  globalThis.fetch = async () => Response.json({ id: 'order-1' })
  assert.deepEqual(await request({}, { service: 'order', url: '/orders', verb: 'POST' }), { id: 'order-1' })
})
test('proxy HTML is replaced with a friendly service message', async () => {
  globalThis.fetch = async () => new Response('<html>502 Bad Gateway nginx</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })
  await fail('Account services are temporarily unavailable. Please try again shortly.', 502)
})
test('network errors do not leak browser diagnostics', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await fail('Account services are temporarily unavailable. Please try again shortly.', 0)
})

test('HTTP failures retain the server request ID for log lookup', async () => {
  globalThis.fetch = async () => Response.json({ message: 'Unavailable' }, {
    status: 503, headers: { 'X-Request-ID': 'request-123' },
  })
  await assert.rejects(request(null, config), (error) =>
    error instanceof CampusErrandsAPIError && error.status === 503 && error.requestId === 'request-123')
})
test('successful HTML fallback is treated as unavailable', async () => {
  globalThis.fetch = async () => new Response('<!doctype html><html>SPA</html>', { headers: { 'Content-Type': 'text/html' } })
  await fail('Account services are temporarily unavailable. Please try again shortly.', 502)
})
test('validation messages are retained', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'Email is already registered.' }, { status: 409 })
  await fail('Email is already registered.', 409)
})
test('HTML inside a JSON error is not displayed', async () => {
  globalThis.fetch = async () => Response.json({ message: '<html>proxy error</html>' }, { status: 400 })
  await fail('We couldn’t complete that request. Please try again.', 400)
})
test('malformed 401 body still triggers unauthenticated handler', async () => {
  globalThis.fetch = async () => new Response('{invalid', { status: 401, headers: { 'Content-Type': 'application/json' } })
  let unauthenticated = false
  await assert.rejects(authenticatedRequest(null, config, { onUnauthenticated: () => { unauthenticated = true } }), { status: 401 })
  assert.equal(unauthenticated, true)
})
test('outages do not trigger unauthenticated handler', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'internal database failure' }, { status: 503 })
  let unauthenticated = false
  await assert.rejects(authenticatedRequest(null, config, { onUnauthenticated: () => { unauthenticated = true } }), { status: 503 })
  assert.equal(unauthenticated, false)
})
