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

# Order Service Agent Instructions

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


CHANGE-134 / ADR-044, approved2026-10-16: admin cancellation may cancel active
held Orders as an explicit resolution, retaining hold history. Reuse atomic
refund/highest optional penalty outbox. Common adds COURIER_UNRESPONSIVE=3.
OrderResponse isOverdue is a nullable batched checkpoint-based observation;
no requester/courier/scheduler hold bypass or service read-auth bypass.

CHANGE-132, approved 2026-10-15: shared enum is PenaltySystemPolicy, replacing
CourierPenaltyCase. Its reward/report-subset/full-list queries are pure lookup;
Order is the first consumer. Use getSuccessfulDeliveryReward for successful
completion. Enum constants/amounts/event wire remain unchanged; no peer changes.


Effective CHANGE-130 / ADR-043, approved by Yao Xiang 2026-10-15: penalty reason/
amount policy lives only in `../foc-common/src/main/java/sg/edu/nus/foc/common/penalty/`.
Order depends on the ordinary Maven library; no authentication is extracted.
Use root wrapper `-pl order-service -am verify` (PowerShell `.\mvnw.cmd`, Bash
`bash ./mvnw`). Root-context Order image/Compose/CI build includes that library.
No other service implementation is authorized by the extraction. Historical
Order-owned enum references are superseded only for Java placement, not behavior.


These instructions apply to the entire `order-service` repository. Repository files are the permanent project memory; chat history is not authoritative.

## Scope and authority

- Work only inside this repository unless the user explicitly approves a wider scope. For an explicitly approved Order Service vertical slice with frontend impact, `../frontend/` is the only permitted additional application-code scope; this does not authorize changes to sibling backend services.
- The approved Order Service architecture workflow authorizes updates to `../ai/usage-log.md` only when an Order Service architecture, implementation, test-generation, or verification task requires an AI disclosure. Do not modify any other parent or sibling file without explicit approval.
- Except for the approved AI-usage-log exception above, do not modify sibling services or the parent project.
- The parent `../AGENTS.md` and this file both apply. ADR-008 is the user-approved Order Service exception to the parent Firestore default: Order Service uses PostgreSQL on Cloud SQL and deploys to Cloud Run. This exception does not change sibling-service defaults. Any later technology or deployment conflict remains blocking until explicitly resolved.
- Apply specification authority in this order: approved persistent amendments and ADRs; latest approved FR/NFR documents; unamended Project D1 requirements; approved service contracts; approved overall architecture; active sprint scope; approved class and sequence diagrams; existing source; assumptions.
- Report conflicts and stop when authority is unclear. Never silently choose or invent business behavior.

## Developer identity and work allocation

At the start of every task:

1. Read `docs/local/developer-profile.md`.
2. Read `docs/work-allocation.md`.
3. Read the current developer's `docs/active-work/<developer>.md` file.
4. Check the current Git branch.
5. Compare the developer profile, assigned scope, active-work file, and branch.
6. Stop and ask for clarification if any are missing or inconsistent.

The ignored local developer profile identifies the current user. The shared work-allocation file identifies the team-wide division. Do not place a specific developer's personal assignment in this shared instruction file.

Only modify implementation within the current developer's assigned scope unless explicit approval is provided. A developer must not modify the other developer's assigned implementation without agreement. Discuss and record changes to shared contracts, architecture, requirements, domain models, test fixtures, interfaces, or database design before implementation.

At the beginning and end of every task, update the current developer's active-work file so unfinished work can be resumed in a later turn or conversation.

## Mandatory context loading

At the start of every Order Service workflow, architecture, design, implementation, test, verification, resumption, or completion turn, rehydrate the applicable context before taking action. Do this on every relevant turn even when the same chat remains open; never treat prior chat context as a substitute for repository state.

Read `../AGENTS.md`, `AGENTS.md`, `docs/local/developer-profile.md`, `docs/work-allocation.md`, the current developer's file under `docs/active-work/`, `docs/ai-project-context.md`, `docs/ai-project-context.toml`, `docs/current-sprint.md`, `docs/project-d1-reference.md`, `docs/architecture-overall.md`, `docs/architecture-order-service.md`, `docs/architecture-review-playbook.md`, `docs/architecture-evolution.md`, `docs/database-migration-workflow.md`, `docs/completion-reporting.md`, `docs/peer-service-api-feedback.md`, `docs/frontend-integration-workflow.md`, `docs/frontend-ui-style-guide.md`, `docs/ai-usage-format.md`, `docs/event-candidates.md`, `docs/service-contracts.md`, `docs/change-log.md`, every file in `docs/decisions/`, `docs/instruction-map.md`, and `../ai/usage-log.md`, followed by the sprint files referenced by `docs/current-sprint.md`. Read any existing requirements-traceability, specification-override, API-feedback, feature-proposal, and contract-stub records that apply. If a required record is absent, stale, contradictory, or inaccessible, report that before making a workflow, architecture, or implementation decision.

Before every coding turn, also read `../frontend/AGENTS.md`, inspect the current `../frontend/` structure, `package.json`, Next.js configuration, routes/layouts/components/styles/API clients/auth/permissions/tests, check `../frontend/` Git changes and overlapping developer work, and follow `docs/frontend-integration-workflow.md`. Reinspect immediately before any frontend edit; the recorded baseline is not a substitute for current repository state.

Before coding, report the loaded files, current developer, assigned scope, active sprint, current branch, applicable parent/nested instructions, source-drift result, open conflicts, active blockers, and architecture-approval status. If a nested `AGENTS.md` applies, read it before modifying files in that subtree.

## Detailed architecture and integration approval gate

Do not write application source code, create implementation tests, modify implementation files, add a broker, change a service contract, or use a mismatched peer-service API until the user explicitly approves the detailed feature-level design or the specific exception. Overall architecture is long-term context; Sprint architecture is the approved implementation subset. Neither replaces the other.

Before proposing any Order Service feature or sequence that depends on another service, inspect the actual peer-service repository. For the initial detailed Order Service review, inspect User, Supplier, Credit, and Admin Services; on later feature turns, recheck every relevant provider and any finding that may have become stale. Read applicable instructions, context/architecture, controllers/routes/handlers/consumers, request and response DTOs, service interfaces, client adapters, event schemas, contract and integration tests, communication configuration, API documentation, and usage examples where they exist. Determine the real request, response, authentication, communication style, errors, retries, idempotency, and fitness for the Order Service requirement. Do not invent an API before this inspection.

For every required foreign API, first establish the expected interface from the Order Service contract, requirements, architecture, class/sequence diagrams, and approved decisions. Compare the expected and actual operation/endpoint, parameters, request body, response/return type, authentication/authorization, errors/status codes, synchronous/asynchronous behavior, data semantics, tests, and compatibility with the required sequence. Classify it as exactly one of:

1. `MATCHES_APPROVED_CONTRACT`.
2. `DIFFERS_MAY_BE_USABLE`.
3. `SIMILAR_BUT_UNSUITABLE`.
4. `MISSING`.
5. `INCOMPLETE_OR_INCOMPATIBLE`.

A matching API may proceed to TDD only after its implementation, sequence fitness, responses/errors, and relevant existing/planned tests are recorded in the feature proposal or traceability. A logical contract or API documentation alone is not implementation verification.

If the actual API differs from the expected contract:

1. Show the expected and actual contracts and identify the mismatch precisely.
2. Explain whether the actual API can meet the required behavior and assess compatibility, data, security, and maintenance risks.
3. Explain whether a safe Order-side adapter or a provider API change is appropriate.
4. Obtain explicit approval before using the mismatched API.
5. If rejected, unsafe, unsuitable, missing, or incomplete, do not implement the integration. Append one `FEEDBACK-NNN` section to `docs/peer-service-api-feedback.md`, record the implementation stopping point in active work, and report the responsible peer action.
6. If approved, record the deviation and update all affected context, structured metadata, current/superseded contracts, architecture/class/sequence/data design, ADR/override, architecture evolution, traceability, change log, tests, approval date/approver, and `../ai/usage-log.md` before implementation.

For `DIFFERS_MAY_BE_USABLE`, use the exact mismatch report in `docs/architecture-review-playbook.md`, classify it as backward-compatible, adapter-safe, expectation-changing, or unsafe/semantically incorrect, compare alternatives/trade-offs, and wait for approval.

For `SIMILAR_BUT_UNSUITABLE`, `MISSING`, or `INCOMPLETE_OR_INCOMPATIBLE`, never implement a temporary assumption. Read and append the shared feedback file without overwriting prior entries; do not modify the peer service; keep Order Service integration blocked; and copy the required dependency, expected/actual state, feedback ID, unchanged files, stopping point, required action, and next verification step into the current developer's active-work blocker.

After a peer reports implementation, set the entry no further than `READY_FOR_VERIFICATION`, then re-read the actual peer code/tests and verify request, response, errors, authorization, semantics, and communication behavior. Set `VERIFIED` only from that evidence. If it still differs, repeat the mismatch approval process. A user-approved API prototype may support a separately approved contract-stub milestone, but record its assumptions, stubs/tests, compatibility requirement, and remaining risk; do not claim the integration complete until the actual peer implementation is verified unless the user explicitly defines that milestone as the endpoint.

Follow `docs/architecture-review-playbook.md` for the detailed proposal, API-gap, deviation, AI-disclosure, required-response, and post-approval checklists. The proposal must identify the exact FR/NFR/NTH and amendments; current approved architecture; actual peer APIs; component and class design; service-level sequence; actors; control/data flow; synchronous and event interactions; inbound/outbound contracts; data ownership and persistence; concurrency, consistency, idempotency, retry/failure, security/authorization, observability/audit; test strategy; affected source/documentation; API gaps; alternatives and trade-offs; operational/infrastructure impact; and every decision requiring approval. Label each statement as `Approved existing architecture`, `Existing peer-service implementation`, `Proposed design`, `Unresolved decision`, or `User-approved deviation`.

Read `docs/event-candidates.md` before every feature-level architecture proposal. Preserve its stable `EV-1` through `EV-7` candidate IDs and use separate `EV-DEC-NNN` decision IDs; never treat a candidate as an approval. For every proposed event interaction, compare synchronous request-response, query/polling, an internal in-process domain event, and a durable broker event. Cover coupling, latency, consistency, delivery reliability, duplicates, ordering, retry/dead-letter recovery, idempotency, versioning, debugging/testing cost, infrastructure, security/privacy, whether the interaction blocks the operation, and whether Project D1 requires it. A non-real-time interaction is not automatically event-driven, and no event with `PROPOSED` status may be implemented.

After presenting the design, stop and request a decision for each interaction: synchronous, internal event, durable broker event, query/polling, hybrid, reject, more analysis, or peer-service API change. Never fill in the user's decision. Record approved event decisions in the existing ADR system; create `docs/decisions/event-driven-decisions.md` only if no suitable record exists. A broker approval must also resolve outbox/transactional publication, schema versioning, idempotent consumers, retry/dead-letter recovery, monitoring, compatibility rules, and contract tests.

Approved communication boundaries:

- Credit reservation and every credit-related order outcome are synchronous before the corresponding Order operation is finalized. This does not add Credit calls to ordinary `ACCEPTED -> IN_PROGRESS`, `IN_PROGRESS -> PICKED_UP`, or `PICKED_UP -> DELIVERED` transitions.
- Order Service owns lifecycle/status; Credit Service owns balances, reservations, releases, transfers, settlement, deductions, and credit policy.
- Penalty policy stays in User Service. Under CHANGE-063/ADR-013, Order Service commits factual completion/cancellation event intent atomically with the matching Order status/checkpoint; User Service decides all penalty, score, and suspension effects. Dispatch is attempted after commit and retried from the outbox.
- `OVERDUE` remains a completion-time Order-owned flag and timestamp, not a status or continuously scheduled monitor.
- Immediate validation, acceptance/concurrency, authoritative transitions, and operations needing an immediate result use synchronous communication. Dashboard/history/list queries, internal timers, expiry, and reposting do not require a broker merely because they are asynchronous or time-based.

## Architecture evolution during implementation

Read and apply `docs/architecture-evolution.md` on every implementation-affecting turn. Before acting on a discovery, classify it as an `Implementation detail`, `Design refinement`, or `Architecture or specification change`.

- A safe implementation detail may proceed only within the approved design and assigned scope.
- Every material design refinement must be documented in the architecture-evolution register and related change record. Ask when the classification or effect on an approved class/sequence responsibility is uncertain.
- Every architecture/specification change requires explicit user approval before application code, implementation tests, diagrams, contracts, or behavior are changed. The AI's recommendation is not approval.

Before a material design change, show the original requirement/design, discovered problem, insufficiency, proposed additions/changes/removals, at least two viable options where appropriate, advantages/disadvantages, complexity/maintainability/performance/consistency/testing/future-change trade-offs, recommendation and rationale, affected artifacts/files, classification, and approval requirement. Ask the user to approve, reject, or modify the proposal.

For every approved evolution, preserve the original history; record the stable evolution/change/decision IDs, approver, effective date, current rule, implementation status, and supersession links; then synchronize the requirement, architecture diagram, class diagram, sequence diagram, data model, contract, test, and implementation chain. Any affected artifact still describing the superseded design is a completion blocker.

## Shared local database and migration workflow

- Follow `docs/database-migration-workflow.md` for every schema-affecting Order Service change, even when each developer uses an independent local database.
- A local database edit is not a shared schema change until a new, versioned migration file is created with the approved migration tool and committed or handed off with the related persistence change.
- Never use manual SQL, IDE edits, ORM auto-update, or an uncommitted local database as the shared schema source of truth. Never edit an already-applied migration; add a corrective migration.
- The migration handoff must identify the migration ID, purpose, affected objects, required command, expected schema version, clean/upgrade verification, tests, and rollback/recovery considerations.
- The developer owning the sequence 1-6 shared foundation must coordinate initial Order schema ownership with the developer consuming it in sequences 7-11. A schema or migration conflict blocks implementation until reconciled.
- Do not select Flyway, Liquibase, a migration directory, or a cloud database migration path implicitly; record and obtain approval for the tool and persistence/deployment design first.

## Beginner learning documentation workflow

- Reuse the existing `learning/` directory for meaningful engineering learning; do not create a competing learning, knowledge, or developer-guide directory.
- This learning workflow applies to the current Order Service project, including backend, shared frontend integration, database, testing, cloud-native, CI/CD, security, and operations work. It does not authorize application-code changes by itself.
- When a meaningful engineering concept, setup, architecture decision, workflow, or implementation discovery is introduced, create or update the most relevant existing learning document. Do not create a learning entry for every trivial edit.
- Explain both levels: (1) the general transferable engineering approach, including alternatives, trade-offs, failure modes, testing, and when it fits small, medium, and production systems; and (2) how this project applies it, including exact files, services, contracts, diagrams, tests, configuration, requirements, and approved decisions.
- Label the distinction clearly as `General engineering principle`, `Common implementation pattern`, `Current-project decision`, and `Technology-specific implementation` where useful. Do not present an Order Service decision as the only universally correct solution.
- Link learning to the traceability chain where applicable: requirement -> architecture decision -> design -> contract -> test -> implementation -> verification. Preserve original and superseded designs when architecture evolves.
- If implementation reveals a meaningful class, interaction, infrastructure component, configuration, or engineering practice, explain what was discovered, why it was needed, classify it as an implementation detail, design refinement, or architecture/specification change, record approval when required, and update the learning document and affected records.
- When multiple reasonable choices affect architecture, security, data, contracts, deployment, or operations, explain the general options and project-specific trade-offs, recommend one, and ask for explicit approval. Do not silently teach or record a proposal as an approved decision.
- Use this learning-document structure when appropriate: `Simple explanation`, `General software engineering approach`, `How this project applies it`, `Detailed implementation`, `Alternatives and trade-offs`, `Common mistakes and failure modes`, `Testing and verification`, `Beginner takeaway`, and `Related requirements and decisions`.
- After meaningful work, add task-specific learning details to the normal completion report (for example `What I learned`, `Why`, `Trade-offs`, `Learning documentation`, `Verification`, and `Remaining questions`). These details supplement, and do not replace, the required completion-report headers.
- Workflow updates that add or clarify this learning process must not modify application source code.

## Specification-driven development

- Project D1 is the primary product specification.
- Approved amendments and architecture decisions override conflicting D1 details.
- All approved changes must be recorded.
- The overall architecture is the long-term blueprint.
- `docs/current-sprint.md` defines the active Sprint scope.
- Sprint-specific implementation must remain compatible with the overall architecture.
- Sequence diagrams, class diagrams, contracts, tests, and implementation must remain consistent.
- Follow the latest approved effective design in `docs/architecture-evolution.md`; never implement from a superseded design or conversational memory.
- Check every implementation against its Project D1 requirements before and after coding.

Before production-code changes, identify and report the current sprint and feature; exact Project D1 FR/NFR/NTH references and full relevant requirements; approved amendments; sprint requirements; relevant sequence steps and class responsibilities; contracts, components, external services, and data ownership; in/out-of-scope behavior; assumptions; open questions; tests to write first; and expected files.

Use this exact gate:

```text
Current sprint:
Feature:
Project D1 references:
Relevant amendments:
Relevant FRs:
Relevant NFRs:
Relevant sequence diagram:
Relevant class diagram:
Relevant service contracts:
Actual peer-service APIs inspected:
API mismatches or gaps:
Affected backend components:
Affected frontend components:
Frontend directory and structure inspected:
Affected application role and USER mode:
Desktop and mobile-web behavior:
External services involved:
Data owned by Order Service:
Data owned by other services:
In-scope behavior:
Out-of-scope behavior:
Assumptions:
Open questions:
Detailed design approval status:
Interaction decisions awaiting approval:
Tests to write first:
Files expected to change:
```

Stop for clarification when requirements, diagrams, ownership, contracts, authorization, concurrency, retries, errors, statuses, transitions, UI behavior, fields, or technology are missing or contradictory.

## Test-driven development

For every feature:

1. Identify the relevant D1 FR, NFR, NTH, or approved amendment.
2. Define acceptance criteria and traceability references.
3. Write failing tests first and confirm the expected failure.
4. Implement the minimum required behavior.
5. Run the focused tests and confirm success.
6. Refactor only after tests pass.
7. Run relevant regression, integration, contract, persistence, and frontend tests.
8. Verify the result against Project D1 and approved diagrams.
9. Mark the feature complete only when the completion gate passes.

Do not write production business logic first.

Before coding, trace the feature to exact Project D1 IDs, sprint requirements, sequence steps, class responsibilities, contracts, and tests, and identify every amendment difference. During coding, implement only approved behavior. After coding, run focused and relevant regression tests; verify acceptance, negative/edge cases, NFRs, and ownership; confirm no unapproved deviation; and produce a traceability table.

## Non-negotiable feature completion gate

Keep an incomplete feature as `[ ]`, `[~]`, or `[!]`. Mark it `[x]` only after all applicable conditions are satisfied and evidence is recorded in the current developer's active-work file:

1. Traceability to the relevant Project D1 FR, NFR, NTH, or approved amendment.
2. Conformance to the approved Sprint 1 sequence diagram.
3. Conformance to the relevant class diagram.
4. Conformance to the relevant service contracts.
5. Required unit tests pass.
6. Required integration tests pass.
7. Required contract tests pass when another service is involved.
8. Required frontend tests pass when the feature affects the frontend, including correct `ADMIN`/`USER` role and Requester/Courier mode, unauthorized and incorrect-mode access, and applicable responsive behavior.
9. Relevant regression tests pass.
10. No required test is skipped, disabled, ignored, missing, unavailable, or falsely passing.
11. Project D1 acceptance criteria are verified.
12. The active-work file records completed work and verification evidence.
13. The feature-level architecture and every interaction were explicitly approved, and no architecture/API decision remains unresolved.
14. Actual peer-service APIs were verified by contract/integration tests where another service is involved.
15. Approved event contracts, delivery behavior, and idempotency were tested when events are used.
16. Peer-service API feedback is `VERIFIED` or explicitly recorded as a blocker; prototype/stub risk is not represented as verified integration; and required AI usage disclosure is current.
17. Every applicable schema change has a reviewed, versioned migration file in Git, has been applied and verified by the consuming developer, and has no unresolved migration-order or schema conflict.

Code written, an application that starts, a partial demonstration, or only some passing tests is not completion.

## Architecture and ownership invariants

- Use Spring Boot, React, PostgreSQL on Cloud SQL, Docker, and Cloud Run only as confirmed by repository configuration or an approved setup change. ADR-008 is the approved Order Service persistence/deployment decision; it does not authorize unrelated Sprint business implementation.
- Do not introduce another framework, database, API style, broker, or deployment technology without approval.
- Order Service owns order lifecycle, status, courier assignment, transitions, checkpoints/history, supplier references, repost links, order flags, and publication of order facts/outcomes.
- User Service owns identity, roles, courier eligibility, penalties, and suspension.
- Supplier Service owns suppliers, activation, locations, and catalogue details.
- Credit Service owns balances, reservations, release, transfer, settlement, deduction, and credit policy.
- Admin Service owns monitoring, reports/cases, administrative decisions, user administration, and supplier/catalogue administration.
- Never write another service's database. Use explicit contracts and stable identifiers.

Persistent invariants:

- `OVERDUE` is a flag evaluated when an order reaches completion, not a status or continuously scheduled monitor.
- Do not implement `ABORTED` to `OPEN` reopening unless the active sprint explicitly requires it and a later approved decision authorizes it.
- Penalties are calculated only by User Service.
- Completion/cancellation events use separate typed contracts and event-specific publishers. Do not pass an `outcomeType` control flag or a generic `facts` property bag. CHANGE-063/ADR-013 supersedes CHANGE-053's publish-first ordering: persist the typed event with the resulting status/checkpoint/receipt in one transaction, then dispatch after commit.
- Supplier details remain authoritative in Supplier Service; Order Service stores references.
- Reposting creates a new linked order after expiry. At most one repost may exist per original. Automatic and manual paths must be idempotent, and credits must be reserved before the repost becomes `OPEN`.
- Credit reservation before `OPEN` and `evaluateOpenEntry` for same-order reopening remain synchronous. For updated Sequences 5-7, CHANGE-063/ADR-013 requires the Order status/checkpoint/receipt and typed task event to commit atomically; after-commit dispatch tries immediately and the Spring cron job recovers pending rows. Ordinary courier progress transitions do not call Credit Service.
- Events include the full Order snapshot requested by the user. Credit and User consumers are future peer work and are assumed for the Order-side publisher milestone; this assumption does not verify peer integration or authorize changes to their source.
- Outbox delivery is at least once: a crash after Pub/Sub accepts an event but before its published marker commits may cause redelivery. Preserve stable event IDs and require consumer deduplication. Cloud Run scale-to-zero with request-based CPU does not guarantee cron recovery while idle; do not change its cost-affecting settings without approval.

## Sprint and shared frontend controls

- `docs/current-sprint.md` is the only active-sprint pointer. Never hard-code the current sprint in this file.
- Preserve prior sprint directories when a later sprint starts.
- Implement only approved active-sprint behavior; do not pull future features from overall diagrams.
- All frontend work uses the existing shared top-level `../frontend/` Next.js application for desktop and mobile browsers. Do not create a competing frontend or native mobile application without explicit approval.
- Application roles are `ADMIN` and `USER`; Requester and Courier are modes/functions of one `USER` account. Do not assume `ADMIN` can use either mode. Do not silently equate these application concepts with backend requester/courier/admin authorities; inspect the actual User Service contract and obtain approval for the mapping.
- Follow `docs/frontend-integration-workflow.md` for Next.js boundaries, per-turn inspection, shared-developer safety, role/mode behavior, responsive design, vertical-slice approval, testing, completion, and reporting.
- Follow `docs/frontend-ui-style-guide.md` for the shared staging visual baseline: Geist Sans, semantic neutral tokens, existing shadcn/Base UI primitives, Lucide icons, restrained surfaces, and responsive layout harmony. Re-inspect the live frontend before implementation; do not infer product behavior from the screenshot.
- Progress backend and frontend as a vertical slice when approved UI requirements exist. Until a detailed UI specification exists, do not invent layouts, controls, navigation, styling, interactions, or a mode switcher.
- Treat a user-visible Order Service capability as frontend-impacting by default. Before marking the backend slice complete, either implement and verify its companion shared-frontend route/components/API integration or record an explicit backend-only decision with the reason and the deferred frontend scope. Backend-only completion must not silently leave a user-visible capability without a frontend path.
- When the companion frontend is in scope, build and test it in the same task boundary as the backend slice. Use the existing `../frontend/` Next.js application for both desktop and mobile browsers, the existing gateway-relative `useApi()` client, the existing Geist/shadcn/Base UI/Lucide style baseline, and the applicable `ADMIN`/`USER` mode contract.
- The local full-stack verification path is the root `compose.yaml`: Order Service uses the local `order-postgres` container and Flyway migrations, while Cloud SQL remains a deployment-only configuration. The root command is `docker compose up --build`; do not put Cloud SQL credentials into the local image or Compose file.
- Frontend checks never replace backend authentication or authorization. A route or hidden control does not grant permission.

## Change control and handoff

### Shared-file and peer-service boundary

- Treat every sibling microservice directory (`../credit-service/`, `../supplier-service/`, `../user-service/`, `../admin-service/`, and any future service directory) as read-only during Order Service work. Do not modify, reformat, rename, delete, or commit files there unless the user explicitly authorizes a separate peer-service task.
- Shared project files such as `../compose.yaml`, `../.env.example`, gateway configuration, CI workflows, and root scripts may receive only the smallest Order Service-specific addition required by the approved slice. Preserve peer-owned blocks and their behavior; do not refactor or replace them.
- If peer-authored shared configuration prevents the approved local Order Service slice from running, first record the conflict in active work/change records. Only comment out the incompatible peer line/block with an explanatory comment and a restoration condition; never delete it. Do not comment out peer configuration merely to simplify the stack.
- Before changing a shared file, inspect its current Git diff and identify the exact Order Service-owned lines. At the end, verify that unrelated peer sections are byte-for-byte unchanged where practical and report any unavoidable shared-file conflict.
- Atomic commits must separate Order Service source/configuration, shared-file additions, and workflow/disclosure changes. Do not stage unrelated peer-service files or pre-existing user changes.

### Small atomic-change protocol

- Treat every file change as part of the smallest coherent concern. Do not accumulate unrelated source, test, shared-configuration, workflow, documentation, or disclosure edits in one commit.
- At the start of a change unit, run `git status --short` and inspect existing diffs. Before committing, review the exact patch and confirm that no peer-owned or pre-existing user change is included.
- Stage explicit paths (`git add -- <path>...`), never the whole worktree by default. Use one atomic commit for a concern that necessarily spans several files; split independent concerns into separate commits.
- Before each commit, run the smallest applicable deterministic check, `git diff --cached --check`, and a staged diff/stat review. Use conventional prefixes (`feat`, `fix`, `test`, `docs`, `ci`, `refactor`, or `chore`) and describe one concern in the subject.
- Commit the verified unit promptly, then record its hash in the applicable change record or active-work handoff. Do not amend, reset, or discard another developer's commit or unrelated local work.
- If a change cannot be committed yet, leave it explicitly marked as in progress in active work and report the exact uncommitted paths and reason; do not silently mix it into the next task.

- For each approved behavior, requirement, architecture, ownership, contract, diagram, test, sprint, deployment, or technology change, create `changes/CHANGE-XXX-short-description.md`, update `docs/change-log.md`, update `docs/architecture-evolution.md` when a design discovery or supersession is involved, and update affected context.
- Do not silently modify requirements, architecture diagrams, class diagrams, sequence diagrams, service contracts, database ownership, or service boundaries. Record approval before implementation.
- Formatting and typo-only edits do not need a change record. Do not record rejected or speculative ideas as approved.
- Update only the current developer's file under `docs/active-work/` whenever work begins, ends, remains unfinished, or is handed off.
- Update `../ai/usage-log.md` after an approved architecture decision and after meaningful Order Service implementation, test-generation, or verification assistance. Follow `docs/ai-usage-format.md` exactly, preserve the established bold-label style, state that AI supported research/comparison and that the developer selected the architecture, and never claim that AI independently approved it.
- Do not claim feature completion without requirement verification, test-first evidence, successful tests, traceability, and necessary persistent-context updates.

For the final response of every Order Service chat turn, including advisory-only, status, planning, partial, blocked, decision-request, workflow, design, backend, frontend, test, and verification turns, use the required `Added`, `Updated`, `Removed`, `Design Decisions`, `Affected Artifacts`, `Verification`, and `Remaining Issues` sections defined in `docs/completion-reporting.md`. Use `None.` where applicable. Lead with the outcome or direct answer, and add meaningful scenario-specific headers/details before, between, or after the required sections when they improve clarity; keep the required sections in their relative order. For frontend work, also identify the frontend directory/structure used, affected backend service files, affected application role/`USER` mode, API contracts, and unresolved blockers. Do not create a separate Markdown summary file for each turn.

After implementation, add the following task-specific details to the required report where applicable; these details do not replace the seven required sections:

```text
Implemented:
- ...

Project D1 verification:
- D1 FR/NFR/NTH IDs checked:
- Relevant amendments checked:
- Requirement traceability table:
- Acceptance tests passed:
- Negative and edge-case tests passed:
- Unresolved deviations:

FR traceability:
- ...

NFR traceability:
- ...

Sequence-diagram steps:
- ...

Class-diagram responsibilities:
- ...

TDD tests written first:
- ...

Tests executed and results:
- ...

Frontend work:
- ...

Backend work:
- ...

Contracts used or changed:
- ...

Change ID:
- ...

Files changed:
- ...

Architecture impact:
- None / explain

Persistent context updated:
- Yes / no

Sprint context updated:
- Yes / no

Nested AGENTS.md files added or updated:
- None / list

Remaining risks or questions:
- ...
```

Use `.codex/skills/spec-driven-development/SKILL.md` for the executable workflow and `skills.md` for the human-readable index.

## Java structure and readability

- Use explicit Java types. Do not use `var` in Order Service source or tests.
- Keep imports, fields, annotations, constructors, methods, branches, and statements on readable separate lines. Follow conventional Java spacing.
- Define API request and response DTOs as named top-level classes in separate `api/dto/request/` and `api/dto/response/` files. Do not group API contracts into nested records.
- Keep DTOs free of domain-to-response conversion logic. Use Spring-managed MapStruct mapper interfaces with explicit `@Mapping` declarations for API response conversion.
- Use Lombok annotations such as `@Getter`, `@Setter`, `@NoArgsConstructor`, `@AllArgsConstructor`, and `@RequiredArgsConstructor` for routine boilerplate where they preserve the intended access boundary.
- API DTOs may expose generated getters and setters for serialization. Domain aggregates and entities expose generated getters but must not receive public setters that bypass lifecycle invariants; use explicit domain behavior methods for state changes.
- Application services depend on domain repository interfaces with use-case-oriented methods. Spring Data repository interfaces, derived `findBy...` methods, page construction, locking queries, and JPA-specific persistence details stay in `infrastructure/` adapters.
- Use constructor injection for required application dependencies. A framework-bound configuration value may use a narrowly scoped Spring injection annotation when Lombok cannot safely copy the annotation to a generated constructor parameter.
- Keep Order Service event publisher Java files under `src/main/java/sg/edu/nus/foc/order/messagingpublisher/`. Put publisher interfaces under `messagingpublisher/interfaces/` and Spring-managed publisher implementations under `messagingpublisher/publisher/`; keep Java package names lowercase (`messagingpublisher.interfaces` and `messagingpublisher.publisher`).
- Use one typed publisher interface and one matching implementation per approved event. Current names are `IOrderCompletionTaskPublisher`/`OrderCompletionTaskPublisher`, `IOpenOrderRefundTaskPublisher`/`OpenOrderRefundTaskPublisher`, and `IAcceptedOrderCancellationTaskPublisher`/`AcceptedOrderCancellationTaskPublisher`. Requester cancellation and scheduled OPEN expiry share `OpenOrderRefundTaskEvent`; the resulting Order status distinguishes `CANCELLED` and `EXPIRED`. Both overdue and non-overdue completion use `OrderCompletionTaskEvent`, with the seven-field compact body under CHANGE-092/ADR-031; accepted cancellation alone retains its existing snapshot. Keep the same sequence method name on each pair.
- Google Cloud Pub/Sub is selected by CHANGE-054. Under CHANGE-073/ADR-021, local development publishes to `order-completion-dev-v1`, `open-order-refund-dev-v1`, and `accepted-order-cancellation-dev-v1` in project `protean-vigil-509704-q4` using per-developer ADC; production uses separately configured topics and the Cloud Run service identity. Do not restore the Pub/Sub emulator or share service-account keys. Grant publisher IAM at topic scope only. Under CHANGE-063/ADR-013, Order state and event intent commit atomically; after-commit dispatch attempts publication and cron recovers pending rows. The publisher must wait for a Pub/Sub message ID before marking an outbox row published; do not treat a no-op/log statement as publish success.


## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


Effective CHANGE-159 / ADR-056 (Yao Xiang, 2026-10-28): public requester report contract is active-only, token-scoped list/atomic hold under /api/orders/mine/active; retries reuse the binding and return current Order facts (no placement-snapshot migration). Admin cancellation null/empty selections explicitly waive scoring despite stored provisional policy; selected additions use the maximum. Ordinary held refund/penalty outcomes stay paused, delivery progression continues. Reporting synchronous coordinator is deferred until non-callback resolve/query/conditional-restore contracts exist. See docs/reporting-order-integration.md.
