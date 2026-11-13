<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
Scope: Archived the exact tracked-runner stop-point request and actual outcomes.
-->

# Prompt archive — 048

## Exact user prompt

```text
instead of apply-migrations, let's use run-migrations instead. so let's update db:migrate, and give run-migrations a stop point, for example `node migrations/run-migrations.cjs --to 001_initial.sql`, which applies pending files up to and including that one, update tests, delete apply-migrations
```

## Key responses and outcomes

- db:migrate now uses migrations/run-migrations.cjs; deleted the old
  migrations/apply-migration.cjs. Optional --to uses an exact filename and bounds
  sorted pending files inclusively. No argument applies all pending files.
- Existing successful-file skipping, ledger/latest attempts, lock, per-file
  transactions and stop-on-failure behavior remain. Invalid arguments/unknown
  targets fail before connecting. Earlier files resume normally; already-applied
  later files are not undone.
- Updated CLI/schema tests for prefix checkpoints, tracking, rollback/repair,
  replay/no-op and concurrent runners. Tests invoke both Node and npm commands.
- Targeted migration/schema checks passed 12 results, then the full Credit suite
  passed all 110; Credit lint passed. README and approved JSON attribution updated.
- Only isolated test schemas were migrated. No application database/container,
  dependency/lockfile, SQL migration, commit or push changed. Human review pending.
