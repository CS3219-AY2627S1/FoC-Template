# CHANGE-017: Sprint 1 Sequences 1-11 Implementation

## Status

Approved for implementation by Vincent on 2026-09-30.

## Scope

Implement Order Service Sprint 1 sequences 1-11 on the user-approved branch
`sprint-1/seq-1-to-seq-11` as one combined implementation. This explicit approval
overrides the normal two-developer allocation for this branch only.

## Approved decisions

- Use one `Order` aggregate for the complete lifecycle.
- Use Flyway versioned PostgreSQL migrations.
- Use the existing User, Supplier, and Credit service APIs through Order-side adapters.
- Forward the authenticated Firebase bearer token to peer services.
- Defer repost event publication for Sprint 1; no broker or internal repost event.
- Preserve synchronous credit reservation before an original or repost becomes `OPEN`.

## Implementation gate

Implementation artifacts now include domain tests and a Flyway-backed persistence slice. Maven
compilation and the available unit suite passed (5 tests, 0 failures, 0 errors, 0 skipped).
PostgreSQL-backed, peer-contract, frontend, coverage, Cloud Run, and deterministic verification
remain to be run where tooling exists. Update traceability, active work, and AI usage records with
actual results; do not claim unavailable checks.

## Known constraints

Concrete HTTP paths for the Order Service remain an implementation proposal and
must stay under the approved `/api/orders` resource. Peer API adapters must keep
bearer-token propagation and record response/error translation.
