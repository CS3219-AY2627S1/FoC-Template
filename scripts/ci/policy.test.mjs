// AI assistance: OpenAI Codex, 2026-11-09. Scope: approved CI selection/gate checks. Review: Reviewed and approved by @ron on 2026-11-09.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOBS, selectJobs, checkResults } from './policy.mjs';

test('a User change selects User checks and the integrations using User', () => {
  assert.deepEqual(selectJobs(['user-service/src/auth.ts']), [
    'user_build', 'supplier_integration', 'supplier_ui_e2e',
    'user_messaging', 'order_credit_integration',
  ]);
});

test('frontend changes run frontend checks and browser journeys', () => {
  assert.deepEqual(selectJobs(['frontend/src/App.tsx']), ['frontend_quality', 'supplier_ui_e2e']);
});

test('Credit changes include the integrations consuming Credit outcomes', () => {
  assert.deepEqual(selectJobs(['credit-service/src/messages.ts']), [
    'credit_quality', 'supplier_ui_e2e', 'credit_messaging', 'user_messaging', 'order_credit_integration',
  ]);
});

test('Order changes include its messaging checks and the Order browser dependency', () => {
  assert.deepEqual(selectJobs(['order-service/src/config.ts']), [
    'order_quality', 'supplier_ui_e2e', 'order_messaging', 'order_credit_integration',
  ]);
});

test('Supplier changes exercise catalogue and actual Order supplier lookup', () => {
  assert.deepEqual(selectJobs(['supplier-service/drizzle/0001.sql']), [
    'supplier_quality', 'supplier_integration', 'supplier_ui_e2e', 'order_credit_integration',
  ]);
});

test('ordinary documentation runs no application jobs', () => {
  assert.deepEqual(selectJobs(['README.md', 'docs/research/note.md', 'ai/usage-log.md', 'user-service/README.md']), []);
});

test('shared configuration, CI policy, and unknown paths conservatively select everything', () => {
  for (const path of ['compose.yaml', 'kafka/create-topics.sh', '.github/workflows/pr-ci.yml', 'scripts/ci/run.mjs', 'new-shared-code.ts', 'docs/check.sh', 'ai/tool.mjs']) {
    assert.deepEqual(selectJobs([path]), JOBS, path);
  }
});

test('multiple services and both sides of a rename select the union', () => {
  assert.deepEqual(selectJobs(['frontend/old.ts', 'order-service/new.ts']), [
    'frontend_quality', 'order_quality', 'supplier_ui_e2e', 'order_messaging', 'order_credit_integration',
  ]);
});

const results = selected => Object.fromEntries([
  ['changes', { result: 'success' }],
  ...JOBS.map(job => [job, { result: selected.includes(job) ? 'success' : 'skipped' }]),
]);

test('gate accepts only successful selected jobs with deliberate unaffected skips', () => {
  const selected = selectJobs(['user-service/src/auth.ts']);
  assert.deepEqual(checkResults(selected, results(selected)), []);
  assert.deepEqual(checkResults([], results([])), []);
  assert.deepEqual(checkResults(JOBS, results(JOBS)), []);
});

test('gate rejects failed, cancelled, skipped, or missing selected jobs', () => {
  for (const job of JOBS) for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
    const needs = results(JOBS);
    needs[job] = { result };
    assert.ok(checkResults(JOBS, needs).length > 0, `${job}: ${result}`);
  }
});

test('gate rejects a failed selector, malformed plans, missing jobs, and unexpected failures', () => {
  assert.ok(checkResults([], { ...results([]), changes: { result: 'failure' } }).length);
  assert.throws(() => checkResults(['unknown_job'], results([])));
  assert.throws(() => checkResults(null, results([])));
  const needs = results([]);
  delete needs.user_build;
  assert.ok(checkResults([], needs).length);
  assert.ok(checkResults([], { ...results([]), user_build: { result: 'failure' } }).length);
});
