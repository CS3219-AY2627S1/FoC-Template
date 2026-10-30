<!--
AI Assistance Disclosure: Claude Code (Opus 5.5), 2026-10-23 (Asia/Singapore).
Scope: Archived the key migration-runner prompts and responses.
Review: Human reviewed: specified the design, read through the code line by line,
and ran manual tests. Prompts/key responses: ../usage-log.md, entry 046.
-->

# Prompt archive — 046

## Exact user prompts (key prompts only)

```text
can you generate a migration file to  migrate all the migration scripts in order, and then use a table in the db, table shud have the migration number / or the file name of the migration scirpt, when it is applied, and whether it is applied successfully or not to keep track of the migration files applied, using a pg_lock to prevent two migrations from applying at the same time? The migration should be transactional and atomic making sure no partial migrations are applied
```

```text
per file, stop immediately (don't attempt other files), one row per file and keep latest status, updated on entry, 4 your examples
```

## Key responses and outcomes

- The AI asked the human to resolve ambiguities in the specification (transaction
  scope, failure behaviour, row model, names). The human chose per-file
  transactions, stop on first failure, one row per file with the latest status,
  and accepted the AI-offered example names `credit_migrations` and
  `migrations/run-migrations.cjs`.
- Implemented migrations/run-migrations.cjs to that specification.
- No run or test was performed by the AI. Reviewed by the human.
