import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const directory = await mkdtemp(join(tmpdir(), 'order-operations-'))
await symlink(new URL('../node_modules', import.meta.url), join(directory, 'node_modules'), 'dir')
const load = async (path, name) => {
  let source = await readFile(new URL(path, import.meta.url), 'utf8')
  if (name === 'review.mjs') source = source.replace("from './models'", "from './operations.mjs'").replace("import styles from './OrderOperations.module.css'", 'const styles = {}').replace("import orderStyles from '../orders/Orders.module.css'", 'const orderStyles = {}')
  await writeFile(join(directory, name), ts.transpileModule(source.replace(/from '(?:\.\.\/orders|\.)\/models'/g, "from './orders.mjs'"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)
  return import(join(directory, name))
}
const { filterPersonalOrders, orderDeadline, settlementLabel } = await load('../src/pages/orders/models.ts', 'orders.mjs')
await load('../src/pages/orderOperations/models.ts', 'operations.mjs')
const { CaseReview } = await load('../src/pages/orderOperations/CaseReview.tsx', 'review.mjs')
const { decisionReducer } = await load('../src/pages/orderOperations/decision.ts', 'decision.mjs')
after(() => rm(directory, { recursive: true, force: true }))

const dispute = { id: 'case-1', kind: 'fulfilment', opened_by: 'courier', closed_at: null, reason: 'Item unavailable', available_actions: [] }
const order = { id: 'order-1', requester_id: 'requester', courier_id: 'courier', status: 'picked_up', credit_operation: 'RESERVE', credit_status: 'succeeded', items: [], disputes: [dispute], available_actions: [], is_active: true, review_category: 'fulfilment' }
const evidence = { diagnostics: { accounts: [], audit_logs: [] }, commands: [], audit: [] }
const renderReview = (case_, detail = evidence) => renderToStaticMarkup(createElement(CaseReview, {
  order: { ...order, disputes: [case_] }, dispute: case_, detail, disabled: false,
  person: (id) => id ?? 'System', onChoose: () => {},
}))

test('missing wallet declines checkout without implying a financial investigation', () => {
  const refused = { ...order, status: 'rejected', credit_status: 'rejected', credit_reason: 'ACCOUNT_NOT_FOUND', disputes: [], is_active: false, review_category: 'history' }
  assert.equal(settlementLabel(refused), 'Wallet not ready — please submit a new order shortly')
  assert.equal(filterPersonalOrders([refused], 'active', 'newest').length, 0)
})

test('personal filters use backend activity, not retained milestones', () => {
  const finished = { ...order, is_active: false }
  assert.deepEqual(filterPersonalOrders([finished], 'active', 'newest'), [])
  assert.deepEqual(filterPersonalOrders([finished], 'finished', 'newest'), [finished])
})

test('settlement deadlines take precedence over retained progress milestones', () => {
  const settling = { ...order, credit_operation: 'TRANSFER', credit_status: 'pending', progress_due_at: '2025-01-01', settlement_due_at: '2026-01-01' }
  assert.deepEqual(orderDeadline(settling), { at: '2026-01-01', label: 'Credit settlement', settlement: true })
  assert.equal(orderDeadline({ ...settling, credit_status: 'succeeded', progress_due_at: null }), null)
})

test('actions require loaded evidence and server-supplied eligibility', () => {
  const eligible = { ...dispute, available_actions: ['refund', 'pay'] }
  assert.match(renderReview(eligible, null), /disabled="">Refund requester/)
  assert.match(renderReview(dispute), /disabled="">Pay courier/)
  assert.doesNotMatch(renderReview(eligible), /disabled="">Refund requester/)
  assert.match(renderReview(eligible, { ...evidence, diagnostics: null, evidence_error: 'Credit unavailable' }), /disabled="">Refund requester/)
  const financial = { ...dispute, kind: 'financial', available_actions: [] }
  assert.doesNotMatch(renderReview(financial), />Charge requester again<|>Cover missing credits/)
  assert.match(renderReview({ ...financial, available_actions: ['cover_reserved'] }), />Cover missing credits/)
  assert.doesNotMatch(renderReview({ ...financial, closed_at: '2026-01-01', available_actions: ['cover_reserved'] }), /data-admin-action/)
})

const decision = { order, caseId: 'case-1', requestId: 'request-1', action: 'cover_reserved' }
const chooseDecision = () => decisionReducer({ status: 'closed' }, { type: 'choose', decision })
test('submission freezes intent and uncertain retries preserve it', () => {
  const editing = decisionReducer(chooseDecision(), { type: 'edit', reason: '  Confirmed shortfall  ' })
  let state = decisionReducer(editing, { type: 'submit' })
  assert.equal(state.status, 'submitting')
  assert.equal(state.reason, 'Confirmed shortfall')
  assert.deepEqual(decisionReducer(state, { type: 'edit', reason: 'Changed' }), state)
  assert.deepEqual(decisionReducer(state, { type: 'close' }), state)
  state = decisionReducer(state, { type: 'failed', error: 'Response lost' })
  assert.equal(state.status, 'uncertain')
  assert.deepEqual(decisionReducer(state, { type: 'edit', reason: 'Changed' }), state)
  state = decisionReducer(state, { type: 'submit' })
  assert.equal(state.requestId, 'request-1')
  assert.equal(state.action, 'cover_reserved')
  assert.equal(state.reason, 'Confirmed shortfall')
  assert.deepEqual(decisionReducer(state, { type: 'accepted' }), { status: 'closed' })
})
