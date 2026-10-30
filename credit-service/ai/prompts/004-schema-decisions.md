<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's schema clarification answers verbatim and key assistant responses.
-->

# Prompt archive — 004

Received 2026-10-20 (Asia/Singapore), as answers to the two questions recorded
in [exchange 003](003-requirements-and-setup.md). The following answers are
human-supplied schema decisions, not AI-generated design.

## Exact answer — final table list

```text
the exact list should be credit_accounts, reservations, credit_history, archived_balances and idempotency_records but archival logic has not been implemented by User Service yet.
```

## Exact answer — schema and persistence

```text
accounts (user_id is uuid PK and text, total_credits and reserved_credits are integers not null, created_at and updated_at are timestamps, and checks are: total ≥ 0, reserved ≥ 0, and reserved ≤ total, available balance is never stored, only computed, 10 credits are allocated at user registration time), reservations (reservation_ID is uuid PK, order_id is uuid not null, requester_id is FK, courier_id is FK, credit_amount is integer, status is text, version is integer, created_at and updated_at are timestamps), history (id is uuid PK, user_id is fk, order_id is FK, reservation_id is FK, type is text, created_at is timestamp), idempotency_records (operation_type is text PK, idempotency_key is text PK, user_id is text but not FK so this table js has a logical relationship with accounts, request_hash is text not null, result is jsonb, created_at is timestampz), archived_balances don't implement yet because user service has not implemented archival yet

idempotency scope: a key is unique per operation type, the caller generates one key per logical action, preferably a UUID, and reuses it on every retry
flow: inside the same transaction as the credit change, insert the record
if it was inserted, do the work, store the result and commit
if it already existed, compare request_hash, a match returns the stored response, and a mismatch is rejected as key reuse
failed operations roll back, so no record exists and a retry runs again


for persistence/migration: let's go with pg with sql migrations
```

## Key assistant response (verbatim)

I’ll record the confirmed names, the `pg`/SQL migration choice, and the idempotency flow. I’ll leave `archived_balances` unimplemented as you requested. A few column and foreign-key details still need clarification before I can write the migration.

## Assistant clarification questions (verbatim)

1. For credit_accounts.user_id, you wrote both “uuid PK” and “text”: which SQL type is final? Please also give the exact referenced table/column and SQL type for each FK: reservations.requester_id/courier_id and credit_history.user_id/order_id/reservation_id. There is no orders table in the credit database currently; is credit_history.order_id intended as a logical reference instead?
2. Please finish the remaining column rules: which columns are NOT NULL; any defaults (including UUIDs, timestamps, balances and version); timestamp WITH or WITHOUT time zone; and any additional unique/check/delete rules. Should credit_history retain the amount attribute from your earlier class and F8.2.3? If so, specify its SQL type. For text status/type fields, confirm whether values are unrestricted for this first migration or provide the allowed values.
3. Adding pg requires editing package.json and package-lock.json, which cannot contain comments. May I record their attribution in credit-service/README.md and the usage log instead? Your original rules require file-header comments, so this format exception needs your decision.
