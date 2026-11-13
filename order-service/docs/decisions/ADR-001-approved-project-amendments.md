# ADR-001: Approved Project Amendments

Date: 2026-09-23

Status: Accepted

Approved by: User-provided setup specification

## Context

Project D1 contains the original cross-service backlog. The later Order Service design and the user's persistent workflow instructions clarify ownership and amend selected lifecycle behavior.

## Decision

1. `OVERDUE` is a flag, not a status. Evaluate it once when an order reaches completion by comparing actual delivery duration with the configured delivery limit. Do not run a continuous overdue scheduler. Order Service records/publishes the fact; User and Credit Services apply their own policies.
2. Do not implement `ABORTED` to `OPEN` reopening in Sprint 1. It is distinct from NTH4 reposting, and a future change requires a new approved decision.
3. User Service alone calculates/applies penalties and owns courier suspension. Order and Admin Services publish facts/decisions but do not calculate points.
4. Supplier Service is authoritative for supplier names, activity, locations, and catalogue information. Order Service stores supplier references only.
5. An unaccepted `OPEN` order becomes `EXPIRED`. Automatic or reviewed manual reposting can create at most one distinct linked order. Reserve credits before the repost becomes `OPEN`; configuring the plan does not reserve future credits. Both paths are idempotent.

## Superseded or clarified sources

- Completion-time `OVERDUE` evaluation supersedes Project D1 F12.1-F12.1.4 continuous-monitoring language.
- Sprint 1 deferral limits Project D1 F4.1.10/F11.2.4; those requirements are not deleted from the permanent backlog.
- Ownership clarifications constrain the implementation of NTH1-NTH4 without moving their product behavior to the wrong service.

## Consequences

- No scheduled overdue monitor may be added without a superseding ADR.
- Sprint 1 repost logic must not reopen an `ABORTED` order.
- Cross-service interactions require explicit ports/contracts and cannot write another service's data.
- Tests and traceability must cite both the original Project D1 reference and this ADR where behavior differs.
