# ADR-035: Real HTTP Credit command recovery

- Date/approver: 2026-10-11 / Vincent, explicit "Fix it… real idempotency/crash-recovery" request.
- Branch: sprint-2-3-credit-service-concurrency-update-event-payload.
- Status: APPROVED implementation; verification in CHANGE-104.
- Supersedes ADR-033's mock-only HTTP hard gate and obsolete missing-provider
  assumptions, not its lifecycle, authorization, leases or compensation rules.

## Existing provider and approved integration

Credit 497a8f9 implements the exact paired `Idempotency-Key` and
`X-Command-Generation` headers, historical owner-scoped result and conditional
compensation. Keep existing minimal business bodies and Firebase authorization.
Use an HTTP `CreditCommandGateway` in HTTP mode; keep the explicitly selected
local stub only in mock mode. The existing frontend discovers the enabled
capability and uses its durable commands without a new UI transport.

GET saved result first; terminal matching results are authoritative. Missing or
PENDING results may replay only the same saved action/key/generation. Validate
result key, operation, order ID, status and outcome; require matching response
headers for mutations. Unmarked errors, timeouts, malformed/foreign results and
stale-generation errors are unresolved, not definitive business rejection.
An owner-authorized saved REJECTED result is terminal even if its HTTP business
status is 403; a plain 401/403 remains authorization-needed.

Compensation only resolves after a confirmed matching COMPENSATED result.
RECONCILIATION_REQUIRED leaves Order pending. Credit returns COMMAND_NOT_FOUND
when compensation lacks a registered binding: first replay the original saved
action to establish its durable binding, then compensate/fence that same key.
A 404 alone is never proof that an older request cannot still apply. This is an
adapter refinement using the already-approved same-key replay rule, not a new
provider API. Never substitute a new key or clear a courier by UID alone.

## Authorization and concurrency

No bearer/refresh token is stored, logged or turned into a service credential.
HTTP background execution without a user token defers to AUTHORIZATION_REQUIRED
before peer I/O; fresh user-assisted Continue uses the existing key. Existing
leases/generations, unique unresolved-target guard and row locks remain. Network
I/O stays outside the local finalization transaction; timeout settings bound
each request (default 3-second connect / 5-second read). No new schema or worker.

## Verification and operational limits

Test against actual Credit code and isolated PostgreSQL, separately from HTTP
response fixtures. Cover lost response/local rollback, replay, insufficient
credits, stale workers, assignment compensation, abort history/reset and provider
restart. Run frontend pending/Continue regressions and backend coverage gates.
Real User/Supplier browser/PubSub/IAM tests remain separate completion gates.
Live Compose uses the existing HTTP/local-live overrides; no cloud resources or
application DBs are modified by isolated contract tests. Reposts remain outside
this recovery slice. Rollback: disable commands, preserve PENDING records, reconcile
them; never silently fall back to a new action for an existing saved intent.
