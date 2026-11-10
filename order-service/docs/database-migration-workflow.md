# Order Service Database Migration Workflow

## V20 handoff — durable report-creation fencing (CHANGE-184, 2026-11-10)

`V20__report_creation_compensation.sql` additively creates
`order_report_creation_lifecycles` and `order_report_creation_compensations`.
The lifecycle is keyed by the Reporting-allocated report ID, uniquely binds the
browser submission ID/order/reporter, records ACTIVE or permanent CANCELLED, and
retains whether a hold was ever created. The compensation table deduplicates the
deterministic request and its durable result. Existing orders, holds, resolution
journals and V1–V19 are unchanged; no legacy hold is guessed or backfilled.

Normal matching Order startup applies V20 before Hibernate validation. Deploy
this lifecycle fencing before enabling Reporting's creation flow. Clean and
V19→V20 migration tests plus lifecycle/hold race integration tests require real
PostgreSQL via Testcontainers. Rollback disables both creation flags but preserves
all tombstones, deduplication rows, holds and outboxes; use a reviewed forward
correction rather than dropping these audit/fencing tables or editing V20.

## V19 handoff - courier bad-attitude policy (CHANGE-170, 2026-11-01)

V19__allow_courier_bad_attitude_penalty.sql extends the two deferred-penalty CHECK constraints on orders and order_courier_attempts to allow COURIER_BAD_ATTITUDE. It preserves old policy values, null/audit invariants, all rows and immutable V1-V18. Real PostgreSQL first reproduced the V18 rejection, then verified new policy persistence, completion and attempt archival with V19. Existing clean and older-schema upgrade preservation checks pass with latest version 19. Normal Flyway startup applies this migration before Hibernate validation; no cloud or user application database was manually changed. Deploy the matching Order/common binary before using the new policy.

## V18 handoff — Report resolution saga (CHANGE-162, 2026-10-29)

Additive V18__report_resolution_saga.sql creates independent order_report_resolutions journal and order_report_resolution_results inbox, including report/order foreign keys, one active command per report, generation/state checks and a SQL due-work index. Existing V1–V17 remain immutable; no placement snapshots, Report records or guessed outcomes are backfilled. Existing outbox schema is reused. Feature remains default-disabled.

Normal Flyway startup migrates before Hibernate validation; clean schema18 and17→18 upgrade are verified with disposable PostgreSQL. Prior holds/commands remain intact. No application/cloud DB was migrated in this task. Preserve journal/inbox/outbox/hold records on rollback. Disabling transport is not recovery; pending work blocks direct hold release. Do not deploy an older binary without these release guards while unresolved work exists. Resolve/reconcile before removal or use a forward corrective migration, never drop audit tables or edit applied migrations. Report protocol and activation gates: [handoff](report-servicehandoff.md).

## V11 handoff — saved admin explanation

V11__admin_resolution_reason.sql adds nullable orders.admin_resolution_reason varchar(1000). Old rows remain null; V1–V10 unchanged, no guessed backfill or table rewrite. Code reads/writes the field only through explicit admin resolution. Startup Flyway migrates before Hibernate validate. Required verification: root PowerShell .\mvnw.cmd -B -ntp -pl order-service -am verify; expected schema11. Rebuild both Order and frontend images for rollout. No manual schema edits or ddl-auto update.

AdminResolutionReasonMigrationTest verifies clean11 and upgrade10->11, column length/nullability and preservation of existing Order state/version. AdminCompletionJpaIntegrationTest verifies persisted reason and rollback with receipt/outbox. Local foc-order-postgres-1 was backed up to ignored order-service/target/change138-before-v11.dump before startup migrated10->11; no volume reset. Do not roll back by dropping the column or edit an applied migration. The prior image can ignore this additive nullable column; use the backup only for a deliberate full recovery if needed. Cloud migration follows normal deployment startup, not performed here.


## Current handoff — V10 / CHANGE-135

V10__persist_delivery_timing_and_admin_decisions.sql adds nullable orders timing
and admin decision fields plus a partial auto-completion index. Expected schema10.
START + duration is the delivery deadline; only current-attempt/current-courier
checkpoint evidence is backfilled. Missing start evidence remains null and needs
reviewed timing reconciliation before completion; no guessed acceptance fallback.
Existing statuses, versions, holds and event payloads/IDs remain. Admin historical
decisions stay unknown; cancellation time is backfilled from ADMIN_CANCEL receipts.
Back up, pull matching source, rebuild/start Order normally; Flyway applies V10.
Do not edit V1–V9, reset volumes, or use ORM auto-update. Forward correction or a
reviewed backup recovery only. Clean/V9 upgrade tests2/2 pass. Local Compose Order
DB upgraded9 ->10 after backup; all7 Orders/statuses/versions preserved,3 timings
backfilled. Only Order PostgreSQL was started; rebuild matching Order image before
use. Tests/local application evidence: CHANGE-135. Peer/cloud consumption pending.


## Historical handoff - V9 / CHANGE-127

V9__order_completion_holds.sql adds default-false orders.completion_hold and
per-report order_completion_holds (immutable report ID, Order FK, requester,
placed time). Expected schema9. Existing V1..V8 unchanged. Clean/upgrade PG tests
pass. Local dedicated Order database migrated8 ->9, seven Orders preserved,
zero held; application images not rebuilt. Matching Order startup applies Flyway
normally. Release not implemented. Preserve hold records, disable placement for
rollback and use reviewed forward corrections; old revisions ignore this flag.

Historical V8 handoff follows; its pending Docker status is superseded locally.

Latest approved handoff: V8__durable_manual_repost.sql. Add nullable candidate_order_id
and REPOST kind; preserve prior commands/IDs and pending-target index. Expected
schema8. Normal matching Order startup applies Flyway; six clean/upgrade PG tests
pass, including V7 preservation/constraints. Source2c021b6. Consuming local rollout
blocked by Docker engine500; human review pending. No reset/rollback; disable workers,
retain unresolved evidence, reviewed forward correction if necessary.

## Latest migration handoff — V5 / CHANGE-100

V5__durable_foreground_commands.sql adds only Order-owned `order_commands`,
immutable input/result JSON, owner/lease/generation/retry metadata and the
unique unresolved-target/due/owner indexes. Expected Flyway version: **5**.
Pull matching source+migration and rebuild/start Order normally; Flyway applies
it. Clean and V1/V3-to-latest PostgreSQL upgrade tests verify prior data and
V4 legacy-plan rules survive. Never edit applied V1–V4 or use ORM auto-update.
Recovery is disable workers, preserve unresolved records and reconcile; no
destructive rollback or deletion of pending financial evidence. Full handoff:
[concurrency-order-credit.md](../concurrency/concurrency-order-credit.md).
Historical V4 commands below are superseded only as the latest version pointer.

## Latest migration handoff — V4 / CHANGE-086

- Purpose: NTH4 explicit automatic expiry and latest safe failure code/message/time.
- File: `src/main/resources/db/migration/V4__explicit_repost_expiry_and_latest_failure.sql`.
- Expected schema version: 4, applied by Flyway on matching Order startup after
  rebuild. No manual schema command, volume reset or rewriting V1-V3.
- Objects: four nullable orders columns and enabled-plan timing constraint.
  Vincent explicitly chose disabling legacy enabled plans without expiry;
  old due/credit/duration/used fields, order status/IDs/history/outbox survive.
- Verification: isolated PostgreSQL clean/latest, V1-to-latest and V3-to-V4
  tests; legacy disabled with null expiry, valid equality due=original expiry,
  invalid absent/equal new expiry rejected. Persistence rollback/overwrite/
  success-clear/automatic saved-expiry tests; exact run results CHANGE-086.
- Consuming developer: pull migration+matching source, back up non-disposable
  DB first, rebuild Order image and confirm Flyway version 4. Legacy plans
  cannot be re-enabled halfway through creation-only settings.
- Recovery: no destructive down migration. Restore reviewed pre-upgrade backup
  or deploy a reviewed forward correction. Do not guess a deadline to undo the
  user's legacy-disable decision. Real application volumes were not touched.


## Purpose

This workflow keeps independent local Order Service databases at the same approved schema version. A developer's local database is disposable working state; the versioned migration history in Git is the shared source of truth.

This document applies to every schema-affecting change, including tables, columns, indexes, constraints, identifiers, timestamps, version fields, relationships, persistence mappings that require a schema change, and approved seed/reference data.

## Status and technology boundary

### CHANGE-105 / ADR-036 handoff (2026-10-11)

- Migration IDs: V6__retained_failed_outbox.sql and V7__bind_command_receipts.sql.
- Purpose: retained exhausted publication and secure immutable receipt replay.
- Objects: outbox state CHECK/FAILED index; receipt actor_id/input_fingerprint.
- Required command: rebuild/start the matching Order image via root Compose; its
  Flyway startup migration applies versioned files. Expected schema version: 7.
- Clean/upgrade verification: OrderOutboxMigrationTest covers clean, V1/V3 and
  V5-to-V7 with retained payload and intentionally unbound historical receipts;
  OrderOutboxJpaIntegrationTest covers FAILED/redrive persistence. Exact results
  are CHANGE-105. Existing local application database upgraded V4->V7 without reset.
- Historical receipts stay null-bound and fail closed on attempted replay. No
  existing event ID/payload or business order ID is rewritten by these migrations.
- Back up before cloud rollout; deploy matching app/schema together. No destructive
  down migration. Restore a reviewed backup or add a forward corrective migration;
  do not rewrite V1-V7 or delete FAILED evidence to downgrade. Peer consuming
  developer still needs to apply/review the same files; no cloud rollout performed.

- This is a workflow rule; ADR-008 approves PostgreSQL on Cloud SQL for Order Service.
- The parent Firestore convention remains applicable to sibling services and does not replace the Order Service decision.
- Flyway was approved in CHANGE-017; the configured migration directory is `src/main/resources/db/migration/`. Do not introduce a second migration format.
- CHANGE-082 / ADR-025 adds V3: internal `orders.row_id` UUID PK, unique business `orders.id`, immutable `order_courier_attempts` snapshots and repeatable checkpoints. Existing business references/FKs/outbox payloads remain unchanged. Clean PostgreSQL and V2-to-V3 upgrade tests passed; existing application volumes were not reset.
- Back up before production upgrade and deploy matching application/schema together. V3 normalizes legacy current ABORTED rows to EXPIRED and backfills recoverable courier attempts; past unexpired aborts without checkpoints cannot be recreated. There is no destructive automatic down migration. Restore the pre-upgrade backup or create a reviewed forward correction; do not drop new history or rewrite V1/V2 to roll back.

## Non-negotiable rules

1. Every shared schema change must include a new, versioned migration file in the same change set as the code that requires it.
2. A migration must describe the purpose, affected requirement/feature, assumptions, and verification evidence in the related change record or handoff.
3. Never treat a manual SQL command, IDE database edit, `ddl-auto=update`, generated ORM schema, or an uncommitted local database as the shared schema source of truth.
4. Never edit or delete a migration that another developer or environment may already have applied. Add a new corrective migration instead.
5. Migration identifiers must be unique, ordered, deterministic, and coordinated when developers work in parallel.
6. Migrations must be safe to apply to a clean local database and to an existing database at the immediately preceding version. Destructive or data-changing operations require explicit review, backup/recovery analysis, and approval.
7. Migration files must not contain credentials, secrets, machine-specific paths, or private data.
8. A migration synchronizes schema. It does not imply that ordinary local application data is identical. Seed/reference data is shared only when explicitly represented by a reviewed migration or fixture.

## Developer workflow

For a schema-affecting feature:

1. Identify the requirement, feature, affected aggregate, and database ownership.
2. Confirm the change with the developer who owns the shared persistence foundation. For Sprint 1, coordinate with the owner of the sequence 1-6 foundation before changing shared Order tables or mappings.
3. Create the next migration using the approved tool and directory. Do not invent a second migration format.
4. Apply the migration to the developer's own local database and verify the resulting schema/version.
5. Add or update persistence tests, fixtures, and rollback/recovery notes required by the approved design.
6. Commit the migration with the application/persistence change, or provide the migration in the handoff before the peer consumes the code.
7. Tell the other developer the migration identifier, purpose, required command, expected schema version, and verification result.
8. The peer applies the same migration history to their independent local database and reports any mismatch before continuing.
9. Run the focused persistence/integration tests and record the result in active work.

## Parallel-development and conflict rules

- One developer owns the initial shared schema foundation unless the allocation is explicitly changed and recorded.
- Two developers must not create competing definitions for the same table, field, constraint, or migration identifier.
- If both branches need schema changes, agree on migration ordering before either migration is merged. If ordering cannot be agreed, stop and report the conflict.
- A peer's local database contents are not a dependency. The peer needs the committed migration history, configuration contract, and reproducible fixtures.
- Do not resolve a migration conflict by rewriting shared history or dropping another developer's local database without agreement.

## Verification and handoff minimum

Every migration handoff must state:

```text
Migration ID:
Purpose:
Related requirement/feature:
Affected schema objects:
Required tool/command:
Expected schema version:
Clean-database result:
Upgrade-from-previous-version result:
Persistence/integration tests:
Rollback or recovery considerations:
Known data differences:
```

A database-backed feature cannot be marked complete when its schema change exists only in a local database, is missing from Git, has not been applied by the consuming developer, or has not been verified against the approved contract.

## Cloud and environment boundary

Cloud infrastructure provisioning and application schema migration are separate concerns. `bootstrap.sh` may provision an approved database instance/database and IAM resources; it must not silently replace the application's versioned migration process. The same reviewed migration history must be applied and verified for staging and production through an approved deployment process.


CHANGE-141: V12 adds orders.delivery_overdue, overdue_penalty_waived and waiver actor/time/reason; order_completion_holds.released_at/released_by with paired audit constraint and active order_id partial index. Known delivered_at/deadline rows backfill, unknown stays null; no lifecycle/version/history/outbox rewrite. Use clean and V11-upgrade PostgreSQL tests before local backup/apply. Rollback application requires compatibility review: do not remove columns or released hold history; prefer forward fix.


CHANGE-144 adds forward-only V13__courier_penalty_outcomes_and_adjustments.sql: nullable orders.courier_assignment_id, indexed order_penalty_outcomes and pending/confirmed order_penalty_adjustments, one pending request per attempt, unique revision/request identity. No legacy score backfill. Clean and V12 upgrade tests required; preserve V1-V12 and existing historical waiver columns.


Current CHANGE-146 handoff: forward-only V14__deferred_courier_penalty.sql adds nullable policy/audit fields to orders and order_courier_attempts, with policy/audit consistency checks. Derived amount is not separately persisted. No terminal-history backfill or adjustment-table drop. V1-V13 remain immutable. Old replacement records require operator review if previously enabled; no automatic score changes. Normal startup applies V14; existing database not migrated by this coding task. Clean/V13 upgrade verification required.

## CHANGE-156 / V15 compensation-journal handoff

V15__compensation_first_command_journal.sql adds per-command recovery policy,
Credit step/final stage state, recovery deadline and compensation identity; all
existing commands remain RETRY. It adds an idempotent result inbox and a distinct
command FK for compensation outboxes before an Order exists. The existing Order
FK remains mandatory for lifecycle events via an aggregate-reference check.
No balance/ledger copy, existing migration edit, destructive table drop or old
command conversion. Entity mapping permits the new command-owned null order_id.

Expected Flyway version15. Apply through normal startup against the selected
local PostgreSQL database; never ddl-auto=update. Before deployment, run clean
V1->V15 and preserved-data V14->V15 verification, then
OrderCompensationPostgresIntegrationTest (root reactor, Docker required). Local
test/runtime evidence and unverified gates belong to CHANGE-156. This task does
not migrate a user/staging/production database. Rollback disables new commands,
retains all journal/inbox/outbox records and reconciles pending compensation;
never drop tombstones or restore old code that reinterprets new-policy keys.


CHANGE-185: V21__courier_penalty_sequences.sql adds transactional per-courier counters and immutable event-to-sequence bindings, with no legacy backfill. Expected latest Flyway version21. Apply through normal startup only after coordinated v1 drain; keep schema/history on rollback. See penalty-event-cutover.md and ADR-069.
