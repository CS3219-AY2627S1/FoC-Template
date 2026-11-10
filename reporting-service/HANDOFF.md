# Reporting Service handoff — Order integration

Updated 2026-10-30 for Yao Xiang on `feat/reporting-service`. AI assistance: OpenAI Codex; human review pending. This replaces the former blocker-only handoff. Verification evidence is recorded in `docs/order-resolution-saga.md`.

## Reporting eligibility and frontend

CHANGE-170 local follow-up (2026-11-01): eight real Order/Report/Nginx/PostgreSQL/Firestore/PubSub scenario groups pass. Success resolves Report, releases the hold and returns SUCCEEDED; compensation runs only after uncertain/failed remote/local work. User's fresh local POST returned404, confirming disabled routes. Local Compose now enables both existing saga endpoints, pins private emulator topics/subscriptions and backend URLs, and sets outer Report->Order timeout20s versus inner Order->Report5s. Existing emulator bootstrap creates both push subscriptions. Both Compose configs and two bootstrap runs pass; Order, Report and frontend were recreated and are healthy, with both resolution routes visible in gateway OpenAPI. No GCP change, volume removal or user report resolution was performed. User must refresh/retry the saved command in their browser. Earlier502's precise cause remains unproven by this404; current real gateway test returns200. Evidence: target/change170-live-gateway-resolution.log and target/live-order-resolution-result.json. This supersedes historical notes below that local Compose activation is absent.

Only the requester's own **ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED** orders may receive a new ORDER/COURIER report. OPEN and terminal orders are excluded. This is the latest user-approved restriction; OPEN still counts as active for user/supplier deletion checks.

For ORDER/COURIER, the requester form reads `GET /api/orders/mine/active?page=1&size=100` through the authenticated gateway and follows pagination. Order filters ownership and eligible statuses in SQL before pagination. Browser filtering is defensive only; it cannot authorize a report.

Reporting generates a report ID, then forwards the requester's Firebase token to:

```http
PUT /api/orders/mine/active/{orderId}/report-holds/{reportId}
Content-Type: application/json

{"requireAssignedCourier":true}
```

Order locks the eligible requester-owned row and places that report's hold atomically. Its six-field response is `id, requesterId, courierId, status, reportId, isCompletionHold`. A retry reuses the hold and returns the **current** snapshot, which may have progressed. Missing/unowned/OPEN/terminal orders return indistinguishable 404s; binding, released-hold, missing-courier or lock conflicts return 409. Report validates the IDs, assigned courier, status and hold before saving.

A different active report on the same Order returns 409: "This order already has an active report. Please resolve it before submitting another report." Retrying the same report ID remains idempotent. The Order row lock serializes public hold placement.

Holds pause ordinary completion, refunds and abort penalty outcomes; START, PICKUP and DELIVER continue. Existing explicit admin cancellation remains separate. Report resolution does not cancel/complete an Order or choose its penalty.

## Report lifecycle

- For ORDER/COURIER reports, an assigned courier has **24 hours** from creation to submit one explanation and optional evidence.
- A timely response, or deadline expiry without a response, makes the report READY_FOR_REVIEW.
- Reads reconcile deadlines; a bounded database-selected minute job also persists overdue responses so status filters do not permanently hide them. Each case has an independent Firestore transaction and error handling.
- Admins may resolve READY_FOR_REVIEW or AWAITING_COURIER_RESPONSE. The latter displays an explicit warning and confirmation.
- The admin reply is required (1–2000 characters), stored with resolvedBy/resolvedAt, and returned only to the submitter and authorized admins. The reported courier still sees status/time.
- Categories remain ORDER, COURIER, CREDITS and GENERAL; no new violation taxonomy is introduced.

## APIs

| Operation | Access / purpose |
|---|---|
| POST `/api/reports` | Authenticated multipart `report` JSON plus up to five `photos`; creates a report after any required hold |
| GET `/api/reports/mine?view=submitted\|against-me&page=1&size=20` | Caller-scoped reports |
| GET `/api/reports/{id}` | Reporter, recorded courier or admin |
| POST `/api/reports/{id}/response` | Recorded courier; one timely multipart response |
| GET `/api/reports/mine/response-count` | Authenticated caller only; `{count}` of currently answerable courier reports; database aggregate excludes responded/resolved/expired cases |
| GET `/api/reports/{reportId}/attachments/{attachmentId}` | Authenticated private evidence download |
| GET `/api/reports?page=1&size=20&orderId=...&status=...` | Admin; optional exact Order/status filters and database pagination |
| POST `/api/reports/{reportId}/resolve` | Admin; `{commandId,reply}`. Forwards to the Order coordinator; preserves 200/202. GENERAL and all CREDITS reports resolve locally through the journal, including completed-order credit context |
| PUT `/api/reports/internal/order-resolutions/{commandId}` | Admin Firebase token; callback-free atomic Report decision using the exact Order contract below |
| POST `/api/reports/internal/order-resolution-compensations` | Dedicated Pub/Sub push identity; conditional restoration/fencing plus durable result |
| PATCH `/api/reports/{id}/status` | Legacy route returns 409 directing callers to command-based resolution; cannot release an Order hold |

The three resolution routes require `REPORT_RESOLUTION_ENABLED=true`. Swagger: `/api/reports/docs`, JSON: `/api/reports/v3/api-docs`. Internal does not mean unauthenticated.

Effective CHANGE-169: CREDITS and GENERAL are unlinked. Neither displays an Order picker or calls Order Service; a submitted nonblank orderId returns400. Both start READY_FOR_REVIEW with no completion hold, reported courier or response deadline. Only submitter/admin can view these reports. Separate caller-scoped completed and cancelled Order history APIs are retained for other uses. Historical linked credit reports remain readable and resolve locally.

Admin Reports now uses real Report APIs in every frontend mode. It loads an associated Order only for full case details and downloads evidence with the user's bearer token. It retains a command ID/reply across uncertain retries in per-admin/report browser session storage. A 202 is pending, never reported as success; the UI polls Order's command status. Existing Order demo backend fixtures are not used by this frontend.

## Order-owned resolution and compensation

The browser entry point forwards to Order's `POST /api/orders/admin/{orderId}/reports/{reportId}/resolve`. Order records intent before calling Report. **Report never calls the old Order hold-release endpoint.** Only Order releases its hold after confirmed Report success and a local commit.

See [docs/order-resolution-saga.md](docs/order-resolution-saga.md) for the exact request/result payloads, preimage/revision journal, compensation-before-original fencing, result outbox, identity settings, retry operations and topic names.

## Deployment and remaining operational checks

1. Deploy a contract-capable Order version containing V18 and both reporting APIs. Those sources are now present following the user's main merge.
2. The owner-created four topics were confirmed present on 2026-10-30. Their existing subscriptions are pull-only. Use the scoped `infra/gcp/configure-report-pubsub.sh <environment> prepare|wire` rollout below to configure identities/authenticated push; topic creation alone does not activate delivery.
3. Install the Report database composite indexes in `firestore.indexes.json`. Emulator success does not verify production indexes.
4. Configure both services' saga settings, then enable both feature flags. Defaults remain disabled; this change does not provision GCP or activate staging/production.
5. Verify real cloud OIDC, IAM, deadlines, retry/dead-letter routing and alerts before rollout. Local tests use explicitly gated Firebase-emulator tokens and actual Pub/Sub/Firestore emulators.

Preserve operation journals, tombstones and dedup/result records until both services agree a retention horizon. Never clear a hold to work around COMPENSATING or RECONCILIATION_REQUIRED. Existing report-creation failure after hold placement still requires operational reconciliation; resolution compensation does not implement a separate report-creation saga.

## Cloud rollout (CHANGE-167, approved 2026-10-30)

Run these Bash commands from the repository root in Cloud Shell, WSL or Git Bash with an authorized Google account. **The assistant has not run them against GCP.** Review `bootstrap.sh`: it is the existing project-wide prerequisite setup, not a Report-only script.

```bash
# Existing project setup: runtime identity, Firestore databases, private attachment buckets,
# Report database/storage permissions and deployer permissions (plus other existing project prerequisites).
bash infra/gcp/bootstrap.sh
# Scoped Report saga setup: safe before the Report Cloud Run service exists.
bash infra/gcp/configure-report-pubsub.sh staging prepare
```

Deploy the approved branch's Order, Report, gateway and frontend versions through the normal pipeline, retaining `ORDER_REPORT_RESOLUTION_ENABLED=false` and `REPORT_RESOLUTION_ENABLED=false`. Install the composite indexes from `reporting-service/firestore.indexes.json` in `reporting-staging` and wait for them to become ready. Then:

```bash
bash infra/gcp/configure-report-pubsub.sh staging wire
```

The scoped script reuses the existing `*-dev-v1-sub` subscriptions, verifies their topic bindings, configures Google OIDC push/retries and a retained dead-letter recovery channel. It does not delete subscriptions, deploy, enable flags or alter Order's existing Publisher grant. `wire` refuses to mutate infrastructure if either target Cloud Run service is missing. `prepare` is the default when the phase is omitted.

| Identity | Purpose / permissions |
|---|---|
| `foc-reporting-service@<project>.iam.gserviceaccount.com` | Report runtime; bootstrap grants own-database/storage access; scoped script grants result-topic Publisher and deployer actAs |
| `foc-report-push-staging@<project>.iam.gserviceaccount.com` | Authenticated request push into Report; Cloud Run Invoker on Report |
| `foc-report-result-staging@<project>.iam.gserviceaccount.com` | Authenticated result push into Order; Cloud Run Invoker on Order |
| Google Pub/Sub service agent | Token Creator on those push identities; Subscriber on source subscriptions and Publisher on the dead-letter topic for forwarding |

Report's runtime is **not** granted Subscriber: this is HTTP push, not a runtime pulling messages. Order already has Publisher; its grants are preserved. Production uses separate `...-production` push identities, `*-prod-v1-sub` subscriptions and prod topics.

The script also creates `report-resolution-dead-letter-dev-v1` plus its `-recovery` pull subscription (production: `report-resolution-dead-letter-prod-v1`). Both source subscriptions use a 60-second ACK deadline, 7-day retention, 10-600 second retry backoff and 10 maximum delivery attempts before best-effort dead-letter forwarding. Subscribe/alert/replay operationally; dead-lettering alone does not finish a saga or release its hold.

Cloud settings are now forwarded explicitly by both services' `deploy/env.yaml`, using `infra/environments/<environment>.env`. Report calls Order with a 20-second timeout; Order calls Report with a 5-second timeout. Push targets and audiences use the same direct backend URLs as deployment, never the public gateway. No emulator settings are supplied to cloud runtimes.

After reviewing wiring/indexes, set **both** saga flags to `true` in the staging environment config, redeploy both backends, and verify successful resolution plus duplicate/compensation handling using disposable staging cases. Do not inject rollback triggers into a shared staging database. Cloud Google OIDC delivery is still unverified until that check passes. Repeat the prepare/deploy/index/wire/activation sequence for production only after staging passes. Provisioning can be rerun; it never silently rebinds a subscription to a different topic.


## Staging activation configuration (2026-11-01)

### Effective CHANGE-170 follow-up - resolution feedback and categories

Owner Yao Xiang on hfix/report-service approved this hotfix. Forward Order's resolution status and JSON body in a fresh response; never relay its Content-Length/Transfer-Encoding/Connection or security headers after reserialization. Staging logs show a downstream Order 200 paired with Report 502; fixed response-boundary tests cover transport headers and pending status. Stable command retries and Order-owned compensation remain unchanged. Admin UI checks a saved resolution after uncertain transport failure instead of requiring repeated mutations or treating Report RESOLVED alone as proof that the hold release committed.

New Report submissions accept ORDER and GENERAL only, validated before uploads or holds. Keep COURIER/CREDITS enum values and their historical display/resolve behavior so stored reports remain readable. The form offers only the two active categories and normalizes retired category links to General. The Admin case's Order link opens /admin/orders?orderId=<id> with exact-search table actions and retained View details. Shared policy adds COURIER_BAD_ATTITUDE=2; Order migration V19 permits it in current and archived deferred policies. No changes to User/Credit/Supplier backend or GCP resources. User penalty consumption remains an independent missing integration in this checkout.

AI assistance: OpenAI Codex; human review pending. Reapplied on feat/integrate-report-service at Yao Xiang's request after the prior uncommitted activation changes were discarded. Earlier read-only cloud verification in this session confirmed all six declared Reporting composite indexes READY, plus both request/result subscriptions targeting the expected direct backend paths with Google OIDC identities/audiences and the dead-letter topic. Configuration readiness does not establish end-to-end message processing.

Both ORDER_REPORT_RESOLUTION_ENABLED and REPORT_RESOLUTION_ENABLED are now true in infra/environments/staging.env. Production and application/local defaults remain disabled. The rollout test enforces coordinated staging activation, production isolation and flag forwarding through both deployment templates. Seven focused tests, staging Bash syntax and diff whitespace checks pass. Push through a PR and wait for successful staging deployment; no recurring manual GCP toggle is needed. No cloud mutation, deployment or push was performed by the assistant.

After deployment, test a disposable active-order report: courier progress remains available, held completion/funding is blocked, admin resolution stores the reply and releases the report's hold, and same-command retries do not repeat effects. Check submitter-only reply visibility and authenticated compensation/result recovery before production promotion. Do not inject rollback triggers into the shared staging database. Preserve journals and pending messages during any controlled rollback of both flags.

## CI bucket-policy reader permission (2026-10-31)

AI assistance: OpenAI Codex; human review pending. CI runs as `foc-deployer`, whereas local checks run as the signed-in developer. The existing `focInfraReader` custom role omitted `storage.buckets.getIamPolicy`, so CI could not verify the Reporting runtime's bucket access even though local checks passed. Bootstrap now includes that read-only permission. The checker distinguishes a policy-read failure from a successfully read policy missing the runtime binding.

An authorized owner can apply only the missing permission, preserving the role's other permissions, then rerun CI:

```powershell
gcloud iam roles update focInfraReader --project=protean-vigil-509704-q4 --add-permissions=storage.buckets.getIamPolicy
```

Alternatively rerun the updated bootstrap. Include the source fix in the PR so future bootstrap runs preserve the permission. No bucket object access or IAM-edit permission is added to the reader role. Two new regressions failed before the fix; all six focused bucket/reader checks pass afterward. Cloud IAM was not modified by the assistant; CI under the deployer identity remains pending after the owner applies the role update.

## Bucket verification correction (2026-10-31)

AI assistance: OpenAI Codex; human review pending. The infrastructure check previously read only the Storage API's nested `iamConfiguration.publicAccessPrevention` field. Current `gcloud storage buckets describe --format=json` returns top-level `public_access_prevention`, causing false failures for both Reporting attachment buckets even when protection was enforced. The checker now accepts either representation while still requiring `enforced` and the Reporting runtime's bucket-scoped object access.

Four regression tests execute the actual bucket-check section with CLI-shaped/API-shaped metadata and negative protection/access cases; two reproduced the original defect before the fix. All four pass after the fix. Read-only verification against the actual staging and production buckets confirms both privacy and runtime access checks pass. Bash syntax and diff whitespace checks pass. No cloud resource, IAM, billing or feature-flag changes were made. Rerun the full infrastructure check and PR CI; this targeted verification does not establish complete deployment or Report saga delivery.

## Credit report context and courier reminders - CHANGE-168 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user requested optional Order context for credit issues, dates and a clearer order picker, an actionable duplicate-report message, and a red unanswered-report reminder. They explicitly approved completed-order context for either the requester or assigned courier, with no completion hold, no courier response request and direct admin review. Compact selectable rows reuse the existing UI theme; all original report categories and active ORDER/COURIER restrictions remain.

Contracts: GET /api/orders/mine/completed?page=1&size=20 lists only COMPLETED orders where the verified caller is requester/current courier. GET /api/orders/mine/completed/{orderId} performs the same ownership/status check for Report backend validation; missing, unrelated and non-completed records return 404. No userId is accepted. Any recognized Order role may use these caller-scoped reads. SQL applies status/ownership/count/pagination; no all-order scan. OrderResponse.startedAt is nullable and derived from the stored deadline minus its declared delivery duration; no SQL migration or speculative legacy backfill.

CREDITS may remain unlinked or reference that completed order. GENERAL remains unlinked. Credit linkage is context only: courierId/deadline remain null, status READY_FOR_REVIEW, no hold or funding/penalty action. Credit resolution stays in Report's durable local journal even with an orderId; it never calls Order's hold-release coordinator or polls an Order command. Only submitter/admin can access these credit reports. ORDER/COURIER still require own assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED order and their existing hold/response flow.

Duplicate protection: public placeActive locks the Order and rejects another active report while preserving same-report retry. Report saveNewLinked also serializes creation with Firestore active_report_orders slots, checking both the referenced report and a bounded legacy active-report query before writing report+slot atomically. Slot records can reference resolved history; a new report is permitted after resolution. Existing generic historical/admin multi-hold data is preserved. The response says: This order already has an active report. Please resolve it before submitting another report. Other conflicts are not relabeled as duplicates. This does not introduce a separate cross-service report-creation saga; the known hold-commit/report-save uncertainty remains a separate recovery requirement.

Reminder: GET /api/reports/mine/response-count returns {count}, scoped solely by the JWT subject, using Firestore aggregate predicates on courierId/status/responseDeadlineAt. Expired, responded and resolved reports do not count. One visible/authenticated five-second poller in the app shell supplies both desktop/mobile Report an Issue navigation badges; admin mode does not poll, account changes cannot inherit another user's badge and transient failures retain the same user's last confirmed count. No new event topic, secret or env var is required.

UI: optional completed-order rows for Credits and required active-order rows for Order/Courier; truncated description/ID, status and Created date, bounded scroll and existing photo validation retained. Started and Active report labels are omitted. Empty optional link remains supported; duplicate errors are shown on submission and preserve the entered form. No User/Credit/Supplier backend or cloud resources were modified.

Verification (final application source): root reactor 669 Order +12 common tests, zero failures/errors/skips, Maven SUCCESS and coverage gates (Order BRANCH81.03%, LINE94.80%). Report61 tests, zero failures/errors/skips, coverage BRANCH81.63%, LINE95.13%. Initial client test reproduced rejection of a response missing hold fields; fixed with a separate completed-context DTO, not by weakening hold validation. Real local Order/Report HTTP, PostgreSQL/Firestore and two-way Pub/Sub integration passes all seven scenario groups, including the new ownership/credit-context/duplicate/count cases plus existing compensation/replay/lost-response/fencing cases. Test containers/processes removed. Root Surefire emitted a post-success fork shutdown timeout warning; Maven still completed with exit0, zero failed tests. No production timeout or coverage gate changed. Logs: order-service/target/change168-order-verify.log, change168-report-final.log, change168-live.log; reporting-service/target/live-order-resolution-result.json.

Final frontend verification: all274 tests pass across52 files after the credit-case UI refinements; TypeScript, lint and production build pass. Credit case details show Submitter account, no courier-response section, and use actual Order participant IDs for Order names. The Order OpenAPI MVC slice now includes CompletedReportOrderController, with explicit path assertions; all4 focused documentation tests pass and the regenerated artifact includes both completed-context routes and startedAt. Report response-count OpenAPI and Firestore index/context validation pass. Live staging/production and Google IAM delivery remain unverified; this change does not deploy/rebuild the user's running stack. Install the two additional Firestore indexes in reporting-service/firestore.indexes.json before cloud rollout (courierId/status/responseDeadlineAt and orderId/status). No SQL migration is needed; Firestore slots are created lazily with a legacy-record check.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.

Final CHANGE-169 verification: root reactor670 Order +12 common tests, zero failures/errors/skips; coverage gates pass (Order BRANCH81.03%, LINE94.81%). Report60 tests, zero failures/errors/skips; gates pass (BRANCH81.49%, LINE95.01%). Frontend274 tests across52 files, lint and production build (including TypeScript) pass; focused form/reminder/navigation14 tests pass. All four completed/cancelled list/detail routes and retained response-count API are present in generated OpenAPI; context TOML validates. Updated actual Order/Report HTTP + PostgreSQL/Firestore + two-way Pub/Sub live integration passes all seven scenario groups, including unlinked credit creation/local resolution, rejection of supplied credit orderId, completed/cancelled ownership/status filtering and the preserved response count, plus existing rollback/duplicate/lost-response/fencing scenarios. Disposable fixtures removed. Logs: order-service/target/change169-order.log, change169-report.log, change169-frontend.log, change169-lint.log, change169-build.log, change169-live.log; reporting-service/target/live-order-resolution-result.json. No production deployment, GCP change, database cleanup or running frontend rebuild was performed. Working diff whitespace and merge checks pass.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

CHANGE-171 final verification:681 Order+13 common full verify and66 Report full verify pass, coverage gates/packaging pass (Order branch80.70/line94.67%; Report branch81.61/line95.09%). Final9 Firestore saga checks confirm legacy requester fallback and courier-report actual-owner compensation. Frontend284 full tests plus final affected32, lint and Docker build/types pass. Nine actual Nginx/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass. Rebuilt/recreated local Order/Report/frontend; all healthy, live OpenAPI exposes ORDER/ERRAND/GENERAL, requesterId, mode and reporterRole. Volumes preserved; no user report submitted/resolved, cloud/peer backend/index/commit/push changes. Authenticated browser use and cloud rollout remain unverified. Evidence and fixture-failure corrections: order-service/changes/CHANGE-171-courier-order-reports.md. This completion supersedes the in-progress status above.

## Active-report feedback — CHANGE-172

For duplicate report submission, both local selection validation and Order/Report conflict handling use: "This order has an active report. Please resolve it before proceeding." The specific reason is the form's alert title, with no generic "Could not submit" heading. Failed ORDER/ERRAND submissions retain content and selection; other trusted ApiError explanations remain visible. The Report adapter accepts legacy duplicate wording too. Cancellation/abort only prioritizes the hold for its authorized owner/current courier before stale-version validation; foreign-caller rejection order and funding/recovery rules remain unchanged. Same error codes/endpoints/schema/topics; no migration or infrastructure setting. See order-service/changes/CHANGE-172-active-report-error-messages.md for regressions and verification.


## Effective CHANGE-174 / ADR-065 ? unified Order reports (2026-11-02)

Yao Xiang approved ORDER for either the requester or current assigned courier; GENERAL stays unlinked. The opposite participant sees Against me and a response reminder and has 24 hours to provide an explanation/evidence. Reply or deadline makes the case READY_FOR_REVIEW. A missed response never automatically cancels or penalizes; admin review decides. Early admin resolution retains its warning. New ERRAND submissions are retired; resolved history remains readable. Unresolved ERRAND cases upgrade transactionally once to ORDER with a fresh 24-hour window, using bounded rotating batches in the existing scheduler and reconciliation on access.

GET /api/orders/mine/active?mode=participant SQL-filters owned/current assignments and reportable states before pagination; hold PUT accepts reporterRole=PARTICIPANT and verifies the actual locked participant's role/token identity. Existing requester/courier defaults remain. Report reporterId is submitter, requesterId/courierId are actual Order participants, and additive respondentId is the opposite participant. Additive responseExplanation exposes the reply; courierResponse and AWAITING_COURIER_RESPONSE remain compatibility wire names, displayed as Response/Awaiting response. No new SQL migration, status, topic, env flag, GCP resource or sibling User/Credit/Supplier implementation. Private admin replies remain submitter/admin only. Funding hold and delivery progression are unchanged.

Existing resolution/compensation preserves actual participant bindings, and captures a normalized legacy preimage so rollback does not reset the response deadline. Participant report/count reads are scoped in Firestore; their per-participant result sets are currently filtered/paged in memory. The existing single-field indexes suffice for the rotating legacy and participant queries. Deploy Order, Report and frontend together; avoid rolling back to the superseded requester-only behavior. Verification in changes/CHANGE-174-unified-order-report-responses.md; frontend under ../frontend/src, USER requester/courier and ADMIN impacted. This amendment supersedes CHANGE-171/173's separate ERRAND choice/direct review, not historical records.

CHANGE-174 complete locally: nine actual gateway/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass, including requester reply/badge, exact persisted response deadline after compensation, duplicates, safe retry, lost HTTP reply and delayed-original fencing. Disposable fixtures removed; local application volumes preserved. No staging/cloud rollout, commit or push. Authenticated browser confirmation after refresh remains. Evidence: reporting-service/target/change174-live-final.log and target/live-order-resolution-result.json.


## Effective CHANGE-175 / ADR-066 ? separate categories, two-sided responses (2026-11-02)

User-directed supersession of CHANGE-174's unified new-submission category: ORDER is submitted by the actual requester and the assigned courier replies; ERRAND is submitted by the currently assigned courier and the actual requester replies. GENERAL remains unlinked. Both linked categories use the existing24-hour response window, Against me view, opposite-participant notification and evidence response. Reply or deadline -> READY_FOR_REVIEW; admin decides any cancellation. Existing early-resolution warning, private admin reply, funding hold, delivery progression and guarded resolution/compensation remain.

Frontend ORDER uses the existing requester active selector; ERRAND uses mode=courier. Report chooses REQUESTER/COURIER hold role from category and validates the authoritative participant snapshot. One active report is enforced by orderId across BOTH categories: changing category cannot create another case until resolution. The duplicate error links to incoming cases. Existing generic respondentId/responseExplanation and compatibility response/status fields are retained.

New ERRAND reports keep their original deadline through reconciliation and rollback. Legacy unresolved ERRAND without deadline/response receives a fresh window once while retaining ERRAND; responded/resolved history is not reopened. Saved courier ORDER cases from the preceding unified design retain their existing category/bindings/replies/deadlines and remain accessible. No new Order API/application code, schema/index/topic/env/deployment/shared configuration, GCP or User/Credit/Supplier backend change. See changes/CHANGE-175-separate-report-categories-with-responses.md and ADR-066 for verification. Applies to existing frontend/src USER Requester/Courier and ADMIN reporting views.


CHANGE-175 verified locally:70 Reporting tests pass with zero failures/errors/skips; branch81.17%, line95.12%, OpenAPI/packaging/coverage gates pass.41 affected frontend tests and full lint pass. Reporting/frontend production Docker builds pass, including TypeScript. Nine real gateway/Order/Report/PostgreSQL/Firestore/PubSub scenario groups pass: restored role-scoped ERRAND, requester incoming case/reminder/reply, Order/Errand duplicates in both directions, wrong actor/category rejection without orphan hold, resolution/replay/private reply, final rollback and duplicate compensation, safe retry, lost reply and delayed-original fencing. Existing Order application/jar unchanged; previous full Order/common verification is retained and not claimed as rerun. Recreated only local Reporting/frontend; Order/Report/frontend healthy. Live OpenAPI exposes ORDER/ERRAND/GENERAL and built Errand route returns200. Databases/volumes preserved. No new schema/topic/index/config/cloud, staging/commit/push changes. Browser confirmation after refresh and cloud rollout remain. Logs: reporting-service/target/change175-red.log, change175-verify.log, change175-live.log; order-service/target/change175-frontend.log, change175-lint.log, change175-docker-build.log, change175-local-start.log. Initial RED reproduced rejected ERRAND and window reset; no failed final checks. Human review pending.


## CHANGE-176 ? pending-response navigation (2026-11-02)

Approved Yao Xiang: in USER mode, Report an Issue opens /reporting?tab=against-me when the existing response count is positive; zero/unknown opens the existing /reporting form. Desktop/mobile use the shared shell. Reporting tabs follow explicit URL navigation and preserve category/order query context. Background count changes only update the link/badge and do not switch the current tab or discard a draft. ADMIN navigation, backend/API/auth, report statuses/holds/saga, schema/topics/env and deployment settings unchanged. Existing frontend/src AppShell/ReportingHub and related tests updated. Verification: CHANGE-176; backend checks are not rerun for this UI-only change.


Verified CHANGE-176:22 affected frontend tests pass; full lint and frontend production Docker build including TypeScript pass. Initial navigation regression failed for the old href before implementation. Tests confirm positive/zero count destinations, unchanged ADMIN navigation, draft preservation with count updates, explicit same-page query navigation and existing forms/responses. Recreated only frontend; healthy. Built /reporting returns200 with initialTab=create; /reporting?tab=against-me returns200 with initialTab=against-me. TOML/whitespace checks pass. No backend tests rerun or backend/API/schema/auth/shared-config/deployment-settings/workflow/skill changes; only existing frontend source/tests and documentation/AI context changed. No database/volume/cloud/Git publication changes. User browser confirmation and staging rollout remain. Evidence: order-service/target/change176-red.log, change176-final-tests.log, change176-lint.log, change176-build.log and change176-local-start.log.


## CHANGE-178 ? matching inline admin filters (2026-11-02)

User requests Orders toggle on the status/search row and explicitly adds Admin Reports toggle. Existing AdminFilterForm gets an opt-in desktop four-column layout: Status, shorter flexible Order ID input, toggle, Search/Clear. Orders and Reports use it; narrower screens wrap and other admin search forms keep their original layout. Toggle controls match the40px field/button height.

Reports Ready for review is a UI shortcut for existing READY_FOR_REVIEW status, off by default. Enable selects it; disable selects All statuses; dropdown changes reflect the switch. Existing changeFilters resets page1 and retains applied ID; Clear resets both. Existing Report API/database paging/status filtering, grey viewable resolved cards and early admin resolution stay unchanged. Orders actionEligibleOnly SQL/status/page behavior remains unchanged. No backend/API/schema/config/broker/cloud or workflow/skill change; frontend source/tests/context only. Verification in changes/CHANGE-178-inline-admin-filter-toggles.md.


Verified CHANGE-178:54 affected existing Orders/Reports/admin page tests pass, including inline form containment, toggle/status synchronization, page reset, retained search and Clear; existing grey resolved-card/history and resolution tests remain green. Initial targeted tests reproduced detached Orders toggle and absent Reports toggle. Full lint and frontend production Docker build/TypeScript pass; TOML and whitespace checks pass. Recreated only frontend with --no-deps --wait; healthy. Built Admin Orders/Reports routes return200. Backend tests not rerun for this UI-only change; API/data/schema/index/env/topic/shared config, backend/business/saga/workflow/skill unchanged. No data/volume deletion, cloud/Git publication or sibling restart. Browser visual confirmation after refresh and staging frontend rollout remain. Logs under order-service/target:change178-red.log, change178-tests.log, change178-lint.log, change178-build.log and change178-local-start.log. Existing test React act warnings remain; no failed final checks.
## CHANGE-184 — durable creation with rollback compensation (2026-11-10)

New report multipart requests require a canonical browser-generated
`submissionId`. Reporting transactionally creates `report_submissions`, a stable
backend report ID, normalized/versioned fingerprint and a `PENDING`
`active_report_orders` slot before storage or Order effects. Evidence IDs are
`<index>-<sha256>` under `reports/{reportId}/submission/`; retries use
put-if-absent and verify existing content metadata/hash.

Only the request that acquires the two-minute `HOLD_PENDING` lease calls Order.
After a valid hold response, one Firestore transaction creates the visible report,
stores authoritative participants, activates the slot and completes the journal.
There is deliberately no `HOLD_CONFIRMED` recovery state. Any uncertain call,
expired lease or failed activation fences and publishes
`ReportCreationCompensationRequested`; background recovery may only expire
one-hour inactive pre-hold journals, fence leases, redrive compensation/results
and retry cleanup. It must never activate a report.

Order V20 must deploy first. Its report-ID lifecycle/tombstone and durable
deduplication serialize compensation with hold placement. Creation result and
request push endpoints use their exact Google identities; the scheduler has a
separate exact identity. Install `firestore.indexes.json`, run
`configure-report-pubsub.sh ... prepare|wire`, deploy with both creation flags
false, execute staging failure/race tests, then enable both flags together.
Production remains disabled. Disabling is not cleanup: preserve journals,
tombstones, outboxes and evidence requiring reconciliation.
