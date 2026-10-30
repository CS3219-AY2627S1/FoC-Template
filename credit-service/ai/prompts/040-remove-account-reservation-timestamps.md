<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the exact timestamp-removal prompt and implementation/check outcomes.
-->

# Prompt archive — 040

## Exact user prompt

```text
i also want to remove the fields createdAt and updatedAt from accounts and reservations table, i don't think they are necessary even if we implement user archival and deletion
```

## Key responses and outcomes

- Implemented removal of SQL created_at/updated_at from credit_accounts and
  reservations in new migration 009; previous migrations preserved.
- Removed account domain dates and repository date reads/writes. Reservation
  domain/public replies already omit dates. History and idempotency timestamps
  remain; no new archival/deletion design or decision rationale was generated.
- Updated the allocation fixture and added an isolated upgrade test verifying
  existing row preservation, exact column removal, reads/new allocations,
  reserve/update/release/settle and saved replay with the shared ledger oracle.
- Credit build and all 103 Credit tests passed, including all four seeded
  concurrency scenarios. No genuine ledger violation or deadlock found. The new
  integration test skips without PGDATABASE. READMEs and disclosure updated.
- Migration 009 has not been applied to the running local database; apply it
  alongside the updated service build. Isolated schemas were cleaned up.
- Human review remains pending. No commit, push or running-service replacement.
