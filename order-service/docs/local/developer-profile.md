# Current task confirmation ? 2026-11-10

Developer: Yao Xiang (existing session identity). Branch: hfix/penalty-event-ordering. Scope: approved CHANGE-185, Order/User sequenced unified penalty events and required topic wiring. Historical profiles below are retained.

# Current Developer Profile

## Effective confirmation - 2026-11-09

- Developer: Vincent.
- Branch: auto-repost-fix.
- Scope: user-approved automatic repost business-rejection stop policy, tests and one replacement presentation slide (CHANGE-183).
- Authority: explicit "yes" and subsequent request to resume in this chat. Prior developer allocations remain historical; no peer-service reassignment.

## Effective confirmation - 2026-11-01

- Developer: Yao Xiang.
- Branch: hfix/report-service.
- Scope: user-approved CHANGE-170 Report/Order feedback hotfix and CHANGE-171 courier Errand reports, companion frontend and shared bad-attitude penalty policy (2 points).
- Authority: explicit confirmation in this chat; earlier Vincent profile below is historical for another workstream.

## Effective current profile - Vincent, 2026-10-26

- Name: Vincent (Developer 2).
- Branch: feature/vincent-credit-compensation, created from main with explicit
  confirmation in chat on 2026-10-26.
- Scope: approved CHANGE-156/ADR-054 Order compensation-first contract-fixture
  implementation and Credit cooperation handoff. Vincent explicitly selects
  safe previous-assignment restoration for ABORT and fixture implementation with
  live compensation disabled until Credit is verified. Peer backend source and
  cloud resources remain read-only. No blanket reassignment of prior work.
- Historical Yao Xiang allocations and current application behavior are retained.

CHANGE-135 / ADR-045 (Yao Xiang, 2026-10-17) supersedes the earlier overdue
reader: persist deliveryDeadlineAt at courier START plus delivery duration and
deliveredAt at delivery. isOverdue is a nullable timestamp comparison, without
checkpoint queries or a flag-refresh scheduler. Actual delivery freezes lateness;
adminResolutionAt freezes undelivered admin cancellations. Unstarted/unknown
legacy/historical timing stays null. Completion uses those same persisted facts.
V10 adds these timing fields and admin decision/reason/amount/resolution time;
WAIVED and ADDITION_REQUESTED record intent, never subscriber APPLIED. Ordinary
holds still block completion and courier abort; explicit admin cancellation may
resolve held Orders. UI score feedback/callbacks remain deferred. Existing event
payloads/topics/authentication and sibling backends are unchanged. See CHANGE-135.


CHANGE-134 approved2026-10-16: Yao Xiang/current penalty-integration branch;
admin active/held cancellation, all addition cases/highest only, common
COURIER_UNRESPONSIVE=3 and nullable isOverdue. No peer backend/Report UI work.


CHANGE-133 authorization2026-10-15: Yao Xiang on order-service/penalty-integration;
resolve merge and link existing profile Credit history only. No global tab,
sibling backend changes or cloud actions. Current identity below retained.

CHANGE-130 approval, 2026-10-15: Yao Xiang/current penalty-integration branch;
ordinary foc-common penalty policy module and necessary root build/CI/Docker
integration. No authentication or sibling backend implementation extraction.


## Effective current profile - Yao Xiang, 2026-10-14

- Name: Yao Xiang (Developer 1).
- Branch: order-service/penalty-integration.
- Approval: explicit current developer/branch confirmation in chat, 2026-10-14.
- Current scope: approved Order-owned completion-hold placement persistence,
  funding/completion/scheduler guards and requester UI/tests/documents. Forwarded
  requester Firebase identity; own active Order only; release deferred explicitly.
  Report/peer services and cloud provisioning remain read-only.
- This supersedes the current identity below while preserving its history.
- CHANGE-129 scope approved2026-10-14: shared-role User/Supplier active EXISTS
  queries and existing Order supplier missing-name fallback, layout unchanged.
- CHANGE-128 scope also approved2026-10-14: Order-owned +2/+1/-1 penalty enum,
  separate add/deduct event publishers/outbox, Credit events retained and new
  accepted-cancellation publications replaced. Consumer/cloud work not included.
## Historical Admin dashboard profile - Yao Xiang, 2026-10-11

- Name: Yao Xiang (Developer 1).
- Branch: order-service/admin-dashboard.
- Approval: explicit identity/current-branch confirmation in chat on 2026-10-11.
- Current scope: CHANGE-111 mock Admin UI, shared frontend shell/navigation and
  CHANGE-112 refinements and Order-owned sample endpoints/contracts/tests/documentation. Other backend
  services are read-only. No cloud role, real account, schema or peer mutation.
- This supersedes the current identity paragraph below, preserving its history.

## Effective current profile — Vincent, 2026-10-10

- Name: Vincent
- Developer number: Developer 2
- Branch: `sprint-2-3-credit-service-concurrency-update-event-payload`
- Sprint: Sprint 2 and Sprint 3, approved durable command recovery contract-stub slice.
- Assigned scope: Order Service and its shared frontend for CREATE, ACCEPT and
  ACCEPTED-only abort recovery; Order-owned migration, tests and cooperation
  handoff under `concurrency/concurrency-order-credit.md`. Sibling services remain
  read-only. No cloud/deployment changes or service credentials.
- Approval: Vincent explicitly confirmed identity/branch and approved the updated
  plan on 2026-10-10. Separately approved a documented contract-stub milestone with
  live HTTP recovery disabled until Credit implements and verifies the contract.
- UI: pending/disabled until terminal outcome; an explicit recovery control only
  when user authorization is needed. No persisted bearer/refresh tokens.

Current authorization (2026-10-10): Vincent confirms this branch and approves
CHANGE-101 JWT learning and CHANGE-102 merging command recovery into the
minute lifecycle job, recovery -> expiry -> completion. Order-only scheduler,
tests and records; no peer, frontend, schema or live-recovery activation.

## Historical Yao Xiang profile from the integrated checkout

- Name: Yao Xiang
- Developer number: Developer 1
- Sprint: Sprint 2 and Sprint 3, approved compact-event slice and lifecycle failure-isolation fix
- Branch: `order-service/sprint-1/yx-sprint-2-and-3`
- Assigned scope: CHANGE-092 / ADR-031 compact Order refund/completion contracts, compatibility dispatch, tests and documents; CHANGE-093 lifecycle per-task exception/transaction isolation; no sibling implementation.
- Approval: Explicit identity/current-branch confirmation and seven-field Order-only implementation approval, 2026-10-09.

## Historical profile from the integrated checkout (not current identity)


- Name: Vincent
- Developer number: Developer 2
- Sprint: Sprint 2 and Sprint 3 (planning; implementation decisions pending)
- Branch: `sprint-2-3-credit-service-concurrency`
- Assigned scope: Order-owned Sprint 2-3 behavior from D1 and Order Service Overall Doc.pdf, with user-directed lifecycle/history amendments; sibling services remain read-only
- Approval: Explicit user confirmation on 2026-10-08; CHANGE-081

Current task authorization: Vincent explicitly approves the fifth PostgreSQL race,
courier acceptance versus requester OPEN cancellation (2026-10-09, CHANGE-093).
Same test-only scope and harness; both winner orderings, no production/peer edits.

Previous task authorization: Vincent explicitly approves real PostgreSQL four-race
tests on the current concurrency branch (2026-10-09, CHANGE-092). Order test-only
scope; cross-service recovery deferred. No peer/schema/production behavior edits.

Historical task authorization: Vincent explicitly approved the one-time Credit
push-security converter fix and regression tests on 2026-10-09, CHANGE-090,
with an interference Markdown handoff. No other peer/source/cloud changes.
The stable Order-owned allocation above remains unchanged after this exception.

Historical task authorization: Vincent explicitly requested Credit integration
inspection and Order feedback updates on sprint-2-3-credit, 2026-10-09,
CHANGE-087. Documentation-only; no peer implementation or cloud writes.
Prior development branch sprint-2-3 remains historical context.

Current scope extension (2026-10-09): Yao Xiang explicitly requests CHANGE-093 Order lifecycle per-task exception/transaction isolation; this narrow Order-only fix is authorized on the same branch. No other Vincent/peer work authorized.

Current scope extension (2026-10-09): Yao Xiang requests CHANGE-094 Order frontend polling/abort labels/personal status filters and necessary Order query contract; shared frontend allocation recorded.

Current scope extension (2026-10-10): Yao Xiang explicitly requests independent DB-selected scheduled items. CHANGE-096 audits CHANGE-093 and fixes active outbox per-item transactions/error isolation, Order-only; no peer/frontend/schema/configuration writes.


## Current reporting integration ? 2026-10-29

Owner: Yao Xiang; branch feat/reporting-service. User explicitly requests Report frontend/API linking, Report-owned resolution journal/compensation consumer/result outbox, live Order integration, and exclusion of OPEN orders from reporting. Main has now been merged by the user; resolve only the three Report UI conflicts in favor of the approved real APIs. Scope includes the two Order reporting queries/hold validation, shared Report-only configuration, Report/frontend tests and documentation. No sibling business behavior, cloud mutation, commit or deployment is authorized. Verification is in progress.

Current authorized work (2026-11-04): Yao Xiang on hfix/suspended-courier-acceptance. User approves Order/frontend acceptance suspension fix using colleague-provided role-context flag. Earlier branches are historical.

Continued Yao Xiang ownership (2026-11-04), feat/suspend-unsuspend: user-approved Admin suspension UI for ready User endpoints, frontend/source/tests/docs only.


CHANGE-181 (2026-11-09): Yao Xiang continued ownership on hfix/suppplier-not-showing-up. User approves diagnosed frontend Supplier pagination/optional image/types alignment. Initial tree clean; sibling backends/data/config remain read-only. Test-first underway; see changes/CHANGE-181-supplier-catalogue-form-alignment.md.
