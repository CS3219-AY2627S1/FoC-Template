## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User penalty call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

Requester/automatic completion chooses the highest stored report penalty or factual delivery overdue (1). If neither applies, it emits SUCCESSFUL_DELIVERY deduction (1); it never emits a reward plus a penalty. Previously persisted legacy waivers suppress only their overdue candidate; they cannot erase a stored report penalty, and no new waiver is allowed. Courier abort chooses max(stored policy, accepted cancellation2); archive retains stored policy/audit and reopening clears the current fields before another courier assignment. Admin cancellation chooses max(stored policy, explicitly selected policies) and never compares overdue; no stored/selected penalty means refund only. Existing initial outbox events and final per-attempt outcome recording remain atomic with the transition. Event wire schemas/topics are unchanged.

V14 adds Order and abort-archive policy/audit columns; V1-V13 and historical adjustment data remain untouched. Retired replacement records are historical only, with no runtime coordinator/gateway. No sibling backend, shared env/topic/CI/cloud changes. Report UI Open/Closed cards, required replies, no deadline and live Coming soon remain unchanged. Live Apply penalty uses the real Order API; local mode uses the isolated mock. Details and acceptance evidence: CHANGE-146/ADR-050.

## Effective penalty replacement and Report queue amendment — CHANGE-144 / ADR-049 (2026-10-18)

Approved Yao Xiang on order-service/penalty-integration: one current outcome per courier attempt, including No penalty or successful-delivery reward. Delivery stores factual overdue; completion/auto-completion read the stored flag. Initial outcomes are recorded atomically with completion/courier abort/admin resolution and existing event intents; original initial penalty/Credit topics and schemas are unchanged. A new acceptance has a new attempt identity, and an abort archive keeps the preceding identity.

Admin replacement is synchronous, not a new Pub/Sub topic. Order commits a stable-ID PENDING adjustment, calls User Service using fresh verified admin authorization, then confirms the current outcome in a second atomic transaction only after a matching reply. Another adjustment to that attempt is blocked while pending; exact same-ID authorized retry recovers timeouts/crashes. No bearer token is stored. User replacement endpoint is MISSING (FEEDBACK-016), so order.penalty-adjustment.enabled defaults false and live UI clearly disables writes. Local mock is isolated. Initial outbox publication never proves score application. New V13 tables preserve request audit/revision and current outcome; historical outcomes are not fabricated. Existing V1-V12 stay immutable.

Old overdue-waiver HTTP/UI is removed; V12 historical audit fields and previously saved decisions remain readable. Reports use Open/Closed cards with counts/pagination and visible five-second polling. No response deadline or deadline timer: courier may respond once while unresolved, and admin may resolve any open report with a required reply saved in resolutionNote. Case detail retains Order-first layout and links to separate Order financial actions. Report Service remains MISSING; HTTP-peer/staging/production Reports remain Coming soon. No sibling backend, shared environment/topic, CI or cloud configuration changes.



## Effective delivered-report review amendment — CHANGE-141 / ADR-048 (2026-10-18)

Approved Yao Xiang: new requester reports require own DELIVERED order; one damage/wrong-location category. Reports have AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW and one RESOLVED final status. Courier response window is eight hours; server owns deadlines. Report Service is MISSING: the Report UI is a local-only isolated demo; HTTP-peer/staging/production show Coming soon and never fetch sample reports. Existing real Order financial actions remain separate from resolving a report.

Order stores deliveryOverdue at actual delivery, comparing deliveredAt against stored START plus duration deadline. isOverdue remains null before delivery or if historical timing is unknown; no runtime status refresh or new overdue scheduler. Admin waiver only before completion on DELIVERED late orders preserves the true lateness and saves actor/time/reason. Normal waived-late completion funds the courier but emits neither overdue addition nor successful-delivery reward. Explicit admin-selected penalties remain separate.

AdminOrderController adds PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release (no body) and POST /api/orders/admin/{orderId}/overdue-waiver ({reason}). Both verify admin role, use the verified principal, NOWAIT locked Order and the pending-command guard; all local writes are transactional. Release retains its report binding/audit and any other active holds. It may follow admin cancellation/completion and emits no funding event. Report Service must durably retry its release intent using forwarded admin Firebase authorization; no browser-only live orchestration exists. See FEEDBACK-015. V12 backfills only known delivery facts and adds waiver/release audit fields and an active-hold index; V1–V11 remain immutable.

Frontend uses existing theme/components, compact toolbar, darker selected rows and no redundant selection count. Normal/admin Reports poll every five seconds while visible; sample ownership, deadline and evidence checks are server-side in the gated prototype, which has no production identity authority or financial effects.

# Order Service

## Opt-in compensation integration (CHANGE-158 / ADR-055)

Actual Credit HTTP and Pub/Sub request/result transport is implemented behind
ORDER_COMPENSATION_ENABLED (default false). New commands use the configured
ORDER_COMMAND_RECOVERY_POLICY (default retry); saved commands retain their policy.
Local Compose already provisions request and result subscriptions; to test this
policy deliberately set both ORDER_COMPENSATION_ENABLED=true and
ORDER_COMMAND_RECOVERY_POLICY=compensate, then rebuild the local stack normally.
No local database reset is needed. These instructions do not enable any cloud
deployment. Real integration tests use disposable databases, not Compose volumes.

Cloud configuration additionally requires explicit request topic, result
subscription, Google push audience and service-account email, no emulators,
dedicated OIDC/IAM/subscriptions and prior rollout review. Credit result publishing
must be enabled in the same coordinated rollout. See
concurrency/compensation-workflow-handoff.md and CHANGE-158 for tests/remaining gates.
The new request-topic variable must match the existing infrastructure setting
ORDER_CREDIT_COMPENSATION_TOPIC. No cloud provisioning was performed here.

## Compensation-first recovery fixture milestone (CHANGE-156)

The default `ORDER_COMMAND_RECOVERY_POLICY=retry` retains the current live
credit-command-v1 protocol. New `compensate` selection is **mock/contract-fixture
only**; selecting it with HTTP peers disables command execution before peer I/O.
It is not a deployment-ready replacement yet. Credit's async consumer/result
publisher, missing-command fencing and safe courier-clear reversal are FEEDBACK-017.

`ORDER_COMMAND_RESOLUTION_SECONDS` (default120) is the unfinished-command deadline,
not Order expiry or worker lease length. V15 adds the journal states, result inbox
and command-owned outbox reference required before an Order exists. Apply through
Flyway, never ORM auto-update. Preserve old pending commands and their saved policy.
Do not flip policy over an undrained backlog without explicit reconciliation.

Peer tasks and exact wire formats: [handoff](concurrency/compensation-workflow-handoff.md).
Testing from repository root (Java21 and Docker required for PostgreSQL):

```powershell
.\mvnw.cmd -pl order-service -am "-Dtest=OrderCompensationWorkflowTest,OrderCompensationJournalTest,OrderCommandGateTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
.\mvnw.cmd -pl order-service -am "-Dtest=OrderCompensationPostgresIntegrationTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

The second run uses real PostgreSQL but fixture Credit/transport, not actual Credit.
There is no new public push receiver or live compensation publisher in this milestone.

## Admin table page size — CHANGE-140

CHANGE-140, Yao Xiang2026-10-17: Admin Orders requests20 rows in live/mock mode; local sample User table requests20. Shared frontend ADMIN_TABLE_PAGE_SIZE keeps Order exact-search metadata consistent. Server totals/pagination and scrolling retained; fewer matching records do not get blank filler rows. Supplier cards remain10 and Credit history20. Live User directory still awaits its existing provider; not enabled by this change. No backend/schema/API-shape/auth/config changes.


## Compact calendar toolbar — CHANGE-139

CHANGE-139, user-directed2026-10-17: Admin Orders toolbar is a compact41px desktop table-top row, with existing RefreshCwIcon-only refresh and two native calendar-icon date fields (DD/MM/YYYY to DD/MM/YYYY), no visible Created-from label. Wrap on mobile; keep existing Order-ID/status search and financial dialogs/navigation. Creation-date bounds are local calendar days converted to explicit instants (start inclusive, day after end exclusive). Refresh retains filters and clears stale selection. Additive admin list filters execute in SQL before sorting/count/pagination; samples filter only isolated fixtures. No schema/financial/event/peer/config change. See changes/CHANGE-139-compact-admin-toolbar-date-filter.md.


## Current admin resolution UI — CHANGE-138

CHANGE-138 / ADR-047 (Yao Xiang,2026-10-17): Admin Orders now support single-row selection, shaded state, a top Cancel/Complete action bar and shared full-detail actions. The dialog requires an explicit penalty/no-penalty choice and a preset/custom explanation. Backend policy discovery supplies amounts; only the highest addition is selected. Optional resolutionReason is normalized, persisted atomically in V11 and bound into new receipts; absent/null preserves legacy fingerprints. OrderResponse exposes saved admin decision/time/explanation. Existing auth, active-state/held override, participant locks, credit/penalty events and ordinary hold guards remain. Mock mode mutates sample memory only; live mode calls existing protected endpoints without fallback. No sibling backend, root config or cloud change.


CHANGE-137 / ADR-046, approved Yao Xiang2026-10-17: AdminOrderController adds
POST /api/orders/admin/{orderId}/complete. Assigned ACCEPTED/IN_PROGRESS/PICKED_UP/
DELIVERED may become COMPLETED, including held Orders. Stored participant IDs must
match. Publish existing Credit completion event plus at most one highest selected
penalty addition; null/empty means WAIVED, no automatic overdue penalty or reward.
Locked atomic decision/checkpoint/receipt/outbox and bound ADMIN_COMPLETE replay;
hold history and actual timing preserved, no fabricated delivery. Ordinary hold
guards remain. Reuses V10 columns/topics; no migration, UI, peer or cloud change.
HTTP200 confirms local intents, not Credit settlement or User score application.


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


CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from persisted START deadline/delivery timing under CHANGE-135. Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.

CHANGE-135 verification: fresh470 common/Order tests and coverage gates pass;
frontend typecheck passes. Local database upgraded9 ->10 after backup, seven
Orders preserved. Rebuild matching Order image to use the updated timing logic.


CHANGE-133: selected-user Admin Credit history is linked in live/HTTP-peer mode
through GET /api/credits/users/{userId}/transactions. Base Compose keeps mocks;
balances and unfinished User actions remain Coming soon. Nine merge conflicts
resolved preserving both workstreams. See changes/CHANGE-133-admin-credit-history-merge.md.


CHANGE-132: shared enum is now `PenaltySystemPolicy`. Order successful completion
and event direction use `getSuccessfulDeliveryReward()`. Common also provides
immutable `getCourierPenaltyCases()` (report cases excluding cancellation,
overdue and success) and `getFullPenaltyPolicy()` (all six). Wire JSON unchanged.


CHANGE-131 completes the shared D1 NTH2 mapping: wrong-location delivery4,
mishandling/damage4, deliberate retention/theft10, alongside existing2/1/-1.
These are future confirmed-report mappings, not new automatic Order flows.
See [policy and integration limits](../foc-common/README.md).


## Shared penalty policy build (CHANGE-130 / ADR-043)

`PenaltySystemPolicy` now lives in `../foc-common`, package
`sg.edu.nus.foc.common.penalty`. It is the only shared application code in this
slice: +2 accepted cancellation, +1 overdue delivery, -1 successful delivery.
Authentication and event JSON are unchanged. From the repository root:

```powershell
.\mvnw.cmd -pl order-service -am verify
docker compose up -d --build order-service
```

Linux/macOS: `bash ./mvnw -pl order-service -am verify`.
Direct image build: `docker build -f order-service/Dockerfile .`.
The root reactor builds the shared JAR first; no local `mvn install` is needed.
This supersedes standalone Order-folder build commands below. Other services
keep their standalone builds. See [common library](../foc-common/README.md).

CHANGE-129 / ADR-042 adds shared-role active involvement reads:
GET /api/orders/users/{userId}/active-involvement and
GET /api/orders/suppliers/{supplierId}/active-involvement. Return userId or
supplierId plus hasActiveOrders. Production accepts Requester/Courier/Admin
Firebase callers; local split unchanged. SQL EXISTS covers five active statuses,
held Orders and either current User/location relationship. Not a deletion lock.
Peer owners must integrate the checks; FEEDBACK-015 records race/pending limits.
Missing/empty supplier lookups display Deleted supplier without storing names
or changing Order card layout. Temporary errors remain Location unavailable.
CHANGE-128 / ADR-041: penalty events use PenaltySystemPolicy (+2 accepted
cancellation/+1 overdue/-1 successful). Manual/system completion keeps the Credit
event and queues one courier addition/deduction. New aborts replace the legacy
accepted-cancellation publication; old outbox dispatch remains. Contracts/examples:
[AsyncAPI](docs/asyncapi/asyncapi.yaml), [peer handoff](docs/peer-service-api-feedback.md).
User subscription/score mutation is not implemented in this Order milestone.

Topic variables: ORDER_COURIER_PENALTY_ADDITION_TOPIC and
ORDER_COURIER_PENALTY_DEDUCTION_TOPIC. Local Docker pins *-local-v1 and creates
both topics without Credit penalty subscriptions. Staging uses
courier-penalty-{addition|deduction}-dev-v1; production uses *-prod-v1.
Before cloud CI/deploy, the infrastructure owner runs existing
infra/gcp/configure-order-pubsub.sh staging and production from the repo root
with appropriate gcloud permissions. This provisions topics and Order's publisher
IAM; it does not provision User subscribers. check-infra now validates both new
topics, so absent resources/IAM will correctly block CI. No cloud command ran here.

CHANGE-127 / ADR-040: requester-owned report holds block completion and final
funding. PUT /api/orders/internal/{orderId}/completion-holds/{reportId}, JSON
requesterId, forwarded requester Firebase Bearer token in production. Ordinary
responses expose isCompletionHold; requester UI explains ongoing reports and
disables completion. SQL scheduler filters and locked rechecks skip held Orders.
V9 adds the boolean/per-report table. Release is deferred; Report client absent.
See [contract](docs/completion-hold-design.md) and [verification](changes/CHANGE-127-completion-holds.md).
## Admin UI: local demo and partial staging/production

CHANGE-125 centralizes consistent Admin presentation: Geist Sans, regular14px
data, shared heading/helper sizes and semantic colours. Technical IDs and map
popups match; missing balance values use muted helper text. Existing normal-mode
components/state colours and all data/provider behaviour stay unchanged.

CHANGE-124 uses consistent regular14px text in the Orders table body, including
IDs/names, statuses and dates. Headers remain distinct; other pages stay unchanged.

CHANGE-123 keeps long table Order IDs on one line with an ellipsis. Clicking copies
the whole ID; hovering or View details exposes the full ID. Other IDs unchanged.

CHANGE-160 makes ready Admin APIs consistent in every environment:

| Run configuration | Orders / Users / Suppliers / Credit | Reports |
|---|---|---|
| compose.yaml | Actual local peers; real admin role required | Local sample data |
| compose.yaml + compose.http-peers.yaml | Actual local peers; real admin role required | Local sample data |
| Staging / production | Actual deployed APIs | Coming soon |

From the project root, rebuild the affected frontend and Order images:

~~~powershell
docker compose -f compose.yaml -f compose.http-peers.yaml up -d --build order-service frontend
~~~

Admin Users loads a real initial page of20 records from GET /api/users/admin/search. The Search by dropdown defaults to ID and also offers Name; filtering/counting/paging happen in MongoDB. Clear reloads the initial real page. Profile management and independent Credit balance/history use their ready APIs; real errors never fall back to samples. See ../user-service/user-servicehandoff.md for the narrow User endpoint change.

Only Reports uses FOC_REPORT_API_MODE=mock with ORDER_REPORT_DEMO_ENABLED=true, local environment and Auth emulator. Both Compose variants use local data, never staging databases. Staging/production cannot enable the sample transport. Generic Admin mock endpoints and FOC_ADMIN_API_MODE / ORDER_ADMIN_MOCK_ENABLED selection are retired. See [pending peer contracts](docs/peer-service-api-feedback.md) and [ADR-057](docs/decisions/ADR-057-ready-admin-api-and-local-report-demo.md).

Historical layout/prototype notes below describe their original milestones; their mock transport and readiness statements are superseded by CHANGE-159/160.

CHANGE-116 restores the original Order detail card sizes/two-column arrangement.
Version and Item Description exchange positions, leaving description last;
requester remains above courier. Supplier map/status changes from115 remain.

CHANGE-115 removes the Supplier list overview map; maps remain in View Details
and the create form. Supplier status is beside Location details, outside actions.
Order Information has metadata first and credits/wider description in the final
row; People shows requester before courier.

CHANGE-114 adds supplier maps in the list/details and address suggestions with
a draggable pin in Admin creation. You can still type coordinates manually.
Pins link to Google Maps. Deactivation is in View Details only. User columns
are separate; Order details have logical cards, including repost information,
and related names navigate while separate ID controls copy.
Maps use Leaflet/OSM/Photon and require internet, without an API key. Public
providers may be unavailable; coordinate entry and Google Maps links remain.
No backend contract changed; see admin-peer-api-request.md for provider limits.

CHANGE-113: **View** opens full Order/Supplier detail pages. User and Supplier
admin actions are below the heading, above details/history. Existing mock APIs
are reused; Order detail is read-only. Back buttons return to the relevant tab.

CHANGE-112 refines this prototype: Orders names open selected Admin users or
locations directly; Users now has a full profile with copyable UID, balances,
sample transaction history and the existing admin actions. Suppliers reuse
normal open/closed/inactive badges. Search controls align; the header has only
the mode switch. Order description remains available through View details.
The sample history endpoint is local-only; ADMIN-API-006 documents the actual
Credit Service admin history needed for future integration.

CHANGE-111 adds a top-right **Admin Mode** button and Orders, Users and Suppliers
tabs. Sign in with an existing local user and click Admin Mode; a sample role
lookup permits the demo without a real admin account. Normal Mode returns to the
existing user tabs. This describes the initial local sample milestone; CHANGE-119
above is the effective staging/production behavior.

Rebuild only the changed images from the project root:

~~~powershell
docker compose -f compose.yaml -f compose.http-peers.yaml up -d --build order-service frontend
~~~

Use the existing gateway at http://localhost:8080 and refresh the page.
The Report sample API alone requires ORDER_REPORT_DEMO_ENABLED=true, FOC_ENVIRONMENT=local and FIREBASE_AUTH_EMULATOR_HOST. Report fixtures reset on Order restart and never change real funds, scores or accounts. All other Admin sections call real local peers and require a real admin role.
See [peer API requests](docs/admin-peer-api-request.md),
[design](docs/decisions/ADR-039-admin-ui-local-mock-prototype.md) and
[verification](changes/CHANGE-111-admin-ui-mock-prototype.md).

CHANGE-107: expiry runs directly inside the minute lifecycle scheduler; there is
no expiry HTTP trigger or Swagger operation. All repost routes are retained.

Pub/Sub topics, exact payloads/attributes and examples are documented in
[AsyncAPI](docs/asyncapi/asyncapi.yaml), with a
[browser viewing and validation guide](docs/asyncapi/README.md) (CHANGE-103).
REST endpoints remain in Swagger/OpenAPI. This does not verify live consumers.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


For **local real HTTP peers + real Google Pub/Sub into local Credit**, use the
approved [local-live runbook](docs/local-live-testing.md) (CHANGE-088 / ADR-029).
It includes credentials/IAM prerequisites, Setup/build/up/Check/Pause/down and
per-workflow financial assertions. Do not run staging provisioning for local tests.

CHANGE-086 adds explicit automatic-repost expiry and saved latest failure messages.
Rebuild Order and frontend together. Flyway applies V4 at startup, disabling
legacy enabled plans without an explicit new expiry by Vincent's decision.
Do not reset volumes. See [migration handoff](docs/database-migration-workflow.md)
and [change/test evidence](changes/CHANGE-086-explicit-repost-expiry-and-persistent-failures.md).
Background retries and trusted peer credentials remain paused.

## Local container development

CHANGE-102 / ADR-034: ORDER_LIFECYCLE_CRON defaults to `0 * * * * *` for one
sequential job: eligible command recovery, OPEN expiry, then >=48-hour DELIVERED
completion. Command recovery remains mock-only; live HTTP recovery is disabled.
`order.commands.cron` no longer controls a separate job. The lifecycle cron
replaces ORDER_EXPIRY_CRON / ORDER_AUTO_COMPLETION_CRON.
Outbox recovery defaults to `0 */15 * * * *`;
immediate after-commit dispatch stays enabled. Remove old timer overrides and
update ORDER_OUTBOX_RECOVERY_CRON in ignored local .env if it still overrides
the hourly default. Rebuild Order after code changes; DB volumes are not reset.
See the [target diagram/gap table](docs/diagrams/order-lifecycle-reconciliation.md).

The root Compose stack runs this service against the local `order-postgres`
container. It does not connect to Cloud SQL. Flyway applies the versioned
migrations from `src/main/resources/db/migration` when the container starts.
The same stack starts the existing Firebase emulator used by the Firestore-backed
services. User Service keeps its existing MongoDB configuration untouched.

From the repository root:

```bash
docker compose up --build
```

Open the shared web application at <http://localhost:8080> (gateway) or
<http://localhost:3000> (frontend directly). The Order Service is available at
<http://localhost:8083> for direct local checks, and its PostgreSQL database is
published on `localhost:5433`.

The admin order listing is `GET /api/orders?status=COMPLETED&page=1&size=20`.
Omit `status` to include every status. It requires an authenticated Firebase
token and the `admin` role when running with the `prod` Spring profile. The
default local/non-production profile does not require authentication or enforce
the admin role. Page numbers start at 1 and sizes are capped at 100. This API
supports a future Admin Service dashboard; the current frontend and Admin
Service do not implement that dashboard.

### Historical local-cloud setup (superseded by ADR-036 and CHANGE-155)

Use docs/local-live-testing.md for current local commands. The following ADC/topic instructions describe an older configuration; local Compose now uses the emulator and the accepted-cancellation topic is retired.

Order outcome events use real Google Cloud Pub/Sub in local Compose and Cloud
Run. Local Compose uses the existing project `protean-vigil-509704-q4` and the
dev topics `order-completion-dev-v1`, `open-order-refund-dev-v1`, and
`accepted-order-cancellation-dev-v1`. Create these topics in GCP before starting
the Order Service; Compose does not create cloud topics.

Before starting the local stack, each developer must authenticate with their own
Google account and configure the ADC file path for Docker Compose. In PowerShell,
run:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project protean-vigil-509704-q4
```

The first command creates the local ADC file; the second records the project used
for client-library quota. If setting the quota project is denied, ask a project
administrator for `roles/serviceusage.serviceUsageConsumer` on that project.
The Order Service's Pub/Sub destination still comes from `PUBSUB_PROJECT_ID` and
the configured topic IDs.

Set `GOOGLE_APPLICATION_CREDENTIALS_HOST` in your own ignored root `.env` to
the ADC file path. For Windows, for example:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS_HOST=C:/Users/<username>/AppData/Roaming/gcloud/application_default_credentials.json
```

Do not enter that `NAME=value` line as a PowerShell command; it belongs in
`.env`. For a one-session PowerShell run instead, set it with
`$env:GOOGLE_APPLICATION_CREDENTIALS_HOST = "C:/Users/$env:USERNAME/AppData/Roaming/gcloud/application_default_credentials.json"`
and run Compose in the same window. Compose mounts the file read-only into only
the Order Service container. Do not share or commit the credential file. The root
`.env.example` documents the required values.

Development and production use separate topics in the same GCP project.
Developers should have `roles/pubsub.publisher` only on the dev topics. Cloud
Run uses its attached service identity and should have that role only on the
production topics. Set `PUBSUB_PROJECT_ID` and all three `ORDER_*_TOPIC`
variables in the production deployment configuration; production topic IDs are
chosen when those topics are created. Do not grant publisher access at project
level. Local publishes are real cloud messages and can reach subscribers on the
dev topics.

Stop the stack with:

```bash
docker compose down
```

Add `-v` only when you intentionally want to delete the local PostgreSQL and
Firebase emulator volumes.

`admin-service/` is currently an empty placeholder with no runnable application
or Dockerfile. It is therefore not included as a built service until its owner
adds an implementation and image.


## Errand times and background schedules

Requester creation and repost date/time controls use local clock minutes 00, 15, 30, or 45. Defaults round up to a quarter-hour; expiry must still be at least 30 minutes ahead. The API continues receiving UTC ISO timestamps and supports existing valid deadlines.

| Setting | Default Spring cron | Purpose |
|---|---|---|
| ORDER_LIFECYCLE_CRON | 0 * * * * * | Sequential eligible command recovery (mock-only), unassigned OPEN expiry, latest-delivery >=48h completion |
| ORDER_OUTBOX_RECOVERY_CRON | 0 */15 * * * * | Recover all three event types every 15 minutes |

Publication is attempted immediately after commit; the quarter-hour outbox scan
recovers missed/failed attempts for all three types. Failed publishing can wait
until the next scan while running; Cloud Run scale-to-zero can delay it further.
Due OPEN orders are selected on each minute pass, while availability/acceptance
enforce the actual deadline immediately. Override the new settings in local .env
or deployment env if needed. Spring scheduling is not guaranteed while Cloud Run
is idle. The scheduler does not wait for consumer refund/settlement completion.

## Role authorization

With the prod Spring profile, every authenticated API request validates the Firebase token and resolves roles through User Service before reaching the controller. RequireRequesterRole protects create/complete/open cancellation/repost operations; RequireCourierRole protects accept/start/pickup/deliver/accepted cancellation; RequireAdminRole protects the all-orders query. Shared reads use RequireOrderRole for any recognized role. /mine additionally verifies its selected requester/courier mode and caller ID.

Production uses GET /api/users/role-context with the caller's verified token and requires its userId to match JWT subject. The confirmed role set is reused for that request, while courier eligibility is still checked separately. Orders retain ownership/state checks under their row locks. Missing tokens produce 401; missing roles or forged actor IDs produce 403; role/eligibility dependency failures produce 503.

The production Order-specific variable ORDER_USER_SERVICE_MODE defaults to http and takes precedence over the shared USER_SERVICE_MODE mock configuration. Explicit mock overrides are for controlled tests only. Production administrators need admin in their stored User Service roles; MOCK_ADMIN_EMAILS has no effect in HTTP mode. Ensure USER_SERVICE_URL points to the deployed User Service and the caller has a registered User profile.

The default local/non-production profile remains anonymous: role annotations are inactive, mock peers use the supplied per-user actor IDs, and local HTTP peers continue their existing token-based User Service checks. Swagger assets remain public; scheduler/system flows keep their existing separate authorization. See ADR-024 and the shared authorization diagrams for details.

Scheduler failure isolation (CHANGE-093): each expiry/auto-completion Order has its own transaction and NOWAIT lock. A failed Order is logged and skipped while later Orders continue; counts reflect successful commits. DB queries select eligible IDs, with latest delivered-checkpoint cutoff. Whole-pass catches still isolate the two lifecycle phases. Scheduling/event schema settings are unchanged.

## Personal list filtering and refresh

My Requests and My Errands offer All statuses or a selected status and previous/next pagination. Order lists refresh every 5 seconds while the tab is visible and authentication is ready; manual/focus/action refresh remains. Credit balance polling remains15 seconds. Accepted courier action is labelled Abort errand; its existing cancel-accepted route is unchanged. API clients can pass optional `status=COMPLETED` to GET /api/orders/mine; omitted status includes all, invalid 400. See CHANGE-094/ADR-032 for verification and limits.

## Scheduler DB selection and independent outbox dispatch — CHANGE-096 (2026-10-10)

The active lifecycle paths retain CHANGE-093: DB-filtered IDs, separate REQUIRES_NEW expiry/completion workers, fresh NOWAIT locks and outside-proxy catch. Outbox recovery now selects bounded eligible event IDs in SQL (due PENDING or expired IN_PROGRESS lease), then individually claims/rechecks with SKIP LOCKED. Claim, markPublished and scheduleRetry use separate REQUIRES_NEW transactions; enqueue remains REQUIRED with Order/checkpoint/receipt. Dispatcher catches each event's claim/commit/retry-write errors, logs its ID and continues later events. A failed retry write leaves the committed lease recoverable after expiry. Neither scheduler nor batch coordinator is transactional. Pub/Sub publication stays outside DB transactions and is irreversible; stable-ID deduplication remains required. Legacy claimDue is retained for compatibility, unused by the active scheduler. No cadence, schema, event body, peer, frontend or paused repost change.

Tests-first regression: 1 expected failure (retry database unavailable), target/change096-red.log. Focused 43 tests passed, including eight PostgreSQL lifecycle/outbox isolation tests; fresh source-only wrapper-selected Maven 3.9.16 / Java21 offline verify: 252 tests passed, 0 failures/errors/skips, including 28 PostgreSQL tests. JaCoCo 95.99% lines / 83.72% branches; unchanged >=80% gates passed. Logs: target/change096-focused.log and target/change096-verify.log; reports target/change096-source-check/target/. Docker28.4.0; isolated PostgreSQL15 Testcontainers; new isolation suites mock all cloud publishers. No application database, peer service, real topic or cloud setting changed.

## Swagger behind the staging/production gateway (CHANGE-098)

Open /api/orders/docs or /api/orders/swagger-ui/index.html on the HTTPS gateway. OpenAPI advertises the relative server / so Try it out uses that same gateway origin rather than an HTTP backend URL. Authorize with a valid environment-specific Firebase ID token; APIs remain protected in prod profile. After deploying the new Order image, check /api/orders/v3/api-docs has servers[0].url=/ and Swagger Request URL uses the gateway. This correction requires no database/env/IAM changes.

Backend expiry validation (CHANGE-099): POST /api/orders also enforces
expiresAt >= server current time + 30 minutes. Invalid deadlines return HTTP 400
VALIDATION_ERROR with an expiresAt detail, before Supplier/Credit calls or Order
writes. This does not depend on the browser validation. Exactly 30 minutes from
the backend's validation instant is allowed; allow for request transit time.


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


CHANGE-159: [Reporting/Order integration](docs/reporting-order-integration.md) documents the new active list/report-hold APIs, current-snapshot retries, admin No penalty override, ready User/Credit links and deferred Report resolution saga.


## Effective ready Admin integration — CHANGE-160

CHANGE-160 / ADR-057 (Yao Xiang, 2026-10-28): all non-Report Admin sections use ready provider APIs in base Compose, HTTP-peer Compose, staging and production. Generic /api/orders/admin-mock routes and frontend transport are removed. User search retains the category dropdown with ID only, adapting existing admin profile lookup into a single-result page; blank/clear makes no peer call and name search remains pending. Reports alone retain /api/orders/admin-mock/reports with independent ORDER_REPORT_DEMO_ENABLED / FOC_REPORT_API_MODE settings gated by local environment plus Auth emulator; cloud Reports remain Coming soon. Report-only fixture store/mapper replace generic Admin mock CRUD. No schema, score, Order lifecycle, provider authorization or sibling backend changes. Feedback now contains only pending work; historical records are archived in the same docs folder.

See [pending peer contracts](docs/peer-service-api-feedback.md).

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../user-service/user-servicehandoff.md. Verification: CHANGE-161.


## Effective Report resolution saga — CHANGE-162 / ADR-059 (2026-10-29)

Approved by Yao Xiang on order-service/admin-ui-linking: implement a guarded Order contract stub while Report Service is absent. Initial callback-free Report resolve is synchronous HTTP with admin Firebase token/reply; Order persists a bound command and possible-effect marker before the call. Confirmed remote result permits one locked transaction releasing only that report hold plus SUCCEEDED/saved result. Failed or uncertain local success chooses separate durable generation2 compensation through the existing Pub/Sub outbox. Authenticated exact-binding result inbox commit, not broker ACK, confirms reversal/fence. Committed local success is never compensated after a lost response. Pending/reconciliation holds stay active and manual release is guarded even after transport disablement.

V18 adds independent Report journal/inbox; no placement-snapshot backfill, Credit journal change or old migration edit. Existing minute scheduler selects due IDs in SQL (limit20), with per-command transactions/catches; no new whole-batch timer. New conditional admin resolve/status APIs and dedicated Google OIDC result receiver default disabled. Configuration/.env.example document explicit topics/URL/identity. No Report backend, GCP provisioning, deployment activation or frontend change. Reports stay local sample/cloud Coming soon. Existing progress/funding/penalty/admin-cancel rules are retained.

Report must implement operation preimage/revision checks, idempotent resolve, generation fences/tombstones, conditional restore and durable result outbox. This supersedes earlier proposed HTTP restore/result-query requirements only for Report resolution. Proposed exact protocol, diagram, migration and activation gates: docs/report-servicehandoff.md (relative to Order root); ADR-059 and changes/CHANGE-162-report-resolution-compensation-saga.md. Tests use explicit peer fixtures, not a verified live Report integration.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).


## Automatic repost retry repair — CHANGE-164 (2026-10-29)

Yao Xiang explicitly requests repeated automatic repost attempts until success. Existing NTH4/ADR-055/V16 flow is retained: SQL-only due selection, original NOWAIT lock/unique pending command guard, refund/requester/location checks, one forward Credit effect per immutable attempt, durable compensation on uncertainty, and atomic successor/link/plan-used/result commit.

Safe completed automatic rejections no longer permanently exclude the original. Each later eligible minute pass may register a fresh server-only AUTO_REPOST:<originalId>:retry:<UUID> command/candidate after the previous attempt is COMPLETED/REJECTED, FULLY_COMPENSATED and its Credit step is FAILED or COMPENSATED. First legacy key, all old candidate IDs/results/fences and public/peer payloads stay intact. Pending/reconciling/uncertain work blocks another attempt; success is replayed rather than repeated. DB selection prioritizes older due work over recently failed plans and remains bounded100; latest-attempt SQL is actor/order scoped, newest-first/limit1, not an in-memory history search.

No attempt-count cutoff is imposed on safe later attempts. Retry stops when a successor exists or the configured plan expires/is disabled/used; holds and deactivation/pending guards remain. Unresolved or exhausted compensation publication is not bypassed and retains the existing operator recovery requirement. No new schema, API, topic, credentials, timer, flag, frontend or sibling/backend/cloud change. Existing automatic-repost/compensation activation gates remain unchanged. Tests and rollout evidence: changes/CHANGE-164-automatic-repost-retry-until-success.md (relative to Order root).


## Reporting integration ? CHANGE-166

Report selectors and atomic hold placement exclude OPEN and terminal Orders; only ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED are reportable. This restriction does not change deletion/involvement checks. Reporting Service now implements the agreed resolution/compensation contracts and real Admin UI transport. Both saga flags remain opt-in; see [Report handoff](../reporting-service/HANDOFF.md).


Report saga cloud setup (CHANGE-167): `infra/gcp/configure-report-pubsub.sh staging|production prepare|wire` prepares identities and wires the existing subscriptions after deployment. Order Publisher grants remain untouched and both saga flags default false. Follow [Report rollout instructions](../reporting-service/HANDOFF.md#cloud-rollout-change-167-approved-2026-10-30); this does not provision resources automatically during CI.

Report enhancements (CHANGE-168): optional completed Order context for credit complaints, requester/courier-scoped SQL reads, nullable startedAt, duplicate-report protection and the caller-scoped courier response count are implemented. See [Report handoff](../reporting-service/HANDOFF.md). No credit adjustment or new topic is introduced.

Effective Report simplification (CHANGE-169): credit/general reports are unlinked and the original active-order dropdown is restored. The courier reply badge remains. Independent caller-scoped completed/cancelled Order history lives in OrderCreditHistoryController at /api/orders/mine/completed and /api/orders/mine/cancelled (list/detail); Report submission does not call these APIs. No new topics or migration.
