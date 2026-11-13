/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated unit tests for credit history helper functions
 * Author review: Verified correctness.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transactionDisplay } from '../src/history.ts'

const base = {
  reference: { service: 'errand', id: 'e1', type: 'CREDIT_TRANSFER' },
  type: 'CREDIT_TRANSFER',
  time: new Date('2026-10-17T00:00:00Z'),
  senderId: 'requester',
  receiverId: 'courier',
  amount: 12,
}

test('transfer signs and colors follow the viewer, without changing the record', () => {
  const snapshot = structuredClone(base)
  assert.deepEqual(transactionDisplay(base, 'courier'), {
    type: 'Incoming transfer',
    amount: '+12 cr',
    tone: 'incoming',
  })
  assert.deepEqual(transactionDisplay(base, 'requester'), {
    type: 'Outgoing transfer',
    amount: '-12 cr',
    tone: 'outgoing',
  })
  assert.deepEqual(base, snapshot)
})

test('reserving and releasing credits use neutral colors and opposite signs', () => {
  assert.deepEqual(transactionDisplay({ ...base, type: 'CREDIT_RESERVE' }, 'requester'), {
    type: 'Credit reserve',
    amount: '-12 cr',
    tone: 'neutral',
  })
  assert.deepEqual(transactionDisplay({ ...base, type: 'CREDIT_RELEASE' }, 'requester'), {
    type: 'Credit release',
    amount: '+12 cr',
    tone: 'neutral',
  })
})
