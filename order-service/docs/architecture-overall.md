## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

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

# Overall Architecture

CHANGE-158/ADR-055 connects the previously fixture-only compensation saga using
the existing agreed HTTP + durable Pub/Sub request/result boundaries. Credit
retains financial ownership; Order retains lifecycle/journal/outbox/inbox.
Real transport is explicitly gated/default off; deployed environment/IAM
activation is separate. User/Supplier read APIs and other services unchanged.

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

ADR-043 / CHANGE-130 adds a build-time Maven dependency from Order to the root
foc-common penalty-policy library. Common is not a deployed microservice and
has no database or HTTP API. Other services may explicitly adopt later; their
implementations remain unchanged. Root Maven/Order Docker/CI/staging build the
same commit; existing production image promotion remains. Authentication local.

ADR-042 exposes Order-owned relationship facts for future User deletion/Supplier
deactivation clients. Providers own authorization/entity existence/deletion;
Order supplies only active-row snapshots. No cross-database deletion guarantee
or admission coordination is implemented. Names stay foreign lookup data; missing
supplier records receive a frontend display fallback. FEEDBACK-015 owns handoff.
Effective ADR-041: Order owns penalty reason-to-amount decisions; User Service
is expected to consume explicit addition/deduction with atomic eventId
deduplication and score update. Existing Credit events unchanged. Consumer
implementation/cutover/ordering is not verified by this publisher milestone.

Effective requester-report amendment: ADR-040 / CHANGE-127 implements Order-side
hold placement and funding guards using forwarded requester Firebase authorization
and own active Order. Report caller/investigation and release remain future scope.
Holds do not change lifecycle status or publish new messages; existing Credit/User
outcome contracts are unchanged. See decisions/ADR-040-requester-report-completion-holds.md.

CHANGE-122 uses the same gateway/local services but selects Admin frontend
provider by Compose runtime flag. Base sample UI versus HTTP override real UI;
both retain local databases/emulators. Cloud stays live-only. No topology/broker/
IAM or peer API change; source/deployed record sets are intentionally independent.

CHANGE-119 approves partial live Admin frontend integration through the existing
gateway: real Order/Supplier and User role/summary endpoints outside local;
existing local emulator sample APIs otherwise. Unfinished User/Credit features
are visibly unavailable and never called. Provider-owned data/authorization,
deployment topology and broker/persistence configuration remain unchanged.

CHANGE-114 adds public map tiles/address lookup to Admin frontend only; these
anonymous reads do not forward Firebase credentials and do not replace service
gateway/mock boundaries. Supplier/Order/User APIs and data ownership unchanged.
Current component/sequence refinement and limits are in ADR-039.

CHANGE-113 adds full dedicated Admin Order/Supplier views and top actions within
the existing frontend. No API/provider/topology change. Current navigation
sequence/components are documented in ADR-039.

CHANGE-112 adds selected-record routing and a shared credit-history presenter
to the existing local Admin prototype; ADR-039 contains updated class/sequence
diagrams. Only Order-local mock HTTP history is new. Real Credit admin history
is a documented pending provider contract, not a topology/deployment change.

ADR-039 / CHANGE-111 adds a local Admin UI prototype and replaceable HTTP adapter.
Order's isolated sample store serves demo endpoints; no peer ownership, real
financial/auth mutation, DB, broker or topology change. Effective diagrams:
decisions/ADR-039-admin-ui-local-mock-prototype.md.

ADR-038 / CHANGE-108 refines only owned command display and shared frontend
recovery. No topology/broker/service ownership or financial boundary change.
Server discovery restores pending ACCEPT/ABORT cards and CREATE/REPOST summaries.

ADR-037 / CHANGE-106 adds manual repost to existing synchronous durable commands.
No topology, broker, peer ownership or financial policy changes. Original/candidate
identity and UI pending/Continue follow the approved Order-only vertical slice.

## Effective local/runtime refinement — ADR-036 / CHANGE-105

Local Docker uses real HTTP services and an isolated demo Pub/Sub emulator, not
cloud topics/ADC/tunnels. Staging/prod retain Google publisher/OIDC and injected
topics. Order min1/always-CPU config supports existing timers; no cloud deployment
performed. Legacy CREATE/ACCEPT/ABORT use durable coordination; bounded async
outbox retains FAILED after ten attempts for ADMIN redrive. No financial policy,
wire schema or service ownership changes. Auto repost/delegation remains deferred.

## Effective integration amendment — ADR-035 / CHANGE-104

The existing Order-to-Credit synchronous boundary uses Credit's actual command protocol in HTTP deployments. Order owns intent/leases/lifecycle; Credit owns immutable financial results/compensation. Firebase user authorization is forwarded without persistence. Tokenless recovery requires user Continue; delegated identity remains deferred. Topology, minute orchestration and Pub/Sub cadence are unchanged. Earlier mock-only claims are historical.

## ADR-034 effective minute orchestration

Order owns one sequential minute job: eligible command recovery (existing
mock-only gate), OPEN expiry, then DELIVERED >=48-hour completion. Each phase
isolates errors; per-item transactions/locks/pending guards still arbitrate
requests and replicas. Outbox remains separate every 15 minutes with immediate
after-commit publication. No peer/API/data/deployment ownership change.

## ADR-033 effective foreground recovery refinement

The approved Order/frontend contract-stub slice adds durable CREATE/ACCEPT/ABORT
intent, claims and terminal results; it does not move Credit-owned financial
data or replace existing lifecycle/outbox/repost transport. The feature-level
sequence/class/data contract is [concurrency-order-credit.md](../concurrency/concurrency-order-credit.md).
No live HTTP recovery, delegated service credentials or broker change is enabled.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


CHANGE-088 / ADR-029 refines only the local test deployment: temporary restricted
HTTPS connects real isolated financial Pub/Sub subscriptions to local Docker Credit.
Current contracts/OIDC/data ownership and production topology are unchanged.
See [local runbook](local-live-testing.md); not a User consumer or retry implementation.

CHANGE-086 (Vincent, 2026-10-09) adds explicit automatic deadlines and latest
safe repost outcomes ONLY to Order's API/PostgreSQL and its shared frontend
slice. No platform topology, peer data ownership, topic/event payload, credential
or deployment changes. Trusted delegation/background retries remain paused.


CHANGE-084 / ADR-027 records approved HTTP polling (not WebSocket/SSE) and
Order-owned fixed-ID bounded repost retry rules. Trusted Order-to-peer delegated
authorization is a documentation-only proposal awaiting peer agreement, not a
new platform credential/API, deployment or implemented topology change.

Current cadence override (CHANGE-083 / ADR-026): one minute-based Order job
checks OPEN expiry and >=48-hour DELIVERED completion; all-three-event outbox
recovery every 15 minutes, immediate dispatch retained. No peer/cloud resources
changed. Repost target/gaps: docs/diagrams/order-lifecycle-reconciliation.md.

Authoritative diagram: `../../../High Level Architecture Diagram - FOC.png`.

## Runtime topology

The existing shared top-level Next.js application is the single responsive web client for desktop and mobile browsers. It supports the `ADMIN` application role and the `USER` role with Requester/Courier modes. `USER` modes are functions of one account; do not assume `ADMIN` can use them. The source diagram visually separates web/mobile and administrator clients, but ADR-004 records the approved implementation interpretation that both experiences live in this shared application. Each backend service still owns and persists only its own data, and backend authorization remains authoritative. Observability consumes machine-readable logs, metrics, and audit events. NTH5 CI/CD and cloud deployment builds, tests, deploys, configures, and supports recovery for the platform.

## Cross-service responsibilities

- Order Service asks User Service for identity, roles, and courier eligibility and publishes order facts such as `COMPLETED`, overdue completion facts, and `ABORTED`.
- Order Service asks Supplier Service to validate supplier pairs and resolve current supplier details.
- Order Service asks Credit Service to reserve credits for creation/repost and synchronously hold/reset the transaction before an unexpired accepted order transitions directly back to `OPEN`. For completion, open cancellation, and expired accepted cancellation it commits typed event intent atomically with matching status/checkpoint/receipt, then dispatches after commit; Credit owns settlement/refund and User owns penalty/score policy. CHANGE-063/ADR-013 and CHANGE-064/ADR-014 record these rules.
- On acceptance, Order Service synchronously asks Credit to associate the active reservation with the courier and persists `ACCEPTED` only after confirmation. The Order-side mock and proposed HTTP route are CHANGE-068/ADR-017; Credit implementation and service authentication remain open in FEEDBACK-004.
- Event subscribers: Credit refunds `OpenOrderRefundTaskEvent` for both requester cancellation and scheduled expiry of an OPEN order, refunds `AcceptedOrderCancellationTaskEvent` only for expired accepted cancellation, and transfers credits for every `OrderCompletionTaskEvent`. User applies the expired accepted-cancellation penalty and, for every completion, the overdue penalty or on-time score reduction. User is not involved in OPEN-order refunds.
- Admin Service monitors orders and may place/release completion holds or apply supported case resolutions through explicit Order Service contracts.
- Admin Service calls User and Supplier administrative contracts; it does not write their databases.
- By CHANGE-057/ADR-012, Order Service exposes an admin-authorized paginated all-orders query (optional status filter) to support future NTH1 dashboard integration; the dashboard remains Admin Service-owned.

The updated overall design uses one broker and typed completion/cancellation events. Sequence 6 uses `OpenOrderRefundTaskEvent` for both requester-triggered OPEN cancellation (`CANCELLED`) and Spring-scheduled OPEN expiry (`EXPIRED`); Credit refunds for either and distinguishes the outcome from the resulting Order status in the event snapshot. CHANGE-071 supersedes the separate expiration event approved by CHANGE-065/ADR-015. Every requester-confirmed completion and every 48-hour scheduled auto-completion publishes one `OrderCompletionTaskEvent`, with overdue facts for both Credit and User; CHANGE-056/ADR-011 unifies completion events and CHANGE-072/ADR-020 adds the scheduled completion trigger. Event snapshots contain resulting Order/repost fields but omit checkpoint history; completion overdue facts remain calculated internally (CHANGE-067/ADR-016). CHANGE-063/ADR-013 supersedes CHANGE-053's publish-first implementation ordering: Order status, checkpoint, command receipt where applicable, and event intent commit atomically; an after-commit listener attempts prompt delivery and Spring cron recovers pending entries. CHANGE-054 selects Google Cloud Pub/Sub; CHANGE-073/ADR-021 uses the same project with separate dev/prod topics, personal ADC locally, and a Cloud Run service identity in production. Delivery is at least once, so consumers deduplicate stable event IDs. Cloud Run scale-to-zero/request-based CPU does not guarantee cron while idle.
