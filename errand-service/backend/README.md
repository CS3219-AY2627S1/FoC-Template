# Errand Service backend

Express/PostgreSQL API for errand creation, browsing, acceptance, pickup,
delivery, confirmation, cancellation, and courier drop. All public
`/api/errands` routes require Cognito authentication. The authenticated
`POST /api/errands/estimate-credit` route delegates to Credit Estimation.

## Development and checks

From the repository root, run `npm ci` once, then `npm run dev` with Docker
running. This loads Floci's generated endpoints, prepares the errand schema,
and runs this API on port 3002 plus its separate publisher. Use
`npm run up:compose` instead for the full container environment. See the
[local guide](../../floci/README.md).

```bash
npm run lint --workspace=@relay/errand-backend
npm run build --workspace=@relay/errand-backend
npm run test --workspace=@relay/errand-backend
```

Tests require the configured PostgreSQL test database. Set
`ERRAND_TEST_DATABASE_URL` to the intended disposable database; defaults in the
package/test configuration are not discovered Floci endpoints. Audit commands
below also require the intended database, User API, and internal token settings.

## Transactional outbox

Errand state changes and their Kafka events are written to errand_event_outbox
in the same PostgreSQL transaction. The errand repository builds the distinct payload for
each lifecycle event. The pending-errand worker runs every five seconds and
records ErrandCreationFailed for stale pending rows; it does not publish Kafka
messages. The outbox publisher runs every second, sends unpublished events to
the configured errand topic, and marks each row published only after Kafka
acknowledges it. A failed send leaves the row pending for retry. The publisher
removes published rows older than seven days during its minute-by-minute cleanup.
Unpublished rows are never deleted by this cleanup.

## Profile audit and account deletion

Requester-deletion acceptance protection is already implemented. To audit
historical profile-less errands before rollout or remediation, run:

```bash
npm run audit:profileless --workspace=@relay/errand-backend
```

The audit compares every distinct errand requester with User Service. A
missing profile with a recorded `UserDeleted` event is classified as
`legitimately-deleted`. A missing profile without that event is classified with
Cognito when available: an existing Cognito user is
`legacy-profile-never-created`, while a missing Cognito user is
`inconsistent-data`. Local/mock identity mode reports
`needs-manual-classification` because it cannot safely make that distinction.
The command exits non-zero while unresolved entries remain.

After reviewing the JSON report, remediation is explicit:

```bash
npm run audit:profileless --workspace=@relay/errand-backend -- --remediate-open
npm run audit:profileless --workspace=@relay/errand-backend -- --resolve-assigned
```

`--remediate-open` cancels only profile-less `OPEN` errands and emits
`ErrandCancelled`, allowing Credit Service to release their reservations.
Assigned errands are left untouched unless `--resolve-assigned` is explicitly
provided; that option applies the same requester-deletion rule as the live
consumer and emits `ErrandCompleted` for settlement. Run the audit again and
record the final report before deploying the acceptance guard.

The Errand API also consumes `UserDeleted` events with the dedicated
`relay-errand-user-events` group. New consumer groups start from the current
Kafka tail; historical deletions require an explicit audit/backfill. For a
deleted requester, `OPEN` errands become `CANCELLED` and emit
`ErrandCancelled` so reserved credit is released. `ACCEPTED`, `PICKED_UP`,
and `DELIVERED` errands become `CONFIRMED` and emit `ErrandCompleted` so the
assigned courier receives the full reserved amount. Each transition is locked
and written with its outbox event in one database transaction, so redelivery is
safe and cannot duplicate settlement events.

The same consumer handles deleted couriers. Valid `ACCEPTED` and `PICKED_UP`
errands are reopened with the courier cleared. Expired assigned errands become
`EXPIRED` and emit `ErrandExpired` to release the reservation. `DELIVERED`
errands become `CONFIRMED` without clearing `courierSub`, so Credit Service can
route the completed payment to pending settlement for the deleted courier.
These transitions use the same per-errand advisory locks and are idempotent.
If both the requester and courier are deleted for one `DELIVERED` errand, the
first deletion confirms it and emits the single `ErrandCompleted` event; the
second deletion is a no-op. This makes the result independent of deletion
event order and ensures Credit Service creates at most one pending settlement.

The deletion regression coverage is in
`tests/errand-user-deletion-state-matrix.test.ts` and
`tests/errand-user-deletion-combined.test.ts`. It covers requester resolution,
courier reopen/expiry behavior, delivered-courier settlement, terminal-state
no-ops, duplicate events, and both deletion orders. Run it with the backend
test command after the Errand test database is available:

```bash
npm test --workspace=@relay/errand-backend -- \
  tests/errand-user-deletion-state-matrix.test.ts \
  tests/errand-user-deletion-combined.test.ts
```

Acceptance protection checks the requester's current User Service profile before
allowing a courier to accept an errand. A missing profile returns
`REQUESTER_DELETED` with HTTP 409, while a User Service outage fails closed
with the existing service-unavailable error. The check is intentionally
eventually consistent with account deletion; the transactional consumer remains
the final protection for deletion events that race with acceptance.

The requester-deletion consumer is deployed inside the existing `errand-api`
workload, consistent with the Credit Service consumers. The Errand image copies
the consumer source and compiled output, and Kubernetes injects the shared
Kafka broker, user-events topic, and user-event DLQ settings through the
existing runtime ConfigMap and Secret. No separate consumer Deployment is
needed.
