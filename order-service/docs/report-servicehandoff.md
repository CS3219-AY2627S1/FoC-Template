# Report resolution saga contract — CHANGE-162

Owner: Yao Xiang, 2026-10-29. **Order implementation is a disabled contract stub. Report Service is absent here.** Report-owner implementation and end-to-end verification are required before activation. No Report backend or GCP resource changed.

## Approved Report behavior — CHANGE-163 (2026-10-29)

Yao Xiang confirmed the response deadline is required so the courier has time to justify the delivery. This supersedes earlier no-deadline guidance. These are documented peer/UI requirements, not claims of implemented Report code or a changed local prototype.

| Requirement | Required behavior |
|---|---|
| Response window | Persist and expose responseDeadlineAt, set by Report Service at creation. Keep AWAITING_COURIER_RESPONSE before the deadline unless the courier responds. At/after the deadline, reconcile to READY_FOR_REVIEW even without a response; late responses are rejected. Report owns server time and durable status reconciliation; browser polling is not the authority. |
| Courier response | Only the recorded courier; one explanation/evidence submission before the deadline while unresolved. Successful submission records respondedAt and moves to READY_FOR_REVIEW. |
| Early admin resolution | Admin may resolve AWAITING_COURIER_RESPONSE as well as READY_FOR_REVIEW. Before resolving a still-awaiting report, the UI must warn: “The courier has not responded and their response deadline has not passed. Are you sure you want to resolve this report?” Cancel sends no mutation; confirm uses the normal Order-owned saga. This is a UI confirmation, not an authentication bypass or a new request field. |
| Admin reply | Required nonblank reply (1..2000), persisted with resolvedBy and resolvedAt. Suggested Report field name resolutionNote; the existing Order saga request calls it reply. Return the reply only to the submitter and authorized admins, never the reported courier. |
| Violation category | Unresolved. Keep the existing broad ReportCategory proposal; no new violation enum, category mapping or penalty rule is approved by this clarification. |

The supplied code's resolved(at) currently refuses AWAITING_COURIER_RESPONSE; the Report owner must adjust that guard to permit authorized early resolution. Keep reconcile(at) and the deadline-based response rejection. Deadline duration must be consistent between creation/configuration, returned timestamp and error text; the supplied error mentions24 hours, but the creation calculation was not provided. This clarification does not select a different duration.

Status transitions: awaiting → ready when a timely courier response is saved or the deadline passes; either awaiting or ready → resolved by admin (warning/confirmation when still awaiting). Concurrent response, deadline reconciliation and resolution must be atomic or revision-checked so a stale writer cannot overwrite a resolution. After RESOLVED, reject a new courier response.

Report remains responsible for implementing the saga protocol below: same-command deduplication, atomic resolution + operation journal with previous state/reply and resulting revision, conditional compensation, generation fencing and durable result publication. Compensation of early resolution must restore the real prior state, not always READY_FOR_REVIEW. If the original deadline has since passed, apply normal deadline reconciliation without erasing newer work. Never overwrite a newer response/resolution; return RECONCILIATION_REQUIRED when safe restoration is impossible. Resolving a report does not itself select a penalty or complete/cancel the Order.

Acceptance checks for the Report owner: response just before/exactly at deadline; no-response readiness; early-resolution warning confirm/cancel; required/private admin reply; concurrent response versus resolution; exact command replay; lost reply/local rollback/late original; restoring an early resolution without reopening a passed response window; duplicate/conflicting compensation results. Current fixtures do not verify these Report/UI behaviors.

## What Order provides

| Endpoint | Authentication / behavior |
|---|---|
| `POST /api/orders/admin/{orderId}/reports/{reportId}/resolve` | Firebase admin; body `{"commandId":"stable-key","reply":"Investigation result"}`. 200 after confirmed Report resolution and local hold-release commit; 202 while recovering. Exact retry returns saved state/result; changed payload with same key409. |
| `GET /api/orders/admin/report-resolutions/{commandId}` | Firebase admin; saved command/report/order/status/reason and successful Order snapshot, if any. |
| `POST /api/orders/internal/report-resolution-compensations` | Dedicated Pub/Sub Google OIDC identity/audience and exact result subscription. Base64 push envelope; 204 only after inbox/journal commit or identical duplicate. |

Other statuses:400 invalid fields/envelope;401 missing/invalid identity;403 non-admin;404 missing Order/hold/command;409 changed binding, row contention or contradictory result;503 persistence/role dependency unavailable. Resolve returns409 for final REJECTED or COMPENSATED; GET retains details. RECONCILIATION_REQUIRED remains unresolved (202), requiring operator action rather than a new command.

The existing direct `PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release` rejects409 while coordination is enabled. Independently of that flag, persisted unresolved Report work blocks manual release. Other active report holds remain; release itself emits no funds/penalty event. START/PICKUP/DELIVER continue; ordinary completion/refunds/abort penalties stay paused. Existing explicit admin cancellation remains separate.

## Report endpoint to implement

**Proposed:** `PUT /api/reports/internal/order-resolutions/{commandId}`, without callback into Order. Order forwards the resolving admin's Firebase token; Report must verify it, active-admin role, report/participant binding and allowed state.

```json
{"commandId":"resolve-K","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":1,"reply":"Evidence reviewed; the issue is resolved."}
```

Return200 with the same IDs and generation1 plus `outcome:"APPLIED",code:"RESOLVED"` only after durable commit. Definite rejection may return the same bound object with `outcome:"NO_EFFECT"` and a short code. Bare HTTP errors/timeouts/malformed replies are uncertain and lead to compensation, never hold release. `courierId` may be null. ID limits: command/report/requester/courier/admin128, Order36; reply1..2000 characters (Order strips surrounding whitespace).

Atomically journal the operation's input binding, prior report state/reply and resulting revision with the RESOLVED update. Exact retries return the saved decision; changed bindings conflict. Preserve newer admin work. Admin reply is private to submitter/reviewing admins. No token is stored in Order journal/events.

## Report compensation consumer and result producer

Suggested topics: `report-resolution-compensation-{local|dev|prod}-v1` (Order → Report) and `report-resolution-compensation-result-{local|dev|prod}-v1` (Report → Order). Nothing is provisioned; staging uses dev, production prod. Configure explicit topics/subscriptions and dedicated push identities.

Request body, exactly eight fields:

```json
{"eventId":"33333333-3333-3333-8333-333333333333","commandId":"resolve-K","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":2}
```

Attributes: matching `eventId`, `eventType=ReportResolutionCompensationRequested`, `eventVersion=1`. Order deterministically generates the ID from type plus globally bound command key, saves immutable payload in its outbox and reuses it. Google messageId is not the business deduplication key.

Report must atomically:

1. Deduplicate event/operation and verify all IDs, recorded admin and generation. Broker identity authorizes compensation; adminId is audit binding. Background reversal does not need an expired Firebase token.
2. Fence generation1 of this command. If it never executed, persist a tombstone preventing delayed HTTP execution.
3. Restore only this operation's preimage if its resulting revision remains current, including the previous reply. Never blindly set reports to OPEN or overwrite newer resolutions. Report owns its exact statuses/revisions.
4. Save a stable result/outbox with restore/fence. ACK only after durable decision. Duplicate requests republish that saved result. Newer revision conflicts require reconciliation.

Result body:

```json
{"eventId":"44444444-4444-4444-8444-444444444444","compensationId":"33333333-3333-3333-8333-333333333333","commandId":"resolve-K","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":2,"outcome":"COMPENSATED","code":"REVERSED"}
```

Attributes: matching eventId, `eventType=ReportResolutionCompensationResult`, `eventVersion=1`. Success codes: REVERSED or FENCED_NO_EFFECT; no-effect contradicting confirmed APPLIED is rejected. Unsafe outcomes use RECONCILIATION_REQUIRED with bounded explanation code (1..80). Reused event IDs cannot change content. Order atomically deduplicates with its journal update. Broker ACK never means compensation completed. The hold remains active after COMPENSATED; an admin can then safely start a new command.

## Sequence and recovery

```mermaid
sequenceDiagram
    actor Admin
    participant Order
    participant DB as Order PostgreSQL
    participant Report
    participant PubSub
    Admin->>Order: Resolve (commandId, reply)
    Order->>DB: Commit PENDING + binding + lease; retain hold
    Order->>DB: Commit possible_effect before HTTP
    Order->>Report: Synchronous resolve generation1 + admin token
    Report-->>Order: Committed APPLIED result
    alt Final local transaction commits
        Order->>DB: Release this hold + SUCCEEDED + saved result atomically
        Order-->>Admin: 200; exact retries reuse result
    else Failure/uncertainty before local success
        Order->>DB: Commit COMPENSATING generation2 + outbox
        Order->>PubSub: After-commit compensation
        PubSub->>Report: At-least-once restore/fence
        Report->>Report: Conditional restore/tombstone + result outbox
        Report->>PubSub: Committed compensation result
        PubSub->>Order: Authenticated result push
        Order->>DB: Inbox + COMPENSATED or reconciliation
        Note over Order,DB: Hold stays active
    end
```

No lock spans HTTP. Leases use DB time (120seconds; HTTP timeout at most60seconds). Existing minute lifecycle pass selects at most20 due journal IDs in SQL; each item uses its own transaction/catch. Expired PENDING with possible effect chooses compensation rather than repeating an unauthenticated mutation. Crash before possible effect rejects without an event. Recovery rereads committed success: lost success responses never undo released Orders. PUBLISHED compensation may be rearmed after30seconds with the same ID; FAILED after the existing ten-attempt publication bound remains for explicit operator redrive. Reconciliation stays held. Agree operation/tombstone/dedup retention and monitoring before rollout.

## Activation and migration

Default `ORDER_REPORT_RESOLUTION_ENABLED=false`. Activation needs REPORT_SERVICE_URL, timeout, request/result topics, result subscription, push audience/account and normal project/credentials. Settings are in `.env.example`; unsafe/incomplete settings fail startup. Unsigned emulator push is limited to explicit local demo Auth/PubSub emulators. Cloud verifies Google signature/time/issuer/audience/verified-email/account separately from Firebase user auth.

V18 adds `order_report_resolutions` and `order_report_resolution_results`; V1–V17 stay immutable. It does not freeze hold-placement snapshots or fabricate Report records. Normal Flyway applies it on next deployment. Preserve journals/outbox/holds on rollback; disabling transport does not reconcile pending work. Do not roll back to a binary lacking journal release guards with pending work. Reports UI remains local sample/cloud Coming soon.

Acceptance gates: actual Report journal/revision/fence implementation; authenticated delivery; lost HTTP response/local rollback/delayed original/lost or duplicate result/newer revision tests; IAM/subscription/retry/dead-letter setup; operator reconciliation runbook. Current PostgreSQL/HTTP/broker fixtures verify only Order's contract stub.


## Implemented peer and eligibility amendment ? CHANGE-166

Reporting Service is now present and implements the contracts above; see ../../reporting-service/HANDOFF.md and ../../reporting-service/docs/order-resolution-saga.md. The approved latest eligibility excludes OPEN and terminal Orders from the active reporting list and locked hold endpoint. Report always sends requireAssignedCourier=true. Current snapshot retry remains unchanged. Admin frontend uses real APIs, including the early-response warning and required private reply. The prior absent-provider/sample-only descriptions are historical. Default-off cloud activation, identity/subscription/index provisioning and creation-hold recovery remain separate gates.
