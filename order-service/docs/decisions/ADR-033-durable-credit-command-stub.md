# ADR-033: Durable foreground Credit command recovery (contract-stub milestone)

Effective follow-up: ADR-035 / CHANGE-104 (2026-10-11) supersedes only the
mock-only/absent-provider gate. The actual HTTP protocol is implemented and
financial-provider tests pass. All intent/lease/security/deadline rules remain;
repost recovery and delegated credentials stay deferred. Original proposal and
stub-milestone evidence below remain historical records.

Timer-only follow-up: ADR-034 / CHANGE-102 merges the separate minute recovery
job into OrderLifecycleScheduler, before expiry and completion. All command,
authorization, deadline, lease and provider-contract rules below remain in force.

- Date / approver: 2026-10-10 / Vincent, branch `sprint-2-3-credit-service-concurrency`.
- Status: APPROVED for Order/frontend implementation and contract-stub tests only.
- Change: CHANGE-100; evolution ARCH-EVO-038. Live HTTP recovery remains BLOCKED.
- Supersedes the proposal-only status of ARCH-EVO-034 for CREATE, ACCEPT and
  CANCEL_ACCEPTED only. ADR-027's paused repost retries and delegated credentials
  are not resumed. Existing lifecycle/outbox and deadline policies remain.

## Approved boundary

One browser-generated command ID and immutable input survive retries/reload.
Order commits PENDING intent and its candidate/target ID before an unsafe call.
An atomic claim uses owner, expiry, retry time and monotonically increasing
generation. A durable per-order unresolved guard supplements row locks. All
competing mutation/lifecycle paths honor it. Stale workers cannot finish.
COMPLETED includes SUCCESS or REJECTED; both commit with the local result.
Unknown outcomes remain PENDING; later authorization errors cannot erase them.
No token is persisted. User-assisted resume uses fresh authorization. A local
mock contract stub may recover automatically; HTTP recovery is hard disabled,
even if its feature flag is enabled, until the provider contract is verified.

Credit request bodies stay unchanged. The proposed protocol uses Idempotency-Key
and attempt fencing headers, historical result retrieval and conditional
compensation. These are STUB ASSUMPTIONS, not existing Credit functionality.
The local stub is process-local and is not a durable financial ledger. Real
provider crash safety remains unverified and requires Annablee's implementation.

The UI holds a disabled pending action through uncertain results. It exposes
Continue only for authorization-needed recovery, clears its active intent only
on an authoritative terminal result, and does not introduce an ordinary Retry
button. Existing visible five-second Order polling remains.

## Persistence / implementation refinements

Flyway V5 adds Order-owned commands, immutable request/result JSON, retry/claim
metadata and a partial unique pending-target index. JDBC conditional claims and
DB clock avoid replica clock races; existing JPA business writes share the final
transaction. A scoped command context permits only the owning finalizer through
the repository guard. Network I/O occurs outside the final transaction.
IndexedDB stores only account-scoped action keys and inputs, never credentials.
Lease/retry/batch settings are configurable. Expired remote success requires
conditional compensation; unavailable compensation remains reconciliation-needed.

## Alternatives and limits

Plain browser retries cannot survive server crash; a broker command protocol
adds unapproved infrastructure. The approved durable synchronous fast path plus
exceptional recovery adds database/protocol complexity but preserves existing
business transport. A lease cannot promise one physical HTTP call: provider
historical deduplication/fencing must guarantee one logical effect.

Cloud Run scale-to-zero can delay an in-process scan. No cloud scheduling/cost
change is authorized. Repost recovery and production readiness remain `[~]`.

## Context exception

Vincent explicitly approves latest effective sections plus relevant requirements,
ADRs, contracts and source for this slice, preserving all history and treating
changed/contradictory sources as blockers. This narrows context loading only;
approval, TDD, migration, coverage and completion gates are unchanged.

## Verification

Tests/results and migration clean/upgrade evidence will be recorded in CHANGE-100.
Existing committed conflict markers in the historical AI log are preserved,
reported and not interpreted as an approval for this feature.
