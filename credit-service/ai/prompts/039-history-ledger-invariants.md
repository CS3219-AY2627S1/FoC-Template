<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the exact human-defined schema/invariant/randomized-test request and actual results.
-->

# Prompt archive — 039

## Exact user prompt

```text
i want to enforce some more database changes

to match F8.2.3 let's enforce a CHECK requiring order_id and reservation_id for every history row type except INITIAL_GRANT, and forbidding them for INITIAL_GRANT, would enforce it, and update our tests accordingly

let's also add a partial unique index on history (reservation_id, type) for RESERVED, RELEASED, TRANSFER_OUT and TRANSFER_IN to back up F8.5.2 and F8.8.1

let's add tests, using shared SQL queries that return violating rows (empty = pass), scoped to the scenario's own accounts and reservations (its own test file and schema):
per-reservation: every history row's `order_id` equals the reservation's; `user_id` equals the requester for RESERVED, RESERVATION_UPDATED, RELEASED and TRANSFER_OUT, and the courier for TRANSFER_IN; RESERVED plus RESERVATION_UPDATED reserved changes sum to `credit_amount`; `version` = 1 + the number of RESERVATION_UPDATED, RELEASED and TRANSFER_OUT rows (confirm against the code).

status to history: every SETTLED reservation has exactly one TRANSFER_OUT (−amount, −amount) and one TRANSFER_IN (+amount, 0); every RELEASED one has exactly one RELEASED row (0, −amount); a RESERVED one has no RELEASED or TRANSFER rows; no reservation has more than one terminal row set.

per-account: `reserved_credits` equals the sum of its RESERVED reservations' amounts; `total_credits` and `reserved_credits` equal the sums of its history changes; across the scenario's accounts, total credits equal 10 × the number of accounts.

randomised scenario: accounts created through `initCredits`; many parallel reserves, updates, releases and settles (including repeated requests and same-order contention) over a few accounts, repeated several times, with all checks run after each round once every operation has finished. Use a seeded PRNG and print the seed on failure. Treat unexpected errors and deadlocks (40P01) as failures but allow business errors. Keep parallelism within the pool size, and skip without PGDATABASE like the other integration tests.

If any check finds a genuine violation, stop and report it rather than weakening the check or the scenario.


```

## Key responses

> I’ll add a new migration for the history link and uniqueness constraints, confirm the version rule against the code, and build the shared invariant queries and seeded concurrency test. If a query finds a genuine violation, I’ll stop and report it.

> The code matches your version formula: creation starts at 1; a successful update, release or settlement adds 1; settlement writes one `TRANSFER_OUT` and one `TRANSFER_IN`, so only `TRANSFER_OUT` belongs in the version count. I’ll run the ledger checks in a new scenario test with its own schema, separate from the older tests’ deliberately fabricated fixtures.

> The migration and shared SQL oracle are written. The scenario checks ledger consistency after each settled round, with six workers for a six-connection pool. It includes same-order contention, repeated requests and opposing settlements, and treats unexpected errors—including `40P01`—as failures. The first run is underway; it will print the seed and stop on a violation.

> All 100 Credit tests pass. Every seeded round returned no ledger violations, and the oracle detected the deliberately corrupted test fixtures. No deadlocks or unexpected errors occurred. The migration tests also confirm that invalid legacy rows roll back the whole migration. I’ll now apply migration 008 to the local Credit database and finish the documentation.

## Outputs and actual checks

- New 008_history_links_and_uniqueness.sql enforces the requested null/non-null
  link combinations and partial uniqueness. Earlier migrations unchanged by this
  task; the pre-existing human edit to migration 001's review comment was retained.
- Shared SQL query and helper under test/sql and test/helpers return violation
  rows. New ledger scenario test owns its schemas/accounts/reservations, creates
  accounts through initCredits and verifies all requested relationships/statuses/
  balances/conservation/version rules. Explicit scope also detects missing expected
  accounts and excludes deliberately inconsistent unrelated fixtures.
- Deterministic duplicate/update/opposing-settlement/release paths precede each
  randomized scenario. Four seeds (12825, 587811, 1592594996, 3735928559), eight
  rounds of 48 requests, four accounts and max six workers/pool connections.
  Every round drains before SQL checks. Genuine violations/unexpected errors stop
  the scenario; business errors are allowed, 40P01 is never retried or accepted.
  CREDIT_INVARIANT_SEED reruns one random seed; concurrent winners may vary.
- Oracle self-tests deliberately corrupt fixtures, assert named violations and
  roll back; these are expected diagnostic fixtures, not genuine service failures.
- New migration regression tests cover legacy CHECK/index failure rollback,
  insert/update link combinations, uniqueness across users and repeated updates.
  Existing constraint/history fixtures now use proper links with migration 008.
- All six new test results passed initially, followed by all 100 Credit test
  results against isolated PostgreSQL schemas (zero failures/skips). An explicit
  no-PGDATABASE run skipped both new integration tests without connecting.
- No genuine service violation, unexpected error or deadlock occurred. Business
  code and invariant/scenario requirements were not weakened or changed.
- Migration 008 applied successfully to the local Credit database with the
  transactional CLI. Schema/test data cleaned up; no existing data repaired or
  deleted. Prior Docker/services kept. No new build/shared-suite/live-broker run
  was needed for this SQL/test-only change; older results remain historical.
- Service/root READMEs and required AI disclosures updated; local links/scoped
  whitespace checked. No new dependency, external source, skill, agent, commit,
  push or deployment. Human review pending; checks are agent-run verification.
