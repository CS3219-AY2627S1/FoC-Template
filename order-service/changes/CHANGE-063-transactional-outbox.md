# CHANGE-063: Transactional outbox for Order outcome events

- Status: Implemented and verified
- Date: 2026-10-03
- Scope: Order Service only
- Related decision: ADR-013
- Supersedes: CHANGE-053 publish-before-status delivery ordering for completion and cancellation events

## Approved behavior

For completion, OPEN cancellation, and accepted-order cancellation, Order Service writes the post-transition Order state, checkpoint, command receipt, and serialized event to PostgreSQL in one transaction. The event represents the resulting Order state; per CHANGE-067/ADR-016, it does not embed checkpoint history. The checkpoint is still persisted atomically in PostgreSQL. No Pub/Sub network call runs inside that transaction.

After a successful database commit, an `AFTER_COMMIT` listener immediately attempts to dispatch the corresponding outbox row through the existing typed publisher. The callback runs before the transactional service call returns, so the request waits for this one publish attempt and its Pub/Sub acknowledgment; it never waits for Credit/User consumer replies. A Spring cron recovery job periodically claims due pending rows and retries delivery. Pub/Sub confirmation marks a row published. A failure leaves the committed Order transition and durable outbox row intact; it is logged and scheduled for retry, not returned as a failed transition response.

Outbox claims use database locking and expiring leases so concurrent instances do not normally publish the same row concurrently, and a process crash cannot strand an in-progress row permanently. Delivery is at least once: if Pub/Sub accepts a message but Order Service crashes before marking the row published, it may be sent again. Event IDs remain stable and consumers must deduplicate. Retry delay uses bounded exponential backoff; rows are retained after publication for operational history.

## Rationale and limits

The earlier publish-first flow could expose an event for a status update whose database commit later failed. The outbox makes the Order state and intent-to-publish atomic while preserving prompt dispatch after commit. Pub/Sub and PostgreSQL still do not share a distributed transaction, so duplicate delivery remains possible and must be handled by consumers.

The Spring scheduler is a recovery mechanism, not the primary dispatch path. The current Cloud Run service scales to zero and uses request-based CPU; that deployment may not run cron while idle. No cost-affecting Cloud Run setting is changed by this Order Service implementation. Reliable always-on recovery in Cloud Run requires an approved runtime/billing choice (for example, an always-allocated CPU instance with at least one minimum instance) or an external scheduler trigger.

## Implementation and verification record

- Migration: `V2__create_order_event_outbox.sql`; adds the outbox table and due/lease indexes.
- Clean database and upgrade-from-V1 Flyway migrations pass. Hibernate schema validation and PostgreSQL JPA claim/retry/publish/rollback integration tests pass.
- Persistence, transition, after-commit dispatch, failure/retry, lease recovery, and stable event identity tests pass; see the active-work record for final full-suite results.
- Peer consumer source and contracts are not changed; live consumer behavior is not verified.
- No shared Compose, frontend, or deployment billing changes are included.
