<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-26 (Asia/Singapore).
Scope: Archived the exact idempotency refactor request and actual outcomes.
-->

# Prompt archive — 045

## Exact user prompt

```text
let's remove user_id and created_at from idempotency_record, and from our tests, so we need to refactor that
```

## Key responses and outcomes

- Added migration 010 to remove user_id/created_at from idempotency_records;
  preserved existing migrations and remaining columns/composite primary key.
- Removed the idempotency user field from the domain, SQL reads/writes and
  CreditService saved records. Tests use operation/key instead of user metadata.
- Refactored allocation/listener fixtures and failure injection, schema checks,
  and populated upgrade/replay regression. Only pre-migration legacy fixtures
  supply the old user column to verify migration from the actual old schema.
- Credit build, all 103 Credit checks and seven live-listener results passed.
  Existing seeded ledger checks found no genuine violation or deadlock. Tests
  cleaned their schemas and disposable broker. Documentation/disclosure updated.
- Migration 010 is not applied to the running local database; no application
  container replacement, dependency change, commit or push. Human review pending.
