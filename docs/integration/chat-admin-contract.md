# Chat / Admin integration contract

Machine-readable review drafts, examples and validation: [contract package](../contracts/README.md).

Status: v1 interfaces are implemented for Chat, Admin, User, Order and Credit. The live local
acceptance flow verifies reporting eligibility, case claim, a complete reconciled timeline and
idempotent participant-conversation creation. XueTing reviews Order evidence ownership and Jun Hui
reviews broker/deployment changes. See [Admin spec](admin-service-spec.md) and
[Kafka actions](admin-command-contract.md).

The complete [Chat blueprint](../../chat-service/README.md) covers public messaging, images,
translation and pending participant-history policy. The [Notification blueprint](../../notification-service/README.md)
consumes the same proposed Order lifecycle schema; approve that producer schema once for both.

## Security and service calls

Admin calls Chat using private service DNS over HTTP(S), not gateway public routes. Production
uses TLS. Browser calls use gateway. User JWT must match current RS256/issuer/audience/time/sub
contract and selected role REQUESTER, COURIER or ADMIN. Do not use the obsolete USER-only model.

Proposed service identity: separate RS256 assertion, issuer foc-service-auth, sub service name,
aud receiving service, exp <=60 seconds, kid/jti required. Receivers pin allowed public keys via
deployment secrets/config; never reuse User's signing key. Authorization carries service token;
X-Actor-Token carries original user JWT for HTTP delegation. Validate both, never log them.

User-owned proposed GET /internal/users/{userId}/admin-eligibility accepts Admin/Chat/Credit
service identity and returns userId, active, administrator from persisted state. Check current
eligibility on privileged actions/reads and before queued financial effects; fail closed/retry
if User unavailable. No caller-supplied role boolean or indefinite cache grants access.

Admin-owned proposed GET /internal/admin/cases/{caseId}/access?actorId=&participantId= accepts
Chat service identity. Returns orderId, state, reviewerId, allowed participant IDs and read/write
permissions after current access checks. Chat uses this for case evidence/conversations, not
pre-case report eligibility (avoids circular case creation). Service ACLs do not replace actor checks.

Do not hold a case/permission DB lock while calling the other service. Case-access verification
must not itself request Chat evidence; resolve gathers evidence before its final locked state/
revision check. Set bounded outbound timeouts and propagate 503/UNKNOWN rather than recurse.

## Proposed Chat APIs

| Method/path | Caller and outcome |
| --- | --- |
| GET /internal/chat/orders/{orderId}/report-eligibility?userId= | Admin plus reporter JWT; userId equals actor sub; eligible, coverage, evidenceRevision |
| GET /internal/chat/cases/{caseId}/timeline?cursor=&limit= | Admin plus active admin JWT; case/order, snapshot, participants, records, coverage, nextCursor |
| POST /internal/chat/cases/{caseId}/conversations | Admin plus reviewer JWT; body participantUserId, Idempotency-Key; returns conversationId, caseId, participantUserId, readOnly |

Timeline records contain eventId, source, sourceSequence where present, orderId, action,
actorUserId or null, occurredAt, ingestedAt and approved redacted data. Participants include
requester and historical courier IDs with assignment periods. Stable sort: occurredAt, source,
sourceSequence, eventId; preserve both timestamps. Cursor pins evidenceRevision; page default 20,
max 100. Problem Details: 401/403 authentication/access, 404 hidden case, 409 key conflict,
503 required dependency unavailable. Empty records does not prove complete evidence.

Coverage: status COMPLETE/INCOMPLETE/UNKNOWN, asOf, checkpoints and blockingGaps. COMPLETE means
complete through explicit producer checkpoints, not necessarily current forever. Missing sequences,
failed ingestion/backfill or unavailable checkpoint means no completeness claim. Resolution needs
a fresh evidence read, not a browser-provided flag. Relevant Order, Credit and Admin streams require
producer checkpoints; User sanction coverage uses case/operation lookup, not global User versions.

One conversation per (case, historical participant), unique in Chat DB. Same idempotency key/body
returns same result; mismatch conflicts. Only reviewer and that participant may send while case
UNDER_REVIEW. Active authorized admins may review history. RESOLVED makes case chats read-only;
normal errand-chat terminal state does not lock an unresolved case conversation.

Chat owns public message/history/upload schemas and WebSocket delivery. Retain D3 text/images,
S3 attachments, original text, Amazon Translate, Redis translation cache and asynchronous retry.
Publish Chat OpenAPI before Admin UI consumes it. RabbitMQ may be used internally for Chat STOMP
fan-out and directed translation jobs, but must not duplicate Kafka lifecycle events or expose
broker credentials to browsers. Admin continues to use the documented HTTP and Kafka contracts.

## Event coverage and persistence

Chat uses its own consumer group chat-service-timeline, never Credit/Order/Notification groups.
Retain the [core blueprint](event-communication-blueprint.md); credit-triggering Order events
alone omit accepted/withdrawn/pickup/delivery and cannot reconstruct the required timeline.

| Producer/topic | Coverage | Owner |
| --- | --- | --- |
| Order / order.lifecycle.events | Full transitions, assignments including withdrawn courier, detail snapshots | XueTing |
| Credit / credit.events | Existing order-linked ledger outcomes | Eldridge |
| Admin / admin.events | CaseOpened, CaseClaimed, CaseActionCompleted, CaseResolved | Darryl |
| Credit / credit.admin.events | Case-linked correction results | Eldridge |
| User / user.admin.events | Case-linked sanction results | Darryl |

Proposed Order lifecycle fact data: orderId, requesterId, previousCourierId, courierId, fromState,
toState, action, sourceSequence, snapshot. Snapshot includes title, description, reward, deadline,
stored pickup/dropoff names and IDs. Preserve previousCourierId after assignment clearing. Include
initial and detail-update facts. Reuse an existing equivalent schema; otherwise version/approve
its extension before implementation. Do not rename an existing deployed event silently.

Use core envelope conventions; new facts have own event catalogue. Order facts aggregate Order/key
orderId; Admin facts AdminCase/key caseId. SourceSequence is contiguous per producer stream and
aggregate, separate from entity aggregateVersion (not every version emits evidence). No global
ordering across topics. Never discard a delayed historical fact solely for having an older version.

Producer commits history + outbox atomically. Chat commits inbox + projection before Kafka ack.
Same eventId/content is duplicate; changed content is conflict. Evidence append-only; preserve
unprocessable records after bounded retries/DLT, expose gaps and monitor lag/failures.

Producer-owned backfill/checkpoint API proposal: GET /internal/{orders|credits|admin}/orders/{orderId}/evidence?cursor=;
Admin also scopes by caseId. Authenticated Chat only; consistent snapshot cursor, stable original
record IDs/sequences and latest committed source checkpoint. Credit export includes all relevant
committed ledger effects; Admin export its case history. Chat reuses source IDs for replay/import.
Missing historical facts require an explicit incomplete baseline, never fabricated participants.
Owners publish exact OpenAPI schemas and deterministic fixtures before dependent implementation.

Acceptance: historical courier eligibility, source gaps, duplicate/conflict, delayed records,
backfill/live overlap, consumer outage, irrelevant private-data exclusion, source checkpoint
unavailable, cross-case access, separate participant chats and resolved read-only history.

## Integration completion refinements — 9 November 2026

Darryl explicitly approved the following bounded refinements for this iteration. Admin is the
caller/recovery owner; Chat owns its storage and write barrier; User remains authoritative for
current accounts. Affected owners still review the concrete shared deployment diff before rollout.

- `GET /internal/chat/cases/{caseId}/conversations?participantUserId=` is a read-only recovery
  lookup authenticated as Admin with the original actor in `X-Actor-Token`. Chat rechecks current
  Admin/User access and returns the existing conversation reference only. Authorized absence is
  404; unavailable dependencies are 503. It creates no state and never substitutes for initiation.
  Admin reconciles the reference under its own case lock after rechecking authorization. Reads
  preserve the conversation identity, including after case closure; retries cannot create a thread.
- Timeline cursors pin a Chat-persisted immutable snapshot for ten minutes. Each page rechecks
  current access, preserves its original revision/coverage, and returns 409/restart after expiry.
  A new first-page read performs fresh producer reconciliation. A producer-confirmed empty stream
  is a valid zero checkpoint; a missing producer/checkpoint remains incomplete.
- Resolution has a durable Admin preparation operation identified by the original request key
  and bound to actor, case, revision and normalized decision/explanations. Preparation checks fresh
  complete evidence and terminal actions under the case lock. While prepared, Admin denies new
  reports/actions/conversation writes and exposes pending closure to the reviewer. It does not
  yet claim RESOLVED or emit CaseResolved. Existing reads remain authorized as before.
- `POST /internal/chat/cases/{caseId}/closure` carries `{operationId}` plus Admin service identity
  and the current reviewer actor. Chat verifies that the current Admin callback names that same
  prepared operation, serializes creation with its case barrier, drains existing message/upload
  transactions and commits its durable read-only barrier before returning
  `{caseId,operationId,readOnly:true}`. Message writes recheck this barrier under the conversation
  lock. Duplicate matching operations return the same acknowledgement; another operation conflicts.
  Per-actor denial never closes the whole thread, and Order terminal events affect ERRAND threads only.
- Admin commits its immutable decision and CaseResolved outbox only after that acknowledgement
  and a final local revision/action/evidence check. All HTTP calls occur outside case/conversation
  locks. An outage or lost response leaves preparation visible and retryable with the same key;
  it does not reopen writes, invent success or allocate another operation. Admin owns resumption;
  Chat retains the barrier. Operation/case IDs and bounded errors provide observability without
  logging tokens, decision text or private messages. Rollback of images cannot undo a prepared
  closure or emitted business event; use the original operation to reconcile it.

Darryl also approved Chat-only repeatable reads at
`GET /internal/users/admin-operations/{operationId}` and
`GET /internal/credits/admin-operations/{operationId}`. They return the owner's immutable
original outcome envelope, 404 for no durable result and 503 for unavailable storage. Existing
RS256 service identity, audience and pinned trust apply; the User route additionally restricts
the caller to Chat. Admin's evidence export includes its stored `ownerEventId` and action owner.
Chat verifies operation/case/order/target/actor/result/event identity and records a blocking gap
for absent or conflicting results. It never reads producer databases. Operation-scoped outcome
records use `sourceSequence: 0` to indicate that no global User/correction sequence is claimed;
completeness is reconciled per completed operation, independently of the Order/Credit/Admin
stream checkpoints. Read retries create no business effect. Chat owns retry/backfill and reports
source/stream/case gap metadata; original outcome and operation IDs provide observability.

General account and selected-role authorization is defined by the approved
[current authorization contract](current-authorization.md). The compatibility Admin eligibility
endpoint remains private and retains its existing caller ACL.

## Report review continuation — 10 November 2026

The [approved dispute review contract](dispute-review-contract.md) extends this protocol with verified nonreporter membership, original message/image evidence, durable errand review barriers and explicit reserved-credit finalization. Its review-specific behavior supersedes earlier reporter-only gates; assignment-epoch privacy and producer ownership remain in force.
