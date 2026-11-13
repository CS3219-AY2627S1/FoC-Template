# Admin Service specification

Machine-readable review drafts, examples and validation: [contract package](../contracts/README.md).

Deployment prerequisite: the latest Kubernetes default-deny policies do not permit new N2H
connections. Follow the contract package's caller/destination matrix in the nominated deployment
iteration, including both ingress and egress. Do not interpret a timeout as an application rejection.

Status: product decisions agreed; v1 integration designs proposed for owner review. Documentation
only, not implemented endpoints. Editor Darryl; reviewers Eldridge (Chat/Credit), XueTing
(Order/Notifications), Jun Hui (broker/gateway). This spec supersedes conflicting proposals in
the earlier generated Admin PDF; it does not override existing core event schemas.

## Reading order and ownership

Read this spec, [Chat integration](chat-admin-contract.md), then
[Kafka administrative actions](admin-command-contract.md). The source requirements are the D3
presentation slides 10-14, earlier D1 backlog, and subsequent confirmed decisions in this task.

Darryl owns a new `admin-service/` backend, frontend and private PostgreSQL database. Use Java 17,
Spring Boot/Maven Wrapper, Flyway, Actuator, OpenAPI and React/TypeScript/Vite. Assign runtime
ports in the nominated deployment change after checking collisions. Existing User/Supplier
administration stays with its owner; Admin links to those screens instead of duplicating them.

Browser -> Gateway -> Admin; Admin -> Chat by authenticated private HTTP(S). Chat builds evidence
from Kafka. Admin -> Credit/User effects use Kafka commands and outcomes. Admin owns cases,
statements, reviewer, revision, decisions, action tracking, audit and inbox/outbox. Chat owns
messages/timeline; Credit owns ledger; User owns accounts; Order owns lifecycle/assignment facts.
No service reads another service's database. No separate Logging Service is planned.

## Required behaviour

- A verified requester or historically assigned courier can submit orderId and nonblank issue.
  Derive identity from JWT sub; establish eligibility using trusted Chat-projected Order evidence.
  Missing/incomplete eligibility evidence fails closed without creating a case.
- One case per order, one statement per reporting participant. Retrying the same request does not
  duplicate it. Another participant joins the existing case; another statement from the same
  participant conflicts. Resolved cases reject further reports.
- States: OPEN -> UNDER_REVIEW -> RESOLVED. Any active admin in effective ADMIN mode may claim
  OPEN; claim assigns that reviewer atomically. Only reviewer initiates decisions/conversations
  or resolution. Other active admins may read for review. No reassignment/reopening in this release.
- Show order snapshot, historical assignments, paginated timeline, known gaps/checkpoints and
  private case conversations. Each participant sees only their own conversation with reviewer.
  A historical courier conversation targets the courier involved, never an arbitrary account.
- Reviewer may add/subtract nonzero whole credits for a case participant, with reason. This is
  independent issuance/removal, not a balanced transfer. Credit rejects negative resulting
  available balance and leaves reserved credits unchanged.
- Reviewer may request reversible ban of a case participant, with reason. User preserves self-ban
  and final-active-admin protections. Reactivation reuses User administration with reason/audit;
  it never rewrites an earlier resolved case.
- Resolve only UNDER_REVIEW with reason, fresh evidence without known blocking gaps, and all
  actions confirmed (none PENDING/UNKNOWN). Explain any rejected actions; no-action resolution is
  allowed. Resolved decisions are immutable; no further actions/reports. Case chat becomes read-only.
- Participant view exposes own report, case status and own conversation, not internal notes,
  other statements, administrative evidence or the other private conversation.

## Proposed Admin HTTP contract

All public paths are gateway-routed and producer-owned by Admin. UUID identifiers, UTC ISO-8601
timestamps, Problem Details. Page/size default 20/max 100. Proposed description/reason/resolution
limit: trimmed 1-2000 characters. Every mutation requires Idempotency-Key UUID; retain actor,
route, canonical body hash and original outcome. Same key/different request is 409.

| Method/path | Behaviour | Caller |
| --- | --- | --- |
| POST /api/admin/reports | Body orderId, description; create statement/case, 201 | Eligible participant |
| GET /api/admin/orders/{orderId}/report-context | Own report pointer/safe status, or Chat-verified eligibility; unavailable is 503, never absence | Active participant mode |
| GET /api/admin/reports/{caseId} | Own statement and safe status | Reporting participant |
| GET /api/admin/cases?status=&query=&page=&size= | Queue/filter; query case/order UUID | Active ADMIN |
| GET /api/admin/cases/{caseId} | Case detail and evidence availability | Active ADMIN |
| POST /api/admin/cases/{caseId}/claim | expectedRevision; atomic claim | Active ADMIN |
| GET /api/admin/cases/{caseId}/timeline?cursor=&limit= | Proxy permitted Chat evidence | Active ADMIN |
| POST /api/admin/cases/{caseId}/conversations | participantUserId; existing/new conversation | Reviewer |
| POST /api/admin/cases/{caseId}/actions | type CREDIT_ADJUSTMENT/BAN, targetUserId, reason, amount for credit; 202 with operationId | Reviewer |
| GET /api/admin/cases/{caseId}/actions/{operationId} | Persisted action outcome | Active ADMIN |
| POST /api/admin/cases/{caseId}/resolve | resolution, expectedRevision | Reviewer |

Resolution implementation refinement approved by Darryl: resolve additionally accepts optional
`rejectedActionExplanations`, an array of `{operationId, explanation}`. Admin requires an exact
match to the case's rejected actions; explanations are trimmed 1–2000 characters. A fresh
server-side Chat timeline read must have COMPLETE coverage, no blocking gaps, coverage/checkpoints
within the configurable 60-second maximum age, and cover Admin's current committed case sequence.
The immutable private decision retains the evidence revision/coverage and rejected-action
explanations; the existing CaseResolved event carries no private reason or explanation.

Unique constraints: orderId and (caseId, reporterId). Lock case for claim/action/resolve; reject
stale revision and closure races. 401 invalid identity; 403 disallowed action; 404 hidden/missing
resource; 409 state/revision/duplicate conflict; 503 required evidence/authorization unavailable.
Do not roll back accepted Kafka actions because a browser disconnects. UI must show pending and
unknown outcomes and poll action status rather than blindly resubmit.

## Team handoffs and implementation order

| Owner | Implement | Exclusions |
| --- | --- | --- |
| Darryl | Admin backend/UI/case audit; User eligibility/sanction consumer | Chat storage, Credit balances |
| Eldridge | Chat timeline/conversations/APIs; Credit correction consumer | Admin case state, User bans |
| XueTing | Order complete lifecycle/assignment events and historical evidence | Timeline DB, financial effects |
| Jun Hui | Kafka ACL/topics/replay/monitoring; nominated gateway/Compose/CI editor | Domain decisions |

Notifications retain D3 scope. Case notifications are deferred: no invented event recipients or
new Notification commitment. Chat handles message delivery; participants retrieve case status.
Translation stays with Chat's D3 design. Shared deployment changes need all affected reviews;
required Compose variables must propagate to env examples, CI and Kafka smoke checks together.

Use `$foc-iterate-feature` with one outcome at a time, in this dependency order:

1. Owners review contracts; publish schemas/fixtures before independent adapters.
2. `admin-service-foundation`: backend/database/frontend and protected dashboard shell.
3. `admin-service-reporting`: live report/status GUI once Chat eligibility is available.
4. `admin-service-review`: queue, concurrent claims and case detail GUI.
5. `admin-service-evidence`: live timeline/completeness/unavailable states.
6. `admin-service-conversations`: isolated reviewer-participant chats.
7. `admin-service-actions`: durable Kafka effects and pending/outcome GUI.
8. `admin-service-resolution`: close guards and immutable resolution/read-only chat.
9. `admin-service-acceptance`: integrated real-broker demo and applicable CI/docs.

Acceptance: unrelated user denied; historical courier allowed; one case/statement under races;
one concurrent claim; reviewer-only mutation; insufficient debit rejected; reserved balance
unchanged; duplicate/replayed action has one effect; self/final-admin protected; owner/Chat outage;
actor revoked while queued; no closure over unknown actions or known evidence gaps; resolved
chat read-only. Apply D3 timeline recovery/privacy criteria. Earlier draft performance numbers
remain proposals pending ratification; do not present them as approved commitments.
