<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the exact bounded-retry, INITIAL_GRANT, advisory-lock and documentation-verification decisions with key responses.
-->

# Prompt archive — 018

## Exact user reply — permanent-failure delivery

```text
Use the existing bounded retry, then dead-letter
```

## Exact user reply — history and locking

```text
use INITIAL_GRANT. Use Postgres’s transaction-level advisory lock, pg_advisory_xact_lock taking a bigint, which releases automatically at commit or rollback. Verify the function in the Postgres 17 docs
```

## Key assistant response (verbatim)

I’ll use bounded retry followed by dead-lettering, and `INITIAL_GRANT` for the history row. I’ll verify `pg_advisory_xact_lock(bigint)` in the PostgreSQL 17 docs, then implement the grant transaction and database tests.

## Remaining encoding question (verbatim)

The PostgreSQL 17 docs confirm pg_advisory_xact_lock(bigint) and automatic release at transaction end. One encoding detail remains: how should each (namespace, string key)—for example the init retry key and the user-account key—be converted to its signed 64-bit bigint? Please give the exact namespace/key encoding and conversion so all operations use the same mapping.

## Documentation inspected

- [PostgreSQL 17 advisory-lock functions](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS):
  confirms the bigint overload for an exclusive transaction-level lock.
- [PostgreSQL 17 advisory-lock lifetime](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS):
  confirms release at transaction end and no explicit unlock for transaction locks.
- [node-postgres transactions](https://node-postgres.com/features/transactions):
  confirms using the same connection for a transaction's queries.

## Key implementation response

Implemented the initial-allocation slice of CreditService and SqlCreditRepository
and an INITIAL_GRANT migration. The service owns the READ COMMITTED transaction;
the repository receives its connection and never commits or rolls back.
The bigint encoder is a required constructor argument pending the human's exact
mapping. Integration tests use fixture-only numeric IDs, not a selected production
encoding. No fallback production mapping was invented.

Implemented the user.created callback and queue registration helper without
waiting for the publisher. The shared package is not installed/copied/merged;
registration accepts a connected shared client and externally supplied queue.
The application entrypoint is not yet connected to RabbitMQ.
