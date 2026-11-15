// AI assistance: OpenAI Codex, 2026-11-09. Scope: approved GitHub change planning/gating. Review: Reviewed and approved by @ron on 2026-11-09.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { JOBS, selectJobs, checkResults } from './policy.mjs';

if (process.argv[2] === 'plan') {
  let selected = [...JOBS];
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const { base, head } = event.pull_request;
    if (![base.sha, head.sha].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Invalid pull-request commit');
    // No rename detection: both old and new paths must influence selection.
    const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base.sha}...${head.sha}`], { maxBuffer: 16 * 1024 * 1024 })
      .toString().split('\0').filter(Boolean);
    selected = selectJobs(paths);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, [
    ...JOBS.map(job => `${job}=${selected.includes(job)}`),
    `plan=${JSON.stringify(selected)}`, '',
  ].join('\n'));
  console.log(`Selected CI jobs: ${JSON.stringify(selected)}`);
} else if (process.argv[2] === 'gate') {
  const errors = checkResults(JSON.parse(process.env.PLAN_JSON), JSON.parse(process.env.NEEDS_JSON));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('All selected CI jobs passed; unaffected skips accepted.');
} else throw new Error('Usage: node scripts/ci/run.mjs plan|gate');
