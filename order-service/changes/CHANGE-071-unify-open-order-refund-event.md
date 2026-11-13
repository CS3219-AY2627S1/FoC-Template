# CHANGE-071: Unify OPEN-order cancellation and expiry refund event

- Date: 2026-10-06
- Status: User-approved; implementation complete; local verification blocked by environment
- Approval: The user directed Order Service to remove the separate expiration event, rename the open-order cancellation event to a refund event, reuse it for scheduler expiry, and update the topic.
- Scope: Order Service source, tests, contracts, diagrams, durable context, and the Order-specific local Compose topic. No peer-service source changes.
- Related decisions: ADR-019; supersedes only the separate event choice in CHANGE-065/ADR-015.

## Effective behavior

Requester cancellation of an OPEN Order remains trigger-based and changes status to `CANCELLED`. Scheduled expiry remains Spring-cron-based and changes status to `EXPIRED`. Both transitions atomically persist their Order state, checkpoint, and `OpenOrderRefundTaskEvent` intent in the existing outbox. Both events use one typed publisher and shared OPEN-refund topic. Credit subscribes once and refunds/releases for either outcome, using the resulting `order.status` when it needs to distinguish the cause. No User Service consumer is involved.

The former expiration event DTO, publisher interface/implementation, and separate topic configuration are removed. Existing pending outbox rows of either legacy OPEN event type are routed through the new publisher with the same stable event ID. The current Order transaction, scheduler timing, event snapshot fields, delivery guarantees, and Spring expiry behavior otherwise remain unchanged. No schema migration is required.

## Artifacts

- Backend event DTO, mapper/factory, lifecycle/transition integration, dispatcher, publisher port/implementation, and topic configuration.
- Unit tests for both new producers, typed dispatch, and legacy pending-outbox conversion.
- Sequence 6, publisher class diagram, Sprint acceptance/requirements/contracts, peer API feedback, service and overall architecture docs, traceability, event registry, ADR/change/evolution records, instructions, active-work and handoff documentation.
- Local Compose topic initialization changes from `open-order-cancellation-v1` to `open-order-refund-v1`; production application configuration retains `TODO_TOPIC` until configured.

## Verification

Focused tests were added before the implementation. The wrapper failed before Maven started (`Cannot index into a null array`). Direct Maven was pointed to a workspace-local repository and compiled 85 sources, but Java 21 failed with `Fatal Error: Cannot close compiler resources`; a forked compile also failed before test execution. `git diff --check` passed. Docker Compose validation remains unavailable: the installed `docker` command rejects `-f`, and access to its user config is denied. Run focused/full tests and Compose config validation in CI or a working local toolchain.
