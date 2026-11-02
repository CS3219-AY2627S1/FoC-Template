# Order / Report resolution saga

Owner: Yao Xiang, 2026-10-29. AI implementation assistance: OpenAI Codex. Source/verification review remains a human responsibility.

## Bound synchronous operation

Order calls `PUT /api/reports/internal/order-resolutions/{commandId}` with the resolving admin's Firebase token. Report verifies the token, active admin role, route/body command ID and admin subject. The request is:

```json
{"commandId":"resolve-1","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":1,"reply":"Evidence reviewed; the report is resolved."}
```

IDs are bounded to 128 characters (Order ID 36); reply is nonblank and at most 2000. Report matches the report/order/requester/courier binding. ORDER/COURIER hold reports require an assigned courier; historical nullable couriers remain readable. Optional completed-order CREDITS links are context only: they resolve locally, do not enter the Order coordinator and never release a hold.

One Firestore transaction writes RESOLVED/private reply/actor/time, increments the Report revision, and stores the operation input binding, previous document, resulting revision and decision. Exact retries return that decision. Reusing a key with another binding/reply conflicts. Missing/mismatched/already-resolved records produce a durable NO_EFFECT decision; they do not release a hold. Compensation fences delayed generation 1 even when the original call never arrived.

Committed response contains the same six IDs and generation 1, with `outcome: APPLIED, code: RESOLVED`, or `outcome: NO_EFFECT` and a rejection code. It contains no callback into Order.

## Compensation request

Topic: `report-resolution-compensation-{dev|prod}-v1`. Exact eight-field body:

```json
{"eventId":"33333333-3333-3333-8333-333333333333","commandId":"resolve-1","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":2}
```

Attributes are matching `eventId`, `eventType=ReportResolutionCompensationRequested`, `eventVersion=1`. Report accepts a base64 Pub/Sub push envelope only for its configured full subscription path. Extra/missing fields, invalid types/generation/IDs or attributes return 400. Conflicting reused IDs/bindings return 409. Transient storage failures return 503. The push identity is independent of user Firebase authentication; adminId is audit binding, not background authorization.

The consumer atomically deduplicates, fences the command, and either restores its own preimage if the resulting revision is still current, creates a no-effect tombstone if the command did not apply, or records RECONCILIATION_REQUIRED without overwriting newer work. Restoration preserves the original response deadline and reconciles an expired deadline to READY_FOR_REVIEW. It never grants a fresh response window.

## Compensation result

The same transaction stores the immutable result outbox. Topic: `report-resolution-compensation-result-{dev|prod}-v1`. Exact eleven-field body:

```json
{"eventId":"44444444-4444-4444-8444-444444444444","compensationId":"33333333-3333-3333-8333-333333333333","commandId":"resolve-1","reportId":"report-1","orderId":"order-1","requesterId":"requester-1","courierId":"courier-1","adminId":"admin-1","generation":2,"outcome":"COMPENSATED","code":"REVERSED"}
```

Attributes: matching eventId, `eventType=ReportResolutionCompensationResult`, `eventVersion=1`. The stable result UUID is derived from the compensation ID. Success codes are REVERSED and FENCED_NO_EFFECT; unsafe restoration uses RECONCILIATION_REQUIRED / NEWER_REPORT_REVISION. Google messageId is not the business deduplication key.

Report ACKs after durable compensation/result intent, even if publication is temporarily unavailable. It immediately attempts publishing outside the transaction; a minute recovery query fetches at most 20 due outbox records. Each record is claimed in a separate transaction with a 120-second owner-fenced lease. Publication waits for broker confirmation; failures back off, and ten failures retain FAILED for operator investigation. A duplicate request rearms an already-published/failed saved result without reversing the Report again. Order's existing compensation request redrive can request that same result again.

## Data and observability

- Existing `reports` gains optional resolutionNote/resolvedBy and a revision updated by Report mutations. Old revisions default to 0; no SQL migration is added by Report.
- `report_order_resolutions` holds command bindings, decisions, preimages, resulting revisions and generation fences.
- `report_resolution_results` is the compensation dedup/result outbox with payload, state, lease owner, attempts and nextAttemptAt.
- Success/failure logs contain eventId, commandId/outcome or outbox ID/attempt. Tokens and private replies are excluded from these application log messages and events.
- Monitor PENDING/PUBLISHING age, FAILED results, RECONCILIATION_REQUIRED and Order COMPENSATING age. No new production dashboard or alert provisioning is claimed.

```mermaid
sequenceDiagram
  actor Admin
  participant Order
  participant Report
  participant Broker as Google Pub/Sub
  Admin->>Order: Resolve (stable commandId, reply)
  Order->>Order: Commit intent and possible-effect marker; retain hold
  Order->>Report: Resolve generation 1 + admin token
  Report->>Report: Commit report, preimage, revision and decision atomically
  Report-->>Order: APPLIED
  alt Order final commit succeeds
    Order->>Order: Release this hold + save SUCCEEDED atomically
    Order-->>Admin: 200
  else Failure or uncertain commit
    Order->>Broker: Durable generation 2 compensation
    Broker->>Report: Authenticated push
    Report->>Report: Restore/fence + stable result outbox atomically
    Report->>Broker: Durable compensation result
    Broker->>Order: Authenticated result push
    Order->>Order: Dedup + COMPENSATED / reconciliation; hold stays active
  end
```

## GCP topics and identities

Create these topics in the existing project:

```text
report-resolution-compensation-dev-v1
report-resolution-compensation-result-dev-v1
report-resolution-compensation-prod-v1
report-resolution-compensation-result-prod-v1
```

Staging uses dev; production uses prod. Order's runtime identity publishes to the request topic; Reporting's runtime identity publishes to the result topic. Each environment needs a request push subscription to `/api/reports/internal/order-resolution-compensations` and a result push subscription to `/api/orders/internal/report-resolution-compensations`. Use dedicated verified Google push service accounts/audiences, Cloud Run invoker grants, Pub/Sub token minting permissions, and appropriate retries/dead-letter handling. Topic creation alone does not wire delivery.

Report configuration is documented in root `.env.example`: REPORT_RESOLUTION_ENABLED, REPORT_PUBSUB_PROJECT_ID, REPORT_RESOLUTION_RESULT_TOPIC, REPORT_RESOLUTION_COMPENSATION_SUBSCRIPTION (full path), REPORT_RESOLUTION_PUSH_MODE, REPORT_RESOLUTION_PUSH_AUDIENCE, REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT, REPORT_RESULT_RECOVERY_CRON and REPORT_RESPONSE_RECOVERY_CRON. Cloud mode verifies Google signature/timestamps/issuer/audience/verified email and configured account. Unsigned push is allowed only with explicit emulator mode, local environment, demo project and Auth/PubSub emulator settings.

Order must configure ORDER_REPORT_RESOLUTION_ENABLED, REPORT_SERVICE_URL, ORDER_REPORT_RESOLUTION_TIMEOUT, ORDER_REPORT_COMPENSATION_TOPIC, REPORT_COMPENSATION_RESULT_TOPIC, ORDER_REPORT_COMPENSATION_RESULT_SUBSCRIPTION (ID), ORDER_REPORT_COMPENSATION_PUSH_MODE, ORDER_REPORT_COMPENSATION_PUSH_AUDIENCE and ORDER_REPORT_COMPENSATION_PUSH_SERVICE_ACCOUNT. See its own handoff for details. Keep both flags false until provisioning/verification is complete.

## Reproducible isolated integration

Package both services using their Maven wrappers. From the repository root, set JAVA_HOME and ORDER_INTEGRATION_JAR to a packaged contract-capable Order jar, then run:

```powershell
node reporting-service/scripts/test-order-resolution-integration.cjs
```

The harness starts actual Report and Order applications plus disposable PostgreSQL, Firestore and Pub/Sub emulators, using only synthetic identities/data. Other User/Supplier/Credit adapters are explicitly local mocks. It creates no GCP resources and removes its own processes/containers. Evidence is written under `reporting-service/target`; it must never point at an application database.

Initial verification passed successful resolution/replay, current hold snapshot after delivery, blocked held completion, private reply, forced final Order rollback, actual two-way Pub/Sub compensation, duplicate delivery, and a fresh command after compensation. Final merged-code and additional lost-response/delayed-original results are appended after execution. Production IAM/OIDC/composite indexes and browser visual checks remain separate rollout checks.


## Final verification - CHANGE-166 (2026-10-29)

- Full root reactor verify: 666 Order tests plus12 common tests; zero failures/errors/skips; original coverage gates pass (BRANCH 80.98%, LINE 94.86%). Log: order-service/target/report-saga-order-final.log.
- Final Report verify:54 tests, zero failures/errors/skips; fresh coverage gates pass (BRANCH 81.20%, LINE 94.97%); complete opt-in resolution OpenAPI artifact generated. Log: order-service/target/report-saga-release-verify.log.
- Frontend:267 tests pass with --maxWorkers=2; lint, TypeScript and production build pass. A prior unconstrained parallel run timed out four existing map/date/request tests under host load; none are represented as passes, and no unrelated source/global timeout was changed. The first sandbox build could not fetch existing Google fonts; the network-enabled production build passes. Logs: report-saga-complete-frontend-bounded.log / complete-lint / complete-typecheck / complete-build under order-service/target.
- Actual current-branch Order and Report HTTP applications, separate PostgreSQL/Firestore and actual Pub/Sub push pass all six scenario groups: OPEN rejected without an orphan hold, current-snapshot retry and held delivery/completion guard, successful resolution/replay/private reply, forced final Order rollback with duplicate compensation, safe fresh command after compensation, lost Report reply, and compensation preceding a delayed original. Some related checks share a recorded group; evidence: reporting-service/target/live-order-resolution-result.json and order-service/target/report-saga-release-live.log. No resolution/compensation endpoint was replaced with a stub; User/Supplier/Credit adapters are explicitly local mocks.
- Extended harness initially disabled outbox recovery and timed out on a pending immediate-dispatch attempt; enabling the real recovery job makes lost-response/delayed-original scenarios pass. No production scheduler cadence or outbox behavior was changed.
- User approved Report-only gateway protection. Disposable gateway image build/health, eight internal-route HTTP checks (normal/encoded/matrix) and the remaining public proxy path pass via reporting-service/scripts/test-report-gateway.cjs. Local unsigned push remains gated; cloud uses Google OIDC.
- Base and HTTP-peer Compose config checks pass. Context TOML, Report index JSON and resolution OpenAPI schemas validate. No merge markers/unmerged paths remain; working diff whitespace check passes. Containers/processes created by the live/gateway harnesses were removed; no application volume or GCP resource changed.

Cloud IAM/OIDC/subscriptions/indexes, operator retention/dead-letter settings, browser visual review and explicit feature activation remain rollout work. Both saga flags remain disabled by default. Optional normal-Compose automatic Report-topic/subscription wiring was requested for approval and has not been applied; the isolated live harness is fully configured. Report creation after a confirmed/uncertain hold but failed Report save remains a separate pre-existing recovery requirement. No commit/push/deployment was performed by the assistant.


The public gateway now blocks /api/reports/internal (including matrix/encoded paths). Configure Order and Pub/Sub to target the Report backend URL directly, never the gateway. For the Report-to-Order coordinator request, configure a timeout larger than Order's Report-call timeout (e.g.20s versus5s). The isolated harness does this explicitly. Normal Compose automatic saga activation is not provided without the requested shared-bootstrap approval; setting a value only in .env does not forward it into a service unless Compose exposes it.


## Cloud provisioning implementation - 2026-10-30

The user approved the Report-specific setup script and both backend deployment templates in CHANGE-167. See [the current rollout sequence](../HANDOFF.md#cloud-rollout-change-167-approved-2026-10-30). The script supports idempotent prepare and post-deployment wire phases, preserves existing Order Publisher grants, verifies subscription bindings before mutation and provisions Google-authenticated push with retained dead-letter recovery. Both activation flags remain false. Script/config regression tests pass; no real provisioning/deployment or cloud delivery verification was performed. Earlier cloud setup gaps are now implemented as operator-run configuration, not claimed as provisioned resources.

## Credit-context exclusion (CHANGE-168)

Credit complaints can reference a completed Order, but own no completion hold. The public resolution controller resolves them locally through the Report journal using their stored orderId binding. They never invoke Order or subscribe to a new compensation channel. Order/Courier compensation contracts, topics and generation fencing are unchanged.

## Effective CHANGE-169 - credit association removed

New CREDITS and GENERAL submissions are unlinked and reject orderId. They use the local Report journal for resolution. Historical linked credit records remain compatible with that local path; no data is deleted. Completed/cancelled Order history APIs are independent and do not take part in report creation or compensation. All Order/Courier hold-resolution saga contracts are unchanged.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.


## Effective CHANGE-174 / ADR-065 ? unified Order reports (2026-11-02)

Yao Xiang approved ORDER for either the requester or current assigned courier; GENERAL stays unlinked. The opposite participant sees Against me and a response reminder and has 24 hours to provide an explanation/evidence. Reply or deadline makes the case READY_FOR_REVIEW. A missed response never automatically cancels or penalizes; admin review decides. Early admin resolution retains its warning. New ERRAND submissions are retired; resolved history remains readable. Unresolved ERRAND cases upgrade transactionally once to ORDER with a fresh 24-hour window, using bounded rotating batches in the existing scheduler and reconciliation on access.

GET /api/orders/mine/active?mode=participant SQL-filters owned/current assignments and reportable states before pagination; hold PUT accepts reporterRole=PARTICIPANT and verifies the actual locked participant's role/token identity. Existing requester/courier defaults remain. Report reporterId is submitter, requesterId/courierId are actual Order participants, and additive respondentId is the opposite participant. Additive responseExplanation exposes the reply; courierResponse and AWAITING_COURIER_RESPONSE remain compatibility wire names, displayed as Response/Awaiting response. No new SQL migration, status, topic, env flag, GCP resource or sibling User/Credit/Supplier implementation. Private admin replies remain submitter/admin only. Funding hold and delivery progression are unchanged.

Existing resolution/compensation preserves actual participant bindings, and captures a normalized legacy preimage so rollback does not reset the response deadline. Participant report/count reads are scoped in Firestore; their per-participant result sets are currently filtered/paged in memory. The existing single-field indexes suffice for the rotating legacy and participant queries. Deploy Order, Report and frontend together; avoid rolling back to the superseded requester-only behavior. Verification in changes/CHANGE-174-unified-order-report-responses.md; frontend under ../frontend/src, USER requester/courier and ADMIN impacted. This amendment supersedes CHANGE-171/173's separate ERRAND choice/direct review, not historical records.


## Effective CHANGE-175 / ADR-066 ? separate categories, two-sided responses (2026-11-02)

User-directed supersession of CHANGE-174's unified new-submission category: ORDER is submitted by the actual requester and the assigned courier replies; ERRAND is submitted by the currently assigned courier and the actual requester replies. GENERAL remains unlinked. Both linked categories use the existing24-hour response window, Against me view, opposite-participant notification and evidence response. Reply or deadline -> READY_FOR_REVIEW; admin decides any cancellation. Existing early-resolution warning, private admin reply, funding hold, delivery progression and guarded resolution/compensation remain.

Frontend ORDER uses the existing requester active selector; ERRAND uses mode=courier. Report chooses REQUESTER/COURIER hold role from category and validates the authoritative participant snapshot. One active report is enforced by orderId across BOTH categories: changing category cannot create another case until resolution. The duplicate error links to incoming cases. Existing generic respondentId/responseExplanation and compatibility response/status fields are retained.

New ERRAND reports keep their original deadline through reconciliation and rollback. Legacy unresolved ERRAND without deadline/response receives a fresh window once while retaining ERRAND; responded/resolved history is not reopened. Saved courier ORDER cases from the preceding unified design retain their existing category/bindings/replies/deadlines and remain accessible. No new Order API/application code, schema/index/topic/env/deployment/shared configuration, GCP or User/Credit/Supplier backend change. See changes/CHANGE-175-separate-report-categories-with-responses.md and ADR-066 for verification. Applies to existing frontend/src USER Requester/Courier and ADMIN reporting views.
