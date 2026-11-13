# CHANGE-110: Prevent command polling from racing its initial submission

- Approver/date: Vincent, 2026-10-11, explicit "Yes, fix it".
- Branch: `sprint-2-3-credit-service-concurrency-update-event-payload`.
- Classification: implementation detail under ADR-033/035/037/038.
- Scope: existing shared frontend command hook and regression tests only.
- Status: implemented and automated verified; [~] browser/rollout gates open.
- Source/test commit: `386f58f`; no deployment authorized or performed.

## Requirement and acceptance

F1/F3/F11.2 and NTH4 command flows retain the approved pending/terminal UI;
NFR3 test adequacy and NFR4 identity boundaries remain. No new product behavior,
role, endpoint, Credit payload, schema, deadline or financial operation.

The browser must persist the frozen key/input before POST, but that does not
prove the server has committed it. Previously setting intent enabled the actual
visible-poll hook's zero-delay initial GET before the POST settles. That GET can
return NOT_FOUND and trigger an unnecessary same-key resubmission.

1. No individual status GET or fallback repost while initial submission is active.
2. Confirmed success/rejection clears intent normally, without starting polling.
3. Pending/uncertain responses retain intent and resume visible five-second polling.
4. Genuine missing keys after uncertainty/reload retain existing same-key replay.
5. Local authorization resume does not race individual status polling.
6. Existing pending/ownership/auth/account-switch/visibility rules remain.

## Design and alternatives

Use existing submitting state to suspend this hook's timer, plus the synchronous
active-request reference to guard a stale scheduled callback. Resume after the
POST settles, not after an arbitrary delay. This preserves progress reporting
for unknown outcomes while preventing locally known overlapping submission.

Alternatives: delay every poll by a fixed interval (does not guarantee ordering),
or make backend 404 pretend to be PENDING (hides genuinely missing commands and
changes the contract). Neither is selected. Backend idempotency remains the
cross-tab/replica correctness boundary; this gate is a frontend UX/traffic fix.

Sequence: save browser intent -> POST active (poll paused) -> terminal cleanup,
or pending/uncertain result -> owned GET polling -> existing same-key recovery.
Class responsibility remains useOrderCommand coordinating useVisiblePolling.
Order owns durable intent/result; peers and their state are unchanged.

## Verification

- RED: all eight new tests failed on the original hook, specifically because
  GET ran during delayed initial POST/resume; not import/setup failures.
- GREEN: 33 focused hook/discovery/visibility tests pass. Final full suite after
  duplicate-click and polling-to-terminal assertions: 124 tests / 28 files pass,
  zero skipped. The new suite uses the actual useVisiblePolling with simulated
  HTTP/storage responses and fake timers; it is not a live server integration.
- npm run lint: exit 0, zero errors, three existing login-form warnings.
- npm run typecheck and npm run build: exit 0. Existing external-lockfile warning
  remains; no Next configuration change was needed.
- git diff --check and staged patch check pass; D1/selected Overall hashes match.
- No backend tests rerun: backend/peer/API/schema/infrastructure are unchanged.
- No authenticated staging/browser request reproduction or deployment performed.
  A truly missing key after a lost submission can still return 404 legitimately;
  existing same-key lookup/replay is deliberately preserved, not hidden.

## Changed artifacts and ownership

Source/test: frontend/src/hooks/use-order-command.ts and its new real-poll test.
Records: CHANGE-110, context MD/TOML, current sprint, allocation, traceability,
architecture evolution, change log, Vincent active work and AI disclosure.
Existing excluded frontend learning note explains browser intent vs server commit.
Requirements, architecture boundaries, diagrams/data model, OpenAPI/AsyncAPI,
Credit/User/Supplier, migrations, deployment and business rules remain unchanged.
Earlier dirty active-work/AI entries are preserved and not included in source
commit; required documentation is a separate atomic change.

## Rollout and rollback

Rebuild/redeploy the frontend normally to consume this fix; no migration or
server restart is required for its semantics. Preserve unresolved keys/database
records. Rolling back the hook reintroduces the timing gap, not a new contract.
