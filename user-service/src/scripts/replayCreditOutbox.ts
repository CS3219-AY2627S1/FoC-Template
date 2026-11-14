// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-10-21
// Scope: Generated the credit-allocation outbox replay script (Stage 14e). No requirements,
//        architecture, schema, or API decisions were made by the AI tool — see
//        instructions.md Stage 14 for the governing decision.
// Author review:

import pool from '../db/pool.js';
import { replayDeadCreditAllocations } from '../db/queries/creditOutbox.queries.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function printUsage(): void {
  console.error('Usage:');
  console.error('  npm run outbox:replay -- <outbox-id> [<outbox-id> ...]');
  console.error('  npm run outbox:replay -- --all-dead');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (args.length === 1 && args[0] === '--all-dead') {
    const resetIds = await replayDeadCreditAllocations(null);
    console.log(`Reset ${resetIds.length} dead row(s):`);
    for (const id of resetIds) console.log(`  ${id}`);
    return;
  }

  if (args.some((arg) => !UUID_REGEX.test(arg))) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const resetIds = await replayDeadCreditAllocations(args);
  const resetSet = new Set(resetIds);
  const notReset = args.filter((id) => !resetSet.has(id));

  console.log(`Reset ${resetIds.length} row(s):`);
  for (const id of resetIds) console.log(`  ${id}`);

  if (notReset.length > 0) {
    console.log(`Not reset (not found, or not dead) - ${notReset.length} row(s):`);
    for (const id of notReset) console.log(`  ${id}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
