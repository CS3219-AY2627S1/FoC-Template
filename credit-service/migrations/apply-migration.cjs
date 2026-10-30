// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Generated a CLI to execute one explicit SQL migration using the human-selected pg driver.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: [HUMAN-REVIEWED]
// Prompts and key responses: ../ai/usage-log.md, entries 005–024 (prior scopes retained).
// Entry 034: OpenAI Codex (GPT-6), 2026-10-22 (Asia/Singapore).
// Scope: Relocated the human-selected migration runner and updated references while making scripts/docs local-only.
// Changes await human review; prompts/key responses: credit-service/ai/usage-log.md, entry 034 (repository-relative).

const { readFile } = require('node:fs/promises');
const { extname, resolve, basename } = require('node:path');
const { Client } = require('pg');

async function main() {
  const filename = process.argv[2];
  if (process.argv.length !== 3 || extname(filename || '') !== '.sql') {
    throw new Error('Usage: npm run db:migrate -- <migration.sql>');
  }
  if (!process.env.PGDATABASE) {
    throw new Error('Set PGDATABASE explicitly before applying a migration.');
  }

  const sql = await readFile(resolve(filename), 'utf8');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Migration and rollback failed.');
      }
      throw error;
    }
    console.log('Applied migration: ' + basename(filename));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
