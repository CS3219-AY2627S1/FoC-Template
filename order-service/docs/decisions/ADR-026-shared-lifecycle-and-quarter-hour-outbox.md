# ADR-026: Shared minute lifecycle scheduler and 15-minute outbox recovery

Timer-ownership follow-up: ADR-034 / CHANGE-102 adds eligible command recovery
as the first phase of this minute job. Capture lifecycle time after that phase;
expiry/completion and independent 15-minute outbox rules below remain unchanged.

- Date: 2026-10-08.
- Owner/approver: Vincent, explicit latest diagram amendments.
- Status: accepted for the cadence slice; implementation/verification in CHANGE-083.
- Supersedes only scheduler cadence/settings in ADR-022/023; preserves quarter-hour UI selectors, ADR-013 immediate dispatch, ADR-020 48-hour rule and ADR-025 abort/history.

Use one Spring scheduled method every minute with a single captured current time. It independently invokes OPEN expiry and DELIVERED auto-completion. Expiry requires OPEN, courierId IS NULL and expiresAt <= now; completion requires DELIVERED and the latest delivery at or before now minus 48 hours, with locked state/deadline revalidation. Both reuse existing atomic Order/checkpoint/outbox transactions. Failure in one pass does not skip the other.

Configure this job with ORDER_LIFECYCLE_CRON (default `0 * * * * *`), replacing ORDER_EXPIRY_CRON and ORDER_AUTO_COMPLETION_CRON. Remove old overrides from developer environments when rebuilding; those settings no longer control jobs. The new single setting can disable both checks with `-` in tests.

Outbox recovery uses ORDER_OUTBOX_RECOVERY_CRON=`0 */15 * * * *`. All three kinds (refund, completion, accepted cancellation) remain eligible; immediate AFTER_COMMIT publication is retained. This is publication recovery, not refund completion confirmation. Consumer processing can lag and must be idempotent.

Cloud Run idle/scale-to-zero timing is not guaranteed by Spring cron. This decision does not authorize a cloud billing/execution-model change, a peer API change, a broker-confirmed refund dependency, or an unapproved durable repost retry schema.

## Lifecycle per-order failure isolation — CHANGE-093 (2026-10-09)

Yao Xiang explicitly requests failed scheduled tasks be skipped while later successes continue. Due selection returns IDs filtered in the DB (latest delivery cutoff for completion), without locking a whole batch. Nontransactional lifecycle coordinator calls fresh NOWAIT-locking per-order transactions (expiry worker / existing autoComplete with REQUIRES_NEW), catches each RuntimeException including commit failures, logs order ID, counts only successful transitions, then continues. Scheduler retains independent whole-pass catches. Failed orders remain eligible next normal lifecycle pass; no new repost retry mechanism or cron/contract/schema/peer change. Previous batch transaction description is superseded by this refinement; CHANGE-092 compact payloads and FEEDBACK-009 remain unchanged.

## Scheduler DB selection and independent outbox dispatch — CHANGE-096 (2026-10-10)

The active lifecycle paths retain CHANGE-093: DB-filtered IDs, separate REQUIRES_NEW expiry/completion workers, fresh NOWAIT locks and outside-proxy catch. Outbox recovery now selects bounded eligible event IDs in SQL (due PENDING or expired IN_PROGRESS lease), then individually claims/rechecks with SKIP LOCKED. Claim, markPublished and scheduleRetry use separate REQUIRES_NEW transactions; enqueue remains REQUIRED with Order/checkpoint/receipt. Dispatcher catches each event's claim/commit/retry-write errors, logs its ID and continues later events. A failed retry write leaves the committed lease recoverable after expiry. Neither scheduler nor batch coordinator is transactional. Pub/Sub publication stays outside DB transactions and is irreversible; stable-ID deduplication remains required. Legacy claimDue is retained for compatibility, unused by the active scheduler. No cadence, schema, event body, peer, frontend or paused repost change.
