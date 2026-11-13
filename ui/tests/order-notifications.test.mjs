import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'order-notices-'))
const source = await readFile(new URL('../src/pages/orders/notifications.ts', import.meta.url), 'utf8')
const models = await readFile(new URL('../src/pages/orders/models.ts', import.meta.url), 'utf8')
await writeFile(join(directory, 'models.mjs'), ts.transpileModule(models, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText)
await writeFile(join(directory, 'notifications.mjs'), ts.transpileModule(source.replace("from './models'", "from './models.mjs'"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText)
const { orderNotice } = await import(join(directory, 'notifications.mjs'))
after(() => rm(directory, { recursive: true, force: true }))
const order = { id: 'order', requester_id: 'requester', courier_id: 'courier', credits: 8, status: 'open', credit_status: 'succeeded' }

test('reservation is announced only to requester on init to open', () => {
  const previous = { ...order, status: 'init' }
  assert.match(orderNotice(previous, order, 'requester').message, /8 credits have been reserved/)
  assert.equal(orderNotice(previous, order, 'courier'), null)
  assert.equal(orderNotice(order, order, 'requester'), null)
  assert.equal(orderNotice(undefined, order, 'requester'), null)
})
test('observed dispute resolutions notify both participants, not initial history or outsiders', () => {
  const dispute = { id: 'case', closed_at: null, resolution: null }
  const previous = { ...order, disputes: [dispute] }
  const resolved = { ...order, disputes: [{ ...dispute, closed_at: '2026-01-01', resolution: 'pay' }] }
  for (const user of ['requester', 'courier']) {
    assert.match(orderNotice(previous, resolved, user).title, /resolved by administrator/)
    assert.equal(orderNotice(resolved, resolved, user), null)
    assert.equal(orderNotice(undefined, resolved, user), null)
  }
  assert.equal(orderNotice(previous, resolved, 'outsider'), null)
})
test('automatic recovery is not attributed to an administrator and does not swallow the courier payout notice', () => {
  const dispute = { id: 'case', kind: 'financial', closed_at: null, closed_by: null, resolution: null }
  const previous = { ...order, status: 'received', credit_operation: 'TRANSFER', credit_status: 'pending', disputes: [dispute] }
  const recovered = { ...previous, status: 'completed', credit_status: 'succeeded', disputes: [{ ...dispute, closed_at: '2026-01-01', resolution: 'recovered' }] }
  const requesterNotice = orderNotice(previous, recovered, 'requester')
  assert.match(requesterNotice.title, /resolved automatically/)
  assert.doesNotMatch(requesterNotice.message, /administrator recorded/i)
  const courierNotice = orderNotice(previous, recovered, 'courier')
  assert.equal(courierNotice.title, 'Credits received!')
  assert.match(courierNotice.message, /8 credits have been added/)
  assert.equal(orderNotice(recovered, recovered, 'requester'), null)
  assert.equal(orderNotice(undefined, recovered, 'requester'), null)
  assert.equal(orderNotice(previous, recovered, 'outsider'), null)
})
test('automatic refund recovery notifies the requester without inventing a payout', () => {
  const dispute = { id: 'case', kind: 'financial', closed_at: null, closed_by: null }
  const previous = { ...order, status: 'expired', credit_operation: 'RELEASE', credit_status: 'pending', disputes: [dispute] }
  const recovered = { ...previous, credit_status: 'succeeded', disputes: [{ ...dispute, closed_at: '2026-01-01', resolution: 'recovered' }] }
  assert.match(orderNotice(previous, recovered, 'requester').title, /resolved automatically/)
})
test('administrator settlement is announced without advancing the fulfilment milestone', () => {
  const previous = { ...order, status: 'picked_up', credit_operation: 'TRANSFER', credit_status: 'pending', disputes: [{ id: 'case', closed_at: '2026-01-01', resolution: 'pay' }] }
  const settled = { ...previous, credit_status: 'succeeded' }
  assert.match(orderNotice(previous, settled, 'courier').message, /Administrator-approved payment completed/)
  assert.equal(orderNotice(settled, settled, 'courier'), null)
  assert.equal(orderNotice(previous, settled, 'requester'), null)
})
test('payout is announced only to courier after confirmed settlement', () => {
  const previous = { ...order, status: 'received', credit_operation: 'TRANSFER', credit_status: 'pending' }
  const completed = { ...previous, status: 'completed', credit_status: 'succeeded' }
  assert.match(orderNotice(previous, completed, 'courier').message, /8 credits have been added/)
  assert.equal(orderNotice(previous, completed, 'requester'), null)
  assert.equal(orderNotice(previous, { ...completed, credit_status: 'pending' }, 'courier'), null)
  assert.equal(orderNotice(completed, completed, 'courier'), null)
  assert.equal(orderNotice(undefined, completed, 'courier'), null)
})
