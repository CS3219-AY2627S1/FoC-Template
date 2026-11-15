// AI assistance: OpenAI Codex, 2026-11-09. Scope: real-git change planning and CLI gate regression checks. Review: Reviewed and approved by @ron on 2026-11-09.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JOBS } from './policy.mjs';
const cli = fileURLToPath(new URL('./run.mjs', import.meta.url));

test('PR planning uses both deleted and added paths from a real git rename', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foc-ci-plan-'));
  const git = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git(['init', '-q']);
    mkdirSync(join(dir, 'frontend')); mkdirSync(join(dir, 'order-service'));
    writeFileSync(join(dir, 'frontend/example.txt'), 'a fixture\n');
    git(['add', '.']); git(['-c', 'user.name=CI Test', '-c', 'user.email=ci@example.test', 'commit', '-qm', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    renameSync(join(dir, 'frontend/example.txt'), join(dir, 'order-service/example.txt'));
    git(['add', '-A']); git(['-c', 'user.name=CI Test', '-c', 'user.email=ci@example.test', 'commit', '-qm', 'rename']);
    writeFileSync(join(dir, 'event.json'), JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: git(['rev-parse', 'HEAD']) } } }));
    const output = join(dir, 'output');
    execFileSync(process.execPath, [cli, 'plan'], { cwd: dir, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(dir, 'event.json'), GITHUB_OUTPUT: output } });
    const lines = readFileSync(output, 'utf8');
    assert.match(lines, /frontend_quality=true/); assert.match(lines, /order_quality=true/);
    assert.match(lines, /user_build=false/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('manual/main runs select everything, while invalid PR metadata fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foc-ci-manual-'));
  try {
    const output = join(dir, 'output');
    execFileSync(process.execPath, [cli, 'plan'], { env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_OUTPUT: output } });
    const plan = JSON.parse(readFileSync(output, 'utf8').split('\n').find(line => line.startsWith('plan=')).slice(5));
    assert.deepEqual(plan, JOBS);
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ pull_request: { base: { sha: '--help' }, head: { sha: 'bad' } } }));
    const result = spawnSync(process.execPath, [cli, 'plan'], { env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(dir, 'bad.json'), GITHUB_OUTPUT: output } });
    assert.notEqual(result.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gate CLI accepts deliberate skips and rejects selected skips or malformed plans', () => {
  const needs = Object.fromEntries([['changes', { result: 'success' }], ...JOBS.map(job => [job, { result: 'skipped' }])]);
  const run = plan => spawnSync(process.execPath, [cli, 'gate'], { env: { ...process.env, PLAN_JSON: plan, NEEDS_JSON: JSON.stringify(needs) } });
  assert.equal(run('[]').status, 0);
  assert.notEqual(run('["user_build"]').status, 0);
  assert.notEqual(run('not-json').status, 0);
});
