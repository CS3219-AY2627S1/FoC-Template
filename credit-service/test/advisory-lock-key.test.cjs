// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Generated fixed cross-language vectors for human-specified advisory-key encoding, including signed precision, UTF-8, JSON escaping, and input types.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024 (prior scopes retained).

const assert = require('node:assert/strict');
const { test } = require('node:test');
require('tsx/cjs');
const { advisoryLockKey } = require('../src/repos/advisoryLockKey.ts');

test('advisory keys match independent Python hashlib/struct vectors exactly', () => {
  // Generated with compact ensure_ascii=False JSON, UTF-8, SHA-256, struct.unpack('>q').
  const vectors = [
    ['init_credits', 'user-1', '-6861169219867473191'],
    ['account', 'user-1', '-1249468385911053608'],
    ['namespace', 'key', '4125542390088161614'],
    ['', '', '4868536279191960145'],
    ['a', 'bc', '4802794283207797490'],
    ['ab', 'c', '-9054446362198218859'],
    ['账户', '用户🚲', '4489804201161793282'],
    ['a' + String.fromCharCode(34, 92), 'line\nbreak', '1181383278141866038'],
  ];
  for (const [namespace, key, expected] of vectors) {
    const result = advisoryLockKey(namespace, key);
    assert.equal(typeof result, 'bigint');
    assert.equal(result.toString(), expected);
  }
});

test('advisory key inputs must both be strings, without coercion', () => {
  for (const value of [null, undefined, 0, 1n, [], {}]) {
    assert.throws(() => advisoryLockKey(value, 'key'), TypeError);
    assert.throws(() => advisoryLockKey('namespace', value), TypeError);
  }
});
