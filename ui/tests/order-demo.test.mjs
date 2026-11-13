import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'campus-order-demo-test-'))
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
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
globalThis.window = {}
const { makeCampusErrandsAPIRequest: request } = await import(join(directory, 'api.mjs'))
const { CampusErrandsAPIError } = await import(join(directory, 'models.mjs'))
const { orderPollingGeneration, canApplyOrderPoll } = await import(join(directory, 'orderDemo.mjs'))
const create = { service: 'order', url: '/orders', verb: 'POST' }
after(async () => {
  globalThis.window = originalWindow
  globalThis.fetch = originalFetch
  await rm(directory, { recursive: true, force: true })
})

test('polling controls invalidate in-flight polls and leave actions available', async () => {
  const before = orderPollingGeneration()
  assert.equal(canApplyOrderPoll(before), true)
  window.orderDemo.stopPollingOrder()
  assert.equal(canApplyOrderPoll(before), false)
  assert.equal(canApplyOrderPoll(orderPollingGeneration()), false)
  globalThis.fetch = async () => Response.json({ detail: 'Order cannot be cancelled' }, { status: 409 })
  await assert.rejects(request({}, { service: 'order', url: '/orders/123/cancel', verb: 'PATCH' }), { status: 409 })
  window.orderDemo.resumePollingOrder()
  assert.equal(canApplyOrderPoll(before), false, 'a pre-pause response stays invalid after resuming')
  assert.equal(canApplyOrderPoll(orderPollingGeneration()), true)
})

test('demo discards one real successful receipt, preserving idempotent retry request', async () => {
  const received = []
  const order = { id: 'created-on-server' }
  globalThis.fetch = async (url, init) => {
    received.push({ url, body: init.body, headers: init.headers })
    return Response.json(order, { status: 201 })
  }
  window.orderDemo.dropNextCreateResponse()
  const payload = { supplier_id: 'supplier-1', credits: 1 }
  const headers = { 'Idempotency-Key': 'same-key' }
  await assert.rejects(request(payload, create, headers), (error) =>
    error instanceof CampusErrandsAPIError && error.status === 0)
  assert.equal(received.length, 1, 'request reached the server before the receipt was discarded')
  assert.deepEqual(await request(payload, create, headers), order)
  assert.equal(received.length, 2)
  assert.deepEqual(received[0], received[1], 'retry uses exactly the same payload and key')
})

test('polling, cancellation, other services and unsuccessful creations do not consume the hook', async () => {
  window.orderDemo.dropNextCreateResponse()
  globalThis.fetch = async () => Response.json({ ok: true })
  for (const config of [
    { service: 'order', url: '/orders', verb: 'GET' },
    { service: 'order', url: '/orders/123/cancel', verb: 'PATCH' },
    { service: 'supplier', url: '/orders', verb: 'POST' },
  ]) {
    assert.deepEqual(await request({}, config), { ok: true })
  }
  globalThis.fetch = async () => Response.json({ detail: 'Unavailable' }, { status: 503 })
  await assert.rejects(request({}, create), { status: 503 })
  globalThis.fetch = async () => { throw new TypeError('Network failed') }
  await assert.rejects(request({}, create), { status: 0 })
  globalThis.fetch = async () => new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } })
  await assert.rejects(request({}, create), { status: 502 })
  globalThis.fetch = async () => Response.json({ id: 'order-2' })
  await assert.rejects(request({}, create), { status: 0 })
  assert.deepEqual(await request({}, create), { id: 'order-2' })
})
