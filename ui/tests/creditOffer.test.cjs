// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Credit picker boundary regression checks.
// Human review pending; see ui/ai-usage/ui-order-fix.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampCreditOffer } = require('../pages/CreateRequestPage.tsx');

test('zero balance starts at zero and stays zero with either adjustment', () => {
  let amount = clampCreditOffer(4, 0);
  assert.equal(amount, 0);
  for (const delta of [1, -1, -1, 1]) {
    amount = clampCreditOffer(amount + delta, 0);
    assert.equal(amount, 0);
  }
});

test('credit offers follow available balance and backend minimum', () => {
  assert.equal(clampCreditOffer(4, 2), 2);
  assert.equal(clampCreditOffer(0, 2), 1);
  assert.equal(clampCreditOffer(4, 10), 4);
  assert.equal(clampCreditOffer(5, 2), 2);
  assert.equal(clampCreditOffer(4, null), 4);
  assert.equal(clampCreditOffer(0, null), 1);
  assert.equal(clampCreditOffer(0, 5), 1);
  assert.equal(clampCreditOffer(2147483648, null), 2147483647);
});
