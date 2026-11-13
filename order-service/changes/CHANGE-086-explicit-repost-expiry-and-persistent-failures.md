# CHANGE-086: Explicit automatic expiry and persistent repost failures

- Date/approver: 2026-10-09 / Vincent, explicit implementation request.
- Status: implemented and locally verified; live integration gates open; Sprint remains [~].
- Related: NTH4, F1 creation validation, F8/F9 requester views, NFR2/NFR3,
  ADR-022/025/027/028; supersedes only CHANGE-085's missing-expiry/client-local outcome limitation.

## Approved scope and design

New creation-time automatic plans require explicit `repostExpiresAt`, strictly
after `repostDueAt`, with `repostDueAt >= original.expiresAt`. Reuse the existing
quarter-hour local UI picker (00/15/30/45); preserve ISO UTC API timestamps and
existing creation minimum of 30 minutes. Quarter-hour selection remains a UI
rule, not a new restriction on API timestamps or historical deadlines.
Automatic execution uses the saved new expiry and skips a plan once it is no
longer future; lateness alone is not a reason to skip. No post-creation editing.

Vincent explicitly chose to DISABLE legacy automatic plans without an explicit
expiry rather than invent/backfill one. V4 adds nullable expiry and latest failure
code/message/time columns to orders; it disables those legacy plans only, without
deleting orders/history/refunds. Original and successful repost business IDs stay
different; failed attempts keep the original EXPIRED and unlinked.

The latest verified eligible repost attempt's short safe failure is saved under
the original business ID and overwritten by a newer failure. Do not persist raw
peer errors/tokens. A separate REQUIRES_NEW failure recorder runs AFTER the failed
repost transaction rolls back; a locked guard skips already-linked/non-EXPIRED
orders and older results. This preserves rollback for the actual repost writes.
Unauthorized callers/state/version/pre-controller validation cannot write another
requester's failure. Success clears the original failure. UI reads the saved
message and refreshes the original after a failed foreground attempt.

No new peer route/topic/authentication, retry job, candidate-ID task or credential
mechanism. Existing automatic trigger attempts can record outcomes; background
retry implementation remains PAUSED in every mode. Polling remains reads only.

## Design refinement and alternatives

User-approved persistence/expiry extends Order-owned fields and additive DTOs.
REQUIRES_NEW after rollback is an internal transaction refinement. Browser-only
storage does not survive reload/another device; allowing the failed repost
transaction to commit risks partial business writes. Retain normal rollback and
save only the outcome afterward. A database outage can also prevent outcome
recording: log that separately and do not disguise the original failure.

Event schemas/topics remain unchanged: the new expiry/UI failure fields belong
to Order API/storage and are not needed by existing financial/penalty subscribers.

## Tests and completion evidence

- RED before production: RepostExpiryTest had 2 failures/1 missing-field error;
  frontend lacked the expiry picker and saved-message alert; isolated PostgreSQL
  outcome tests had 2 missing-field errors. These demonstrated missing behavior.
- Targeted 21 backend tests passed after implementation. Full initial regression
  had two latest-migration assertions still expecting V3; updated to V4 and added
  explicit V3-to-V4 legacy-disable/constraint cases, not lowered assertions.
- FINAL Java 21 wrapper verify explicitly selected all 45 current-source *Test
  classes with jacoco.append=false: **196 tests, zero failures/errors/skips**.
  Includes 16 isolated PostgreSQL tests across five suites; clean/V1/V3 upgrades,
  manual/automatic rollback and persisted overwrite/readback, exact automatic
  expiry/late boundary, success clear, authorization guard and outbox/history.
- Fresh coverage: **1359/1427 lines = 95.23%; 445/533 branches = 83.49%**.
  Existing >=80% thresholds unchanged. Unit transaction callbacks and safe
  Supplier error classification are covered. OpenAPI documentation test passed.
- Frontend: **49 tests / 15 files**, lint zero errors/12 existing login/profile
  warnings, standalone typecheck and production build passed. Existing external
  home package-lock warning retained; no peer UI/source cleanup made.
- generic verify_gate.py still FAILS five pre-existing record-shape/history
  blockers; check_source_drift.py rejects manifest columns. Neither is reported
  as passed. Independently checked D1/selected overall hashes match authority.
- Real provider ledger/consumers, authenticated responsive browser/visual diagram,
  cloud scheduling and hosted CI are not verified. No application volumes reset,
  peer backend/source changed, cloud write, credential implementation or retry job.
- Persistent chain: ADR-028/ARCH-EVO-031, contexts/sprint/contracts/traceability,
  diagram, migration handoff, active work and AI usage synchronized. Learning
  updated locally and excluded from Git. Source/workflow/disclosure commits separate.
- Verified source commits: 8818f1a (Order backend/V4/tests), b3cbf7b (shared Order
  frontend/tests). No push. Workflow and AI disclosure committed separately.

## Migration handoff and recovery

Migration V4 in `src/main/resources/db/migration/`; expected Flyway version 4.
Startup applies it after image rebuild; do not edit V1-V3 or reset volumes.
Back up before production upgrade. No automatic destructive down migration;
restore a reviewed pre-upgrade backup or use a forward correction. Legacy plans
disabled by user decision cannot be re-enabled midway through an existing order.
