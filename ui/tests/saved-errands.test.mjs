import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'saved-errands-'))
await symlink(new URL('../node_modules', import.meta.url), join(directory, 'node_modules'), 'dir')
const source = await readFile(new URL('../src/pages/orders/submission.ts', import.meta.url), 'utf8')
await writeFile(join(directory, 'submission.mjs'), ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText)
const submission = await import(join(directory, 'submission.mjs'))
after(() => rm(directory, { recursive: true, force: true }))
const template = { id: 'template', owner_id: 'user', name: 'Tea', supplier_id: 'supplier', items: [{ name: ' Tea ', quantity: 2 }], delivery_location: ' COM2 ', pickup_notes: ' ', credits: 8, status: 'completed', expires_at: 'old' }

test('template prefilling copies only reusable inputs and isolates item edits', () => {
  assert.equal(typeof submission.templateDraft, 'function')
  const draft = submission.templateDraft(template)
  assert.deepEqual(draft, { supplier_id: 'supplier', items: [{ name: 'Tea', quantity: 2 }], delivery_location: 'COM2', pickup_notes: null, credits: 8 })
  draft.items[0].name = 'Coffee'
  assert.equal(template.items[0].name, ' Tea ')
})

test('each new template order gets a fresh key while retries keep the frozen payload', async () => {
  assert.equal(typeof submission.templateDraft, 'function')
  assert.equal(typeof submission.newCreationAttempt, 'function')
  const draft = submission.templateDraft(template)
  const attempt = submission.newCreationAttempt(draft)
  const second = submission.newCreationAttempt(draft)
  assert.notEqual(attempt.key, second.key)
  const calls = []
  await submission.submitWithRetry({
    api: { create: async (request, key) => { calls.push({ request: structuredClone(request), key }); if (calls.length === 1) { draft.items[0].name = 'Changed'; throw Object.assign(new Error('Lost response'), { status: 0 }) } return { id: 'new-order', status: 'init' } } },
    request: JSON.parse(attempt.payload), key: attempt.key,
    signal: new AbortController().signal, wantsCancellation: () => false, onRetry: () => {}, wait: async () => {},
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], calls[1])
  assert.equal(calls[0].request.items[0].name, 'Tea')
})


test('new order attempts work when crypto.randomUUID is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const webCrypto = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: webCrypto.getRandomValues.bind(webCrypto) },
  })
  try {
    const attempt = submission.newCreationAttempt(submission.templateDraft(template))
    assert.match(attempt.key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(JSON.parse(attempt.payload).delivery_location, 'COM2')
  } finally {
    Object.defineProperty(globalThis, 'crypto', original)
  }
})
