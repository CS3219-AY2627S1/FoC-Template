# CHANGE-066: Rewrite peer-service contract feedback

> Later update: CHANGE-070 finalizes FEEDBACK-003's hold-for-reopen contract; it is no longer labeled “To be discussed.” The Credit endpoint remains unimplemented.

- **Status:** Documentation updated; peer implementations remain unverified
- **Date:** 2026-10-04
- **Scope:** Order Service documentation only, plus the permitted AI usage disclosure
- **Related decisions:** ADR-006, ADR-014, ADR-015
- **Related feedback:** FEEDBACK-001 (superseded history), FEEDBACK-002, FEEDBACK-003

## Request

Rewrite `docs/peer-service-api-feedback.md` so peer teams receive concrete HTTP contracts and event field formats, including the synchronous Credit endpoint proposed for unexpired accepted cancellation in a section named “To be discussed.”

## Changes

- Documented implemented User Service role-context and courier-eligibility, Supplier Service pair-validation, and Credit Service reservation request/response shapes from inspected peer controllers and DTOs.
- Replaced stale synchronous completion/refund endpoint expectations with the current event-driven subscriber actions: Credit processes completion, open cancellation, expiration, and expired accepted cancellation; User processes completion and expired accepted cancellation.
- Added the common event envelope, current Order/repost snapshot fields without checkpoint history, completion overdue fields, and at-least-once deduplication expectations.
- Added FEEDBACK-003 “To be discussed” with the proposed `POST /api/credits/orders/{orderId}/hold-for-reopen`, request/success formats, transaction semantics, errors, authentication questions, and cross-service failure window.
- Recorded the Supplier response integration caveat: the current Order HTTP adapter discards `PairValidation`, so it does not currently inspect the peer's `valid` field.
- Corrected ADR-014 and Vincent's hands-off cross-references to point at FEEDBACK-003 and the event-consumer work in FEEDBACK-002.

## Scope and decisions

No peer source, Order application source, or Order tests were modified. Existing approved behavior in CHANGE-064/ADR-014 and CHANGE-065/ADR-015 is unchanged. Endpoint response/auth details under “To be discussed” remain proposals for Credit-owner agreement, not verified provider behavior.

## Verification

- Inspected current Order event DTOs, event mapper/factory, HTTP peer adapter, and approved Sequence 6/7 contracts.
- Inspected Credit `CreditController` and request/response DTOs, Supplier `SupplierController` and pair DTOs, and User `UserController` and role/eligibility DTOs.
- `git diff --check` passed for the changed Markdown files.
- No Maven or peer-service tests were run because this change only rewrites documentation.

## Remaining work

- Credit and User event consumers remain future peer work and are not verified.
- Credit must agree and implement the hold-for-reopen endpoint before Order HTTP-peer mode can safely use the unexpired cancellation flow.
- Order should separately correct `HttpPeerAdapters.validatePair` to inspect `valid:false`; no source change was authorized or made in this documentation task.
