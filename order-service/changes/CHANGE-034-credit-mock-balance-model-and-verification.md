# CHANGE-034 — Deterministic local Credit outcome mock and verification

- Date: 2026-09-30
- Status: Implemented; real provider verification pending
- Scope: Order Service local Credit boundary and verification evidence
- Approved by: Vincent's previously approved temporary Credit outcome exception

## Decision

Keep Credit settlement and release Credit Service-owned and synchronous at the
production boundary. Until the provider implements the agreed outcome APIs,
the Order Service local mock models the minimum balance and reservation effects
needed to exercise Sequences 7–11 deterministically. This is a local test
double, not a production Credit implementation.

## Mock behavior

- New mock accounts start with 50 credits.
- Reservation increases `reserved` and reduces available credit.
- Settlement decreases the requester total and reserved balance, and credits
  the courier; repeated commands with the same command ID are idempotent.
- Cancellation or expiry release removes the reservation without transferring
  credits; repeated commands with the same command ID are idempotent.
- Mismatched commands, missing reservations, invalid outcomes, and insufficient
  available balance are rejected.

## Verification

- Order Service Java 21/Maven tests: 12 passed.
- Frontend Vitest/React Testing Library: 11 passed; TypeScript typecheck passed;
  ESLint passed with 12 pre-existing warnings and no errors.
- Credit Service pure tests: 15 passed.
- User Service tests: 2 passed.
- Supplier Service suite: 92 tests, 21 errors because Testcontainers could not
  access a Docker daemon in the isolated runner; one seed-file test also lacked
  its repository-relative CSV fixture.

The Firestore/Testcontainers-backed Credit integration suite likewise could
not start without Docker socket access. No peer source was changed, and no
peer integration is claimed as verified from these blocked runs.

## Exit criteria

Replace this mock only after the Credit owner implements and agrees to the
settlement/release paths, authentication, response/error shapes, idempotency,
and contract tests recorded in `FEEDBACK-001`. Re-run the peer integration and
authenticated browser gates before changing the affected sequences to `[x]`.
