// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Loaded the shared scoped SQL oracle and asserted empty violation rows.
// Author review: Reviewed and ensured that functions are used as specified across the tests.
// Prompts/key responses: ../../ai/usage-log.md, entry 039.

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const sql = readFileSync(join(__dirname, '../sql/ledger-violations.sql'), 'utf8');

async function findLedgerViolations(client, { userIds, reservationIds }) {
  return (await client.query(sql, [userIds, reservationIds])).rows;
}

async function assertLedgerInvariants(client, scope, context) {
  const violations = await findLedgerViolations(client, scope);
  assert.deepEqual(violations, [], `${context}: ledger invariant violation`);
}

module.exports = { findLedgerViolations, assertLedgerInvariants };
