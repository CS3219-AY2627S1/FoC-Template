import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'order-submission-'))
const source = await readFile(new URL('../src/pages/orders/submission.ts', import.meta.url), 'utf8')
await writeFile(join(directory, 'submission.mjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText)
const { submitWithRetry, retryDelay } = await import(join(directory, 'submission.mjs'))
after(() => rm(directory, { recursive: true, force: true }))
const order = { id: 'one', status: 'open' }
const networkError = () => Object.assign(new Error('Response lost'), { status: 0 })
const options = (api, extra = {}) => ({ api, request: { credits: 1 }, key: 'fixed-key', signal: new AbortController().signal, wantsCancellation: () => false, onRetry: () => {}, wait: async () => {}, ...extra })

test('lost creation response retries the exact same payload and key', async () => {
  const calls = []
  const opts = options({ create: async (...args) => { calls.push(args); if (calls.length === 1) throw networkError(); return order } })
  assert.equal((await submitWithRetry(opts)).order.id, 'one')
  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], calls[1][0])
  assert.equal(calls[1][1], 'fixed-key')
})
test('cancellation intent during a lost response recovers ID then cancels', async () => {
  let cancel = false
  let calls = 0
  const cancelled = { ...order, status: 'cancelled' }
  const result = await submitWithRetry(options({
    create: async () => { if (++calls === 1) { cancel = true; throw networkError() } return order },
    update: async (id, action) => { assert.equal(id, 'one'); assert.equal(action, 'cancel'); return cancelled },
  }, { wantsCancellation: () => cancel }))
  assert.equal(result.order.status, 'cancelled')
})
test('lost cancellation response replays creation to confirm already cancelled', async () => {
  let stored = order
  let updates = 0
  const result = await submitWithRetry(options({
    create: async () => stored,
    update: async () => { updates++; stored = { ...order, status: 'cancelled' }; throw networkError() },
  }, { wantsCancellation: () => true }))
  assert.equal(result.order.status, 'cancelled')
  assert.equal(updates, 1)
})
test('waits for init reservation before cancelling', async () => {
  let calls = 0
  const result = await submitWithRetry(options({
    create: async () => ++calls === 1 ? { ...order, status: 'init' } : order,
    update: async () => ({ ...order, status: 'cancelled' }),
  }, { wantsCancellation: () => true }))
  assert.equal(calls, 2)
  assert.equal(result.order.status, 'cancelled')
})
test('accepted order reports cancellation unavailable without claiming success', async () => {
  const result = await submitWithRetry(options({ create: async () => ({ ...order, status: 'accepted' }) }, { wantsCancellation: () => true }))
  assert.equal(result.cancellationUnavailable, true)
})
test('409 cancellation reconciles already-cancelled state', async () => {
  const result = await submitWithRetry(options({
    create: async () => order,
    update: async () => { throw { status: 409 } },
    requested: async () => [{ ...order, status: 'cancelled' }],
  }, { wantsCancellation: () => true }))
  assert.equal(result.cancellationUnavailable, false)
})
test('404 is not reported as cancellation success', async () => {
  await assert.rejects(submitWithRetry(options({
    create: async () => order,
    update: async () => { throw Object.assign(new Error('Not found'), { status: 404 }) },
  }, { wantsCancellation: () => true })), /Not found/)
})
test('automatic retries are bounded; definitive errors are not retried', async () => {
  for (const [status, expected] of [[503, 6], [429, 6], [408, 6], [422, 1], [401, 1], [409, 1]]) {
    let calls = 0
    await assert.rejects(submitWithRetry(options({ create: async () => { calls++; throw Object.assign(new Error('failed'), { status }) } })))
    assert.equal(calls, expected)
  }
})
test('abort prevents another attempt', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(submitWithRetry(options({ create: async () => { calls++; throw networkError() } }, {
    signal: controller.signal, wait: async () => { controller.abort(); controller.signal.throwIfAborted() },
  })))
  assert.equal(calls, 1)
})
test('jitter stays bounded with capped exponential backoff', () => {
  assert.equal(retryDelay(0, () => 0), 500)
  assert.equal(retryDelay(1, () => 1), 2000)
  assert.equal(retryDelay(20, () => 1), 15000)
})
