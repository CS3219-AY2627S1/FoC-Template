// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Missing-password-requirement regression checks.
// Human review pending; see ui/ai-usage/ui-order-fix.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { passwordRequirements } = require('../pages/SignupPage.tsx');

test('all missing password requirements are returned together', () => {
  assert.deepEqual(passwordRequirements('abcdefgh'), [
    'Password requires at least one uppercase letter.',
    'Password requires at least one number.',
    'Password requires at least one special character.',
  ]);
  assert.equal(passwordRequirements('').length, 4);
});

test('satisfied requirements are omitted and valid passwords have no errors', () => {
  assert.deepEqual(passwordRequirements('Abcdefgh'), [
    'Password requires at least one number.',
    'Password requires at least one special character.',
  ]);
  assert.deepEqual(passwordRequirements('Abcdefg1'), [
    'Password requires at least one special character.',
  ]);
  assert.deepEqual(passwordRequirements('Abcdef1!'), []);
});
