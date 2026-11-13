# CHANGE-135 — Persist start-based delivery timing and admin decisions

Approved by Yao Xiang, 2026-10-17, order-service/penalty-integration.
Supersedes CHANGE-134/ADR-044 only for overdue calculation and resolution storage.

Current sprint: Sprint 2–3 continuation of the Order lifecycle foundation.
Feature: D1 F4 courier progress/delivery/completion, NTH2 penalty policy and NTH3
report investigation funding holds; approved admin cancellation resolution amendment.
Relevant flows: accept/start/pickup/deliver/complete, automatic completion and
admin cancellation. Ordinary holds and existing shared penalty amounts remain.

Persist nullable deliveryDeadlineAt and deliveredAt on orders. START saves its
server timestamp plus delivery duration; DELIVER saves its server timestamp.
ACCEPT does not start the clock. isOverdue compares deliveredAt (once delivered)
or current time (while progressing) against the stored deadline. Admin cancellation
freezes an undelivered observation at its recorded resolution time. Unknown legacy
timing and unstarted/historical attempts return null. No checkpoint queries in DTO
mapping, no Boolean-updating scheduler. Completion penalties use the same facts.

Persist adminPenaltyDecision (WAIVED / ADDITION_REQUESTED), highest selected reason,
amount and adminResolutionAt on the Order in its existing atomic cancellation
transaction. Null/empty penalties explicitly waive; never claim subscriber APPLIED.
Existing receipt/checkpoint identifies the administrator. Event IDs, schemas,
topics, Credit operations, role authentication and report hold rules are unchanged.

ADR-045 and additive Flyway V10 implement this amendment. Backfill only from
current-courier, current-attempt START/delivery checkpoints; never infer a start
from acceptance. Missing evidence stays unknown. Existing admin resolutions are
timed from ADMIN_CANCEL receipts; historical decisions remain unknown rather than
guessing waiver from absence of an event. Preserve versions, payloads and holds.

Peers: existing compact Credit refund/completion and penalty events unchanged;
User penalty subscriber remains pending (FEEDBACK-014). No new peer dependency,
callback, Report release, UI penalty-status feedback, sibling backend or deployment.
Frontend impact: additive optional timing fields only; normal/admin layout unchanged.
One locked transaction per operation, existing outbox AFTER_COMMIT dispatch and
independent scheduler jobs retained. Due completion selection uses SQL stored timing.

Tests first: delayed START, exact/late delivery, frozen observations, unknown timing,
admin waiver/max selection/replay/rollback, no history lookup, hold guards; PostgreSQL
clean/V9 upgrade and scheduler predicates. Full Order/common checks after focused TDD.
Workflow/context/profile/allocation/sprint/ADRs/frontend and peer baseline reloaded;
PDF fingerprints unchanged, no unresolved Git conflicts, existing merge work retained.
Local migration/application and human review evidence will be recorded on completion.

## Local migration evidence

Existing local Compose Order PostgreSQL was stopped at V9. Started only
foc-order-postgres-1, backed up to ignored target/change135-before-v10.dump, then
applied the actual Flyway V10 file. Version9 ->10 succeeded; all seven Orders'
IDs/statuses/versions were preserved. Three current attempts had sufficient
START/delivery evidence and were backfilled. No application image/container was
rebuilt or started, no cloud database touched. Rebuild matching Order before use.
Historical admin decision rows remain unknown; absence of an event is not waiver.

## Verification

- Initial RED test compilation detected absent timestamp/decision APIs.
- First focused run43 had one fixture failure: on-time stored delivery correctly
  selected deduction, while the old failure injection targeted addition. The
  rollback test now fails the actual deduction write, preserving its purpose.
- First full run455 had one analogous expected-event fixture mismatch in the
  scheduler rollback test; updated to the actual on-time deduction. Migration
  clean/V9 upgrade2/2 and admin transaction4/4 passed on actual PostgreSQL.
- Complete root Maven verify then passed common12 + Order458 =470 tests,
  zero failures/errors/skips, coverage gates and executable JAR build passed.
  A stale execution-data warning from the removed mapper implementation prompted
  a fresh coverage-cache-only reset and verification rerun. That rerun also passed
  all470 tests, zero failures/errors/skips, both unchanged coverage gates and JAR
  build, with no execution-data/class mismatch warning (03:15).
- Added delayed-START completion with no history lookup, unknown timing rejection/
  scheduler skip, timestamp/checkpoint equality, actual delivery freezing, waiver
  and persisted maximum-decision/replay/rollback assertions. Existing held completion
  and abort/funding guards remain covered. DTO/OpenAPI includes both timestamps.
- Frontend typecheck passes; optional types only, no runtime/layout change and no
  new desktop/mobile browser check. Previous frontend suite results are not rerun
  claims for this turn. AsyncAPI YAML/Ajv six addition mappings and negative cases
  pass unchanged; TOML406 unique qualified keys (not full TOML parser validation).
- No unresolved merge entries; task whitespace check passes. No sibling source,
  topics/config, application-image recreation, cloud deployment, commit or push.

Remaining: rebuild matching Order image; human/deployed/peer-consumer confirmation.
Legacy rows without provable timing need reviewed reconciliation; no fabricated
deadline/penalty. User subscriber, Report release and immediate score UI/callbacks
remain outside this approved increment. Partial Sprint/NTH status is retained.
