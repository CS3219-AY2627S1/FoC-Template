# Architecture Decision Records

## ADR-047 presentation refinement — CHANGE-139

User directs compact41px table-top action bar, existing refresh icon and calendar date controls; dates are Order-owned read-only SQL filters. Existing ADR-047 financial/reason/auth contracts unchanged. [CHANGE-139](../../changes/CHANGE-139-compact-admin-toolbar-date-filter.md).


## ADR-047 — Admin row actions and saved explanations

[ADR-047](ADR-047-admin-order-resolution-ui-and-reasons.md), CHANGE-138: selection/toolbar/dialog, shared policy lookup, optional persisted explanation and V11, isolated demo/live providers. Existing penalties/funding/auth unchanged.


ADRs preserve approved business and architecture decisions that supersede or clarify other sources.

| ADR | Status | Summary |
|---|---|---|
| [ADR-046](ADR-046-admin-held-order-completion.md) | Approved2026-10-17 | Admin completes assigned active/held Orders, existing funding event and explicit highest penalty only; atomic replay/decision, ordinary holds retained |
| [ADR-045](ADR-045-start-based-persisted-delivery-timing.md) | Approved2026-10-17 | START deadline/delivery persisted, nullable cheap overdue read, admin decision on orders; V10; UI score feedback deferred |
| [ADR-044](ADR-044-admin-cancellation-and-overdue-read.md) | Approved2026-10-16 | Active/held admin cancellation, highest optional addition, unresponsive3 and overdue reader superseded by ADR-045; existing topics/outbox |
| [ADR-040](ADR-040-requester-report-completion-holds.md) | Approved placement/guard milestone; release deferred | Requester-owned report holds, funding freeze, immutable per-report placement, SQL filtering and locked rechecks; V9 |
| [ADR-041](ADR-041-explicit-courier-penalty-events.md) | Approved2026-10-14; consumer pending | Order enum +2/+1/-1, explicit add/deduct topics, seven courier fields; Credit events/legacy replay retained |
| [ADR-042](ADR-042-active-involvement-read-contract.md) | Approved2026-10-14; peer deletion clients pending | Shared-role User/Supplier SQL EXISTS snapshots; missing supplier UI label; no name storage/deletion lock |
| [ADR-039](ADR-039-admin-ui-local-mock-prototype.md) | User-approved local mock milestone and CHANGE-112..116/119..122/133 refinements, Yao Xiang 2026-10-11..15 | Admin UI/maps/details; base Compose samples, HTTP override/cloud partial live providers including selected-user Credit history; remaining gaps gated, peers read-only |
| [ADR-033](ADR-033-durable-credit-command-stub.md) | Approved contract-stub milestone, Vincent 2026-10-10; live recovery disabled | Durable foreground CREATE/ACCEPT/ABORT command claims/results and pending/auth-only UI; Credit historical protocol awaits owner agreement |
| [ADR-030](ADR-030-field-errors-and-new-repost-minimum.md) | Accepted, Vincent 2026-10-09 | Actual field errors; new auto due-to-expiry/manual submit-to-expiry min30; saved explicit plans grandfathered |
| [ADR-029](ADR-029-local-live-credit-push.md) | Accepted; local connector tested, cloud integration pending | Isolated financial push through exact-path authenticated local ingress; existing peer source/security/ledger ownership retained |
| [ADR-028](ADR-028-explicit-repost-expiry-and-latest-outcomes.md) | Accepted; locally verified, live gates open | Explicit automatic expiry, legacy no-expiry disable and latest safe failure persistence after rollback; background retries paused |
| [ADR-027](ADR-027-repost-retry-polling-and-peer-auth-proposal.md) | Polling implemented; background retries paused | Fixed-ID bounded retry design retained; trusted peer credentials documentation only; explicit expiry/outcomes now ADR-028 |
| [ADR-026](ADR-026-shared-lifecycle-and-quarter-hour-outbox.md) | Accepted; locally verified | Shared minute expiry/completion, 15-minute all-event recovery, immediate dispatch retained |
| [ADR-023](ADR-023-hourly-outbox-recovery.md) | Cadence superseded by ADR-026 | Historical hourly recovery; immediate dispatch retained |
| [ADR-022](ADR-022-quarter-hour-ui-and-scheduler-cadence.md) | Accepted by user direction; implemented; outbox interval superseded by ADR-023 | Quarter-hour Requester timestamp selection, 15-minute expiry, and preserved minute auto-completion/immediate dispatch |
| [ADR-001](ADR-001-approved-project-amendments.md) | Accepted | OVERDUE, ABORTED reopening, service ownership, supplier authority, and reposting amendments supplied for persistent use |
| [ADR-002](ADR-002-courier-outcome-contract-split.md) | Accepted | Replaces the generic courier outcome flag/facts contract with explicit completed, overdue, and aborted operations |
| [ADR-009](ADR-009-updated-overall-event-architecture.md) | Partially superseded by ADR-011/013/021; live broker delivery pending | Records typed completion/cancellation events and same-order accepted reopening; current Pub/Sub topics/authentication are governed by ADR-021 |
| [ADR-010](ADR-010-order-transition-authorization.md) | Accepted | Requires requester ownership for completion/open cancellation and assigned-courier ownership for acceptance/progress/accepted cancellation |
| [ADR-014](ADR-014-accepted-cancellation-hybrid-flow.md) | Accepted | Unexpired accepted cancellation waits for synchronous Credit hold then reopens; expired cancellation emits the refund/penalty event |
| [ADR-011](ADR-011-unified-order-completion-event.md) | Accepted by user request; implementation verified | Publishes one completion event for every completed order with overdue facts consumed by both User and Credit |
| [ADR-012](ADR-012-admin-order-list-query.md) | Accepted | Adds an admin-authorized paginated Order-owned listing API with optional status filter to support NTH1 |
| [ADR-013](ADR-013-transactional-outbox.md) | Accepted by user approval; implemented and verified | Replaces publish-before-status with atomic Order/outbox persistence, after-commit dispatch, leased claims, bounded retry, and cron recovery |
| [ADR-015](ADR-015-scheduled-open-order-expiration-event.md) | Spring scheduling remains effective; separate event type superseded by ADR-019 | Uses a Spring scheduler to expire due OPEN orders; scheduled expiry now emits shared `OpenOrderRefundTaskEvent` |
| [ADR-016](ADR-016-exclude-checkpoint-history-from-events.md) | Accepted by user request; implementation in progress | Removes checkpoint history from outcome event payloads while retaining Order history and overdue calculation |
| [ADR-017](ADR-017-credit-courier-assignment-before-acceptance.md) | User-approved Order-side stub; real Credit API pending | Synchronously associate the courier with the reservation before persisting Order acceptance |
| [ADR-018](ADR-018-order-version-owned-by-order-service.md) | Accepted | Keep Order versions in Order checks and event payloads; omit them from synchronous Credit requests |
| [ADR-019](ADR-019-shared-open-order-refund-event.md) | Accepted by user direction; implementation in progress | Reuses one `OpenOrderRefundTaskEvent` and topic for requester cancellation and scheduled OPEN expiry; status distinguishes the result |
| [ADR-020](ADR-020-48-hour-delivered-order-auto-completion.md) | Accepted by user direction; implementation verification pending | Automatically completes `DELIVERED` orders after 48 hours through the existing completion checkpoint and event/outbox flow |
| [ADR-021](ADR-021-real-pubsub-dev-and-prod-topics.md) | Accepted by user approval; GCP setup pending | Uses real Pub/Sub in one GCP project with separate dev/prod topics, developer ADC locally, and Cloud Run service identity in production |
| [ADR-003](ADR-003-detailed-architecture-and-integration-gate.md) | Accepted | Requires peer implementation inspection and explicit detailed architecture/API/interaction approval before code or implementation tests |
| [ADR-004](ADR-004-shared-nextjs-frontend-role-model.md) | Accepted | Uses one shared responsive Next.js application with `ADMIN`/`USER` roles and Requester/Courier `USER` modes, subject to backend-authority reconciliation |
| [ADR-005](ADR-005-architecture-evolution-tracking.md) | Accepted | Classifies implementation discoveries, requires approval for architecture/specification changes, preserves supersession history, and synchronizes affected artifacts |
| [ADR-006](ADR-006-foreign-service-api-verification.md) | Accepted | Classifies expected-versus-actual peer APIs, records missing/unsuitable dependencies in one feedback file, and requires actual implementation verification before resumption |
| [ADR-007](ADR-007-per-turn-completion-reporting.md) | Accepted | Requires one auditable completion-report baseline for every Order Service turn while allowing meaningful scenario-specific sections |

Create a new ADR for a later decision; do not rewrite historical decisions without recording their supersession.

- [ADR-024: Central role annotations](ADR-024-central-role-annotations.md) — accepted; production User roles, per-request identity/role reuse, local split.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].

- ADR-032: [Order polling and personal status filters](ADR-032-order-polling-and-personal-status-filters.md), user-approved CHANGE-094; existing personal API, five-second Order-only refresh, Abort errand UI terminology.

- ADR-043: [Shared Maven penalty policy](ADR-043-shared-maven-penalty-policy.md), CHANGE-130; ordinary root foc-common, Order first consumer, no auth/event contract change.


CHANGE-141 / ADR-048: delivered-item report review, single Resolved status, stored delivery overdue, report-specific release and precompletion penalty waiver. See changes/CHANGE-141-delivered-reports-and-review.md and docs/decisions/ADR-048-delivered-report-review.md. No workflow or skill changes.


ADR-049 — Synchronous courier-attempt penalty replacement and Report queue refinement (CHANGE-144, approved 2026-10-18). Supersedes only the unshipped adjustment-event proposal and new waiver UI; initial events unchanged.


ADR-050 — Deferred monotonic Order penalty (CHANGE-146), approved Yao Xiang2026-10-19. Supersedes ADR-049 synchronous replacement and the admin completion action in ADR-046. Existing report/hold/event architecture otherwise retained.


[ADR-051 — Private report replies and retired policy](ADR-051-private-report-replies-and-retired-policy.md): CHANGE-147, accepted2026-10-19; caller-scoped reply visibility and active/legacy policy compatibility.


[ADR-052 — Non-completed Order hold eligibility](ADR-052-noncompleted-order-hold-eligibility.md): CHANGE-153, approved2026-10-19; broader placement with existing funding guards retained.

[ADR-053 - Retire accepted-cancellation publishing](ADR-053-retire-accepted-cancellation-publishing.md): CHANGE-155, approved2026-10-19; preserve published history and require deployment backlog checks.

[ADR-056 - Report hold contract and admin provider links](ADR-056-report-hold-contract-and-admin-provider-links.md): approved independent scope; Report orchestration remains proposed/blocked.


- [ADR-057 — Ready Admin APIs and local-only Reports](ADR-057-ready-admin-api-and-local-report-demo.md), accepted CHANGE-160,2026-10-28.

- [ADR-058 — Real Admin User directory and resolution display](ADR-058-admin-user-directory-and-resolution-display.md), approved2026-10-29, CHANGE-161.


- [ADR-059 — Report resolution compensation saga](ADR-059-report-resolution-compensation-saga.md), user-approved guarded contract stub, CHANGE-162,2026-10-29; default disabled pending real Report protocol.


- [ADR-060 — Report response window and early resolution](ADR-060-report-response-window-and-early-resolution.md), user-approved documentation requirements2026-10-29, CHANGE-163; required deadline, confirmed early admin resolution, private reply and saga peer responsibilities.


- [ADR-061 ? Real Report saga and assigned-order reporting](ADR-061-real-report-saga-and-assigned-order-reporting.md): Report-side protocol implemented; four reporting states, real frontend and opt-in rollout.

- [ADR-062: Credit report context and courier reminders](ADR-062-credit-report-context-and-response-reminders.md) - approved completed-order association and scoped count, CHANGE-168.

- [ADR-063: Unlinked credit reports and independent Order history](ADR-063-unlinked-credit-reports-and-independent-order-history.md) - supersedes the credit association/picker parts of ADR-062; keeps the courier reminder, CHANGE-169.

- [ADR-064: Courier Errand reports](ADR-064-courier-errand-reports.md) - ERRAND, assigned-courier scope, direct review and distinct submitter/requester; CHANGE-171.

- [ADR-065 ? Unified Order reports and opposite-party responses](ADR-065-unified-order-report-responses.md): supersedes separate courier Errand submissions; preserves actual participant saga bindings.

- [ADR-066 ? Separate Order/Errand categories with opposite-party replies](ADR-066-separate-order-errand-with-responses.md): user-directed supersession of ADR-065 unified submissions; preserves holds/saga.

- [ADR-067: Courier suspension role context](ADR-067-courier-suspension-role-context.md) - retained courier role, acceptance-only flag, existing-work authorization and safe browser/durable recovery; CHANGE-179.


## CHANGE-185 / ADR-069 - sequenced penalty stream (2026-11-10)

Yao Xiang approves one courier-penalty-event topic per environment and per-courier transactional source numbering, durable User inbox/cursor/recovery, and coordinated legacy drain. Order/User plus necessary topic wiring are in scope; no frontend, scoring-policy or cloud-resource mutation. See [CHANGE-185](../../changes/CHANGE-185-sequenced-penalty-events.md). Implemented and locally verified: 727 Order and 284 User tests pass with no failures/errors/skips; both verify/coverage gates pass. AsyncAPI, 21 CI wiring tests, three local-emulator tests, Bash syntax and Compose configuration pass. Human review, cloud provisioning, broker smoke test and coordinated legacy drain remain pending. Detailed evidence is in CHANGE-185.
