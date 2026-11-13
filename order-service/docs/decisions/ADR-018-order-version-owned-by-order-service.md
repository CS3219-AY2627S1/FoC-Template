# ADR-018: Order version is owned by Order Service

> Payload supersession (2026-10-09): CHANGE-092 / ADR-031 replaces only refund/completion JSON bodies with exactly seven fields. Order/version metadata remains internal; completion overdue facts are no longer sent. Accepted-cancellation schema is unchanged. FEEDBACK-009 blocks current peer integration. Earlier rationale below is preserved history.

- Status: Accepted by user
- Date: 2026-10-06
- Owner: Order Service
- Related change: CHANGE-069
- Clarifies: ADR-017

## Decision

Order Service validates expected versions, requester/courier ownership, and amount at its own API/application/domain boundary. Assignment sends `orderId` in the path and only `courierId` in the body; hold/reset sends only `orderId` in the path and has no body. Credit obtains the rest from its own transaction. The operations are idempotent by the stored transaction state for that Order ID.

Order event envelopes continue to carry `orderVersion`. Consumers may use it with `eventId` to identify or order event facts. This decision does not change event schemas or Order's optimistic-lock/version checks.

## Consequences

- Credit's synchronous contracts do not depend on Order's versioning implementation or duplicate reservation fields.
- Credit contracts avoid duplicating reservation fields owned by Credit; mock assignment and hold idempotency follow transaction state keyed by Order ID.
- Existing proposed Credit assignment and hold/reset endpoints still require Credit-owner agreement and implementation (FEEDBACK-003/004).
- There is no database migration or event schema migration.
