# ADR-011: Unified order completion event

> Payload supersession (2026-10-09): CHANGE-092 / ADR-031 replaces only refund/completion JSON bodies with exactly seven fields. Order/version metadata remains internal; completion overdue facts are no longer sent. Accepted-cancellation schema is unchanged. FEEDBACK-009 blocks current peer integration. Earlier rationale below is preserved history.

> Current Pub/Sub project/topic/authentication configuration is recorded in CHANGE-073/ADR-021; the historical topic-placeholder note below is superseded.

- Status: Accepted by the user's explicit request; implementation and suite verification passed
- Date: 2026-10-02
- Owner: Order Service
- Related change: CHANGE-056
- Supersedes: The separate normal/overdue completion event split in ADR-009 and CHANGE-053

## Decision

Order Service publishes exactly one `OrderCompletionTaskEvent` whenever a requester completes a delivered order. The event contains the resulting Order/repost fields (without checkpoint history) plus `overdue` and `overdueAt` facts. `overdue` is true when the delivery checkpoint occurred strictly after the deadline derived from the acceptance checkpoint and the Order's delivery limit. Order reads the persisted checkpoints internally to derive these facts; it does not serialize them into the event. User Service receives every completion and applies its policy based on those facts (penalty when overdue, score decrease when not overdue). Credit Service also receives every completion and applies its settlement policy from the same event. Order Service does not wait for either subscriber.

Under CHANGE-063/ADR-013, Order Service persists `COMPLETED`, its checkpoint, command receipt, and the completion event in one PostgreSQL transaction. The event snapshot represents the resulting `COMPLETED` state. An after-commit listener attempts Pub/Sub delivery immediately; a scheduled recovery job retries durable pending rows. A Pub/Sub failure does not undo the committed completion. Delivery is at least once, so consumers must deduplicate by stable `eventId`.

## Rationale and trade-offs

User Service must process all completed orders to choose the correct score outcome. Routing only overdue orders to User would omit on-time completions. A single event type also gives both consumers one idempotency/versioning contract and keeps policy decisions with their owning services. It adds overdue facts to the shared completion payload and requires consumers to branch on them. Consumer implementations and live broker delivery remain unverified.

## Scope

Order Service only. No Credit or User source, topic ID, subscription configuration, or frontend change is authorized by this decision. Topic IDs remain publisher placeholders. Google Cloud Pub/Sub remains effective; CHANGE-063/ADR-013 supersedes publish-before-status behavior from CHANGE-053/054.
