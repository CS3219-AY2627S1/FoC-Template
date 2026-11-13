# CHANGE-158: Real Order / Credit compensation integration

- Date/developer: 2026-10-27 / Vincent; feature/vincent-credit-compensation.
- Status: [x] approved local integration milestone; cloud rollout remains [~].
- Baseline: ba27147, clean worktree. Credit 8ecb1e8/5ff41c3 inspected.
- User authorizes Order/Credit corrections, then explicitly approves gated Order
  Pub/Sub publisher, Google OIDC result receiver and local emulator tests.
  Deployment settings and default retry policy remain unchanged.

## Required design gate

Current sprint: Sprint 2-3 lifecycle/recovery, not whole-Sprint completion.
Feature: connect ADR-054 compensation-first recovery to actual Credit.
Project D1 references: F1 creation, F3 acceptance, F11 abort, F13 concurrency, NTH4.
Relevant amendments: ADR-025/033/035/036/037/038/050/052/053/054; ADR-055 transport.
Relevant FRs: reserve before OPEN; eligible non-owner acceptance; ACCEPTED-only
abort; stable manual-repost candidate; unresolved command blocks competitors.
Relevant NFRs: durable intent, no duplicate financial effects, bounded I/O,
backend authentication, retained failure evidence, unchanged coverage gates.
Relevant sequence diagram: concurrency/compensation-workflow-handoff.md.
Relevant class diagram: docs/diagrams/compensation-first-commands.mmd.
Relevant service contracts: credit-command-v1 and compensation request/result v1.
Actual peer-service APIs inspected: Credit mutation controller/service/store,
compensation decoder/controller/store/inbox/outbox/publisher/security and tests.
API mismatches or gaps: Credit message shapes MATCHES_APPROVED_CONTRACT by
inspection; runtime READY_FOR_VERIFICATION. Order real transport MISSING.
Affected backend components: command gate, publisher, result receiver/security;
Credit corrections only where tests expose approved-contract defects.
Affected frontend components: none; existing command status/pending UI unchanged.
Frontend directory and structure inspected: shared Next16 App Router, package,
config, routes/components/tests/auth/useApi/useOrderCommand and clean Git state.
Affected application role and USER mode: existing Requester/Courier; broker
identity is separate, never a Firebase role or user bypass.
Desktop and mobile-web behavior: existing pending until terminal result unchanged.
External services involved: real Credit HTTP, isolated PostgreSQL per service,
Pub/Sub emulator; read-only User/Supplier fixtures in integration harness.
Data owned by Order Service: commands, Order/checkpoints, outbox/result inbox.
Data owned by other services: Credit balances/ledger/preimages/revisions.
In-scope behavior: opt-in transport and negative/failure/race verification.
Out-of-scope behavior: cloud deployment/IAM, auto repost, unrelated peers,
rewriting applied migrations, changing default policy or frontend layout.
Assumptions: emulator delivery is not verification of deployed Google IAM.
Open questions: material contract deviations require separate approval.
Detailed design approval status: explicit gated transport/test approval today.
Interaction decisions awaiting approval: none within unchanged handoff schemas.
Tests to write first: gate/decoder/security/publisher; real reserve/assign/clear
reversal; missing-original fence; duplicate/lost result; local rollback; committed
success; manual repost identity and stale-owner guards.
Files expected to change: Order recovery/config/API/security/transport/tests/docs;
Credit tests/fixes if needed; minimal environment-variable documentation.

## Verification

D1 and selected Overall SHA256 match authority. Docker27.5.1 available.
Credit baseline full verify running; no runtime success claimed yet.

### Actual verification follow-up

- Credit initial full126 had1 recovery-fixture failure from host/DB-clock timing.
  Fixed explicit due timestamp/assertion. Full126 now passes,zero skips;
  LINE1688/1843=91.59%,BRANCH519/645=80.47%,unchanged gates/package pass.
- Transport RED: absent classes;GREEN7 unit/gate tests. Cutover RED:2 expected
  regressions, corrected persisted-policy dispatch and independent queue draining.
- Initial broker harness failures were late callback mapping, inherited100ms
  test timeout and ordinary-refund subscription mismatch. Corrected mapping
  before container start,10s publish bound, recovery ticks and matching names.
- Actual compensation11/11 passes: response loss/real HTTP timeout, absent-K
  fencing, duplicate/lost results, accept reversal, exact abort restore,
  rollback vs committed success, manual candidate, stale worker, old policy,
  production user API401. Uses actual Credit source/HTTP, separate PostgreSQL and
  real emulator push both ways. User/Supplier reads/demo identities are fixtures.
- Existing real protocol16/16 also passes. Initial fresh full Order582/common12
  =594 tests,zero failures/errors/skips; OrderLINE3041/3202=94.97%,
  BRANCH1528/1866=81.89%; unchanged gates/package pass.
- Actual gateway health200/result404/nginx syntax pass. Compose default retry/
  false confirmed. Two wiring tests and AsyncAPI5send/1receive,six DTOs/eight
  examples/source parity pass. Final full verify reruns after ID validation.

Pre-existing local Surefire30s post-System.exit(0) shutdown warning and Hikari
warnings after Testcontainers closes cached-context databases remain; not test
failures or justification to skip/lower checks.

No migration edited/added, no application data reset or real credentials stored,
no frontend/other peer source change, no cloud activation. Cloud IAM/subscription/
OIDC and direct/unkeyed financial-call review remain coordinated rollout gates.

Cutover implementation refinement: two observed failing regressions show the
global registration policy stranded historical RETRY commands and failed to scan
existing compensation commands after a default-policy rollback. Dispatch/replay
now honor persisted policy; independently drain both eligible policy queues while
transport is available. Disabled HTTP compensation remains fenced, never treated
as a RETRY operation. This preserves ADR-054/055 migration rules, not a new policy.

Final input-validation implementation detail: Credit's already-approved opaque-ID
validator rejects slash/dot/reserved IDs. Order previously persisted those keys
before receiving a generic invalid-ID reply; its compensation decoder rejects
the same invalid binding, preventing automatic closure. Reject these identities
before registration/unsafe I/O instead. UUIDs and simple keys remain valid; no
new UUID-only restriction. Two tests observed one expected validation failure
before the fix; the positive simple/UUID database-boundary test already passed.

## Final verification and handoff

Final fresh Java21 root verify PASS/exit0: Order584/common12=596 tests,zero
failures/errors/skips, including actual compensation11 and retained live16.
OrderLINE3044/3204=95.01%,BRANCH1543/1878=82.16%; original gates/package pass.
Credit independently126 tests/zero skips/gates pass. Total final Maven cases722.
Logs: target/change158-final-verify.log and
../credit-service/target/change158-credit-verify.log.

Commits: cc9c074 Credit fixture; f6aa6fc wiring/gateway; a6cceee Order source/tests.
Docs/disclosure are recorded in the separate final handoff commit. No push or
user stack/database/cloud mutation.
Existing ignored learning document updated, not force-added. Backend-only
transport scope explicitly approved; public CommandView/frontend unchanged,
so no frontend/browser success is claimed.

Rollout: provision/authenticate result subscription/IAM; map new
ORDER_COMPENSATION_REQUEST_TOPIC to the provisioner's ORDER_CREDIT_COMPENSATION_TOPIC,
and subscribe to CREDIT_COMPENSATION_RESULT_TOPIC. Verify real Google OIDC and
direct/unkeyed mutation boundaries; review old commands/malformed legacy IDs;
enable both services deliberately and run hosted CI/deployment smoke tests.
Defaults remain retry/transport off. Automatic repost remains deferred.
