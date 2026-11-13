# CHANGE-056: Unify order completion event

- Date: 2026-10-02
- Developer: Yao Xiang
- Feature: Completion publication and overdue-dependent peer policy
- Classification: Architecture/specification change
- Status: User-approved; implemented and verified by full `mvn verify`
- Approval: Explicitly requested by the user on 2026-10-02
- Related decision: ADR-011

## Problem

The previous design published a normal completion event only to Credit and a separate overdue completion event to Credit and User. User Service must process every completion so it can apply the appropriate score outcome: penalty when late and score decrease when on time. Separate routing omits non-overdue completions from User Service.

## Approved change

- Publish only `OrderCompletionTaskEvent` for every successful completion, with the resulting Order/repost fields plus `overdue` and `overdueAt`; per CHANGE-067/ADR-016, checkpoint history is omitted from the event.
- Derive overdue from checkpoint history: delivery is overdue only when `deliveredAt` is strictly after `acceptedAt + deliveryTimeLimit`.
- User and Credit are assumed to subscribe to every completion event. User selects its score/penalty behavior using the overdue facts; Credit selects settlement behavior from the same payload.
- Retain publish-before-status semantics: publish failure leaves Order state unchanged; successful publication is followed by `COMPLETED` status/checkpoint/receipt persistence. Neither peer reply is awaited.
- Remove the overdue-only event DTO, publisher interface/implementation, topic setting, and extra Sequence 8 diagram.
- Keep topic IDs as placeholders and limit source changes to Order Service.

## Alternatives and trade-offs

Keeping two event types would require User to consume the normal event too, while preserving redundant message schemas and routing. One event type provides a common completion contract but requires consumers to evaluate the overdue flag. The deadline is supplied for consumer auditability, while policy thresholds and score changes remain peer-service responsibilities.

## Affected artifacts

Implementation/test source, event and transition tests, completion sequence/class diagrams, service contracts, peer consumer expectations, requirements traceability, architecture/context guides, publisher instructions, ADR-009 supersession note, ADR-011, architecture evolution, change log, active-work log, and AI usage log. No peer source, frontend, database schema, or topic ID changed.

## Verification

Full `mvn verify` passed all 62 tests with no failures/errors/skips and passed configured JaCoCo line/branch gates. `git diff --check` and current-source stale-reference review passed. Live Pub/Sub and peer-consumer behavior are outside this Order-only verification.
