---

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.

name: spec-driven-development
description: Enforce the Order Service's persistent specification-driven and test-driven workflow. Use for implementation, bug fixes, behavior-affecting refactors, contract or architecture changes, sprint transitions, requirement reviews, and completion verification in this repository.
---

# Spec-Driven Development

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


Effective CHANGE-130 / ADR-043: `PenaltySystemPolicy` is shared only through the
ordinary root `foc-common` Maven library, package `sg.edu.nus.foc.common.penalty`.
Use root wrapper `-pl order-service -am verify` and root-context Order image
build. No auth/role/persistence extraction or sibling implementation is approved.


Treat repository documents as permanent memory and target zero unapproved deviation.

## Load context

Run this section at the start of every Order Service workflow, architecture, design, implementation, test, verification, resumption, or completion turn. Repeat it on later turns in the same conversation; repository state, not chat memory, is authoritative.

1. Read the parent `../AGENTS.md`, the service `AGENTS.md`, and every context file they mandate, including `docs/architecture-review-playbook.md`, `docs/architecture-evolution.md`, `docs/database-migration-workflow.md`, `docs/completion-reporting.md`, `docs/peer-service-api-feedback.md`, `docs/frontend-integration-workflow.md`, `docs/frontend-ui-style-guide.md`, `docs/ai-usage-format.md`, `docs/event-candidates.md`, the project AI usage log, and applicable traceability, override, API-feedback, contract-stub, and feature-proposal records.
2. Read the ignored `docs/local/developer-profile.md`, shared `docs/work-allocation.md`, and the matching file under `docs/active-work/`.
3. Check the current Git branch and compare it with the local profile, allocation, and active-work file. Stop for clarification if any are missing or inconsistent.
4. Follow `docs/current-sprint.md` to the active sprint documents.
5. Read any nested `AGENTS.md` that governs files likely to change.
6. Check authoritative-source fingerprints for drift.
7. Report the loaded context, current developer, assigned scope, active sprint, branch, applicable instructions, source drift, missing or contradictory records, open conflicts, blockers, and architecture-approval status before making workflow, architecture, or implementation decisions.

Before every coding turn, inspect the live shared `../frontend/` structure and configuration as required by `docs/frontend-integration-workflow.md`, read `../frontend/AGENTS.md`, read `docs/frontend-ui-style-guide.md`, and check frontend Git/active-work overlap. For frontend-impacting work, preserve the shared Next.js App Router conventions and visual baseline; identify `ADMIN`, `USER` Requester, or `USER` Courier impact; and do not assume a mapping to backend authorities.

For Order Service event publishers, keep Java files under `src/main/java/sg/edu/nus/foc/order/messagingpublisher/`. Store publisher interfaces in `messagingpublisher/interfaces/` and implementations in `messagingpublisher/publisher/` (lowercase Java packages). Follow the three effective `*TaskPublisher` pairs: `IOrderCompletionTaskPublisher`/`OrderCompletionTaskPublisher`, `IOpenOrderRefundTaskPublisher`/`OpenOrderRefundTaskPublisher`, and `IAcceptedOrderCancellationTaskPublisher`/`AcceptedOrderCancellationTaskPublisher`. Requester cancellation and scheduled OPEN expiry share `OpenOrderRefundTaskEvent` and its topic; the resulting Order status distinguishes `CANCELLED` from `EXPIRED`. Every completion uses `OrderCompletionTaskEvent`, with the seven-field compact body under CHANGE-092/ADR-031; this supersedes CHANGE-056/ADR-011 only for its payload, while accepted cancellation retains its snapshot. Under CHANGE-073/ADR-021, local Compose uses the three dev topics in the existing project with per-developer ADC; production topic IDs are environment-configured and Cloud Run uses its service identity. Do not use the Pub/Sub emulator or shared service-account keys; apply publisher IAM at topic scope. A real publisher must report success only after transport confirmation; never substitute a no-op. The user's peer-consumer assumption applies only to Order-side work and does not verify peer integration. Under CHANGE-063/ADR-013, persist the event in the same transaction as its resulting Order state/checkpoint/receipt, dispatch immediately after commit, and use Spring cron only for recovery. Delivery is at least once and consumers must deduplicate stable event IDs. Do not select unapproved persistence migrations implicitly.

## Establish authority and traceability

1. Identify exact Project D1 FR, NFR, or NTH IDs and read their complete text.
2. Identify applicable amendments/ADRs, sprint requirements, sequence steps, class responsibilities, and service contracts.
3. Apply the authority order in `AGENTS.md`.
4. Report every conflict and stop when authority is unclear.
5. Stop if no Project D1 requirement, approved amendment, or explicitly approved technical invariant supports the work.

## Pass the pre-coding gate

Report all fields required by the `AGENTS.md` specification/TDD gate. Resolve open questions before modifying production code. Do not infer undefined business, UI, authorization, retry, concurrency, failure, status, transition, field, or technology behavior.

Before any feature-level design, inspect the actual User, Supplier, Credit, and Admin peer-service implementations as required by `AGENTS.md`, with renewed focus on every service involved in the feature. Record the concrete request/response, authentication, communication style, errors, retries, idempotency, tests, and fitness for the requirement. Never invent or assume a peer API.

Use `docs/architecture-review-playbook.md` to produce the complete detailed component/class/sequence/contract/data/concurrency/failure/security/observability/test proposal required by `AGENTS.md`. Separate approved architecture, actual peer implementation, proposals, unresolved decisions, and approved deviations. Include applicable entries from `docs/event-candidates.md`, preserve stable candidate IDs, use separate decision IDs, and compare synchronous, polling/query, in-process event, and durable broker approaches. Stop and obtain explicit decisions for every interaction.

When a feature affects the frontend, also apply `docs/frontend-integration-workflow.md`: propose backend/frontend files together, actual contracts, application role and `USER` mode, desktop/mobile-web behavior, authorization, shared-file impact, and frontend tests. Significant shared API-client, auth, permission, layout, navigation, routing-model, or design-system changes require explicit approval.

Do not write application code, create implementation tests, modify implementation files, add a broker, change a contract, or consume a mismatched API before approval. For every foreign API, compare operation, request, response, return type, authorization, errors/statuses, communication style, semantics, tests, and sequence compatibility; classify it as matching, different-but-potentially-usable, similar-but-unsuitable, missing, or incomplete/incompatible.

Use a matching API only after recording implementation evidence and test obligations. For a potentially usable mismatch, present the exact comparison/risk report in `docs/architecture-review-playbook.md` and wait for approval. For a missing, unsuitable, incomplete, or incompatible dependency, append one entry to `docs/peer-service-api-feedback.md`, update the active-work stopping point, and keep the integration blocked; never modify the peer service without authorization or implement a temporary assumption.

When a peer reports completion, re-read its actual code/tests and set feedback to `VERIFIED` only after request, response, errors, authorization, semantics, and behavior match. Record approved prototype/stub assumptions and risks separately; they do not prove actual integration unless the user explicitly approves a contract-stub milestone as the endpoint.

During implementation, classify every discovered design gap using `docs/architecture-evolution.md`. A safe implementation detail may proceed inside the approved design; a material design refinement must be recorded; an architecture/specification change must be proposed with alternatives and trade-offs and explicitly approved before implementation. Preserve superseded history and synchronize requirements, architecture/class/sequence diagrams, data model, contracts, tests, and implementation. Never treat a recommendation as approval or continue from a superseded design.

Remain within the current developer's assigned sequence/features. Do not modify the other developer's implementation without explicit agreement. Record and coordinate changes to shared contracts, domain models, persistence, fixtures, or interfaces.

For every persistence or schema-affecting change, apply `docs/database-migration-workflow.md`: create a new versioned migration using the approved tool, commit or hand it off with the related code, apply it to the local PostgreSQL database, report the schema version and verification evidence, and require the consuming developer to apply the same migration history. Do not use manual-only schema edits, ORM auto-update, or an uncommitted local database as shared state. Order Service PostgreSQL/Cloud SQL and Cloud Run are approved by ADR-008; migration-tool selection and Sprint business implementation remain separately gated.

## Develop test first

Begin this section only after the feature design and all relevant interaction/API exceptions are explicitly approved and recorded.

1. Convert approved acceptance conditions, negative cases, boundaries, service ownership, and relevant NFRs into tests.
2. Write the smallest failing test first and run it to verify the expected failure.
3. Implement the minimum approved production behavior.
4. Run the focused test to green, then refactor without changing behavior.
5. Add and run applicable integration, contract, persistence, frontend, and regression tests. Frontend verification includes role/mode, unauthorized/incorrect-mode, and applicable responsive behavior plus `npm run lint` and `npm run typecheck`.
6. Keep backend and approved frontend support in the same feature slice. Do not invent UI while its specification is absent.

## On-demand pre-push CI rehearsal

Do not run this rehearsal automatically on every chat turn or every code
change. Run it once only when the developer explicitly asks to run the
Order-Service pre-push CI check, local CI rehearsal, or equivalent. The
rehearsal validates the Order Service slice before the developer pushes; it
does not push, commit, reset, or otherwise mutate Git history.

Scope the rehearsal to the current Order Service branch and approved shared
frontend vertical slice. Do not run sibling-service jobs merely because the
repository contains them. First inspect `git status --short` and the current
diff, then run the applicable checks below:

1. **Order Service backend** (when `order-service/` or its directly required
   shared configuration changed): run the OpenAPI structural guard used by CI,
   then `./mvnw -B -ntp verify` from `order-service/`. This includes the Java
   tests and the configured JaCoCo gate.
2. **Shared frontend** (when `frontend/` changed or the approved Order Service
   vertical slice includes frontend changes): from `frontend/`, run
   `npm ci --no-audit --no-fund`, `npm run lint --if-present`,
   `npm run typecheck --if-present`, and `npm test --if-present`.
3. **Container build**: build the changed Order Service image with its
   `Dockerfile`; also build the frontend image when frontend files changed or
   the vertical slice requires it. If Compose or gateway configuration changed,
   run `docker compose -f compose.yaml config --quiet` as a configuration
   check, then report that peer-service images were not part of this scoped
   rehearsal.

Report each command as passed, failed, skipped, or unavailable. A missing
runtime (for example Java, Node/npm, Docker, or GCP credentials) is a real
verification limitation and must not be reported as a pass. The rehearsal
does not replace GitHub CI: it does not run the full peer-service matrix,
Cloud infrastructure/IAM checks, actionlint, shellcheck, or authenticated
browser tests unless the developer explicitly requests those additional
checks.

## Preserve persistent memory

Record approved changes under `changes/`, append `docs/change-log.md`, update `docs/architecture-evolution.md` for design discoveries/supersession, and update affected context, ADRs, sprint files, contracts, diagrams, and tests. Update `../ai/usage-log.md` after approved architecture decisions and meaningful implementation, test-generation, or verification assistance, using `docs/ai-usage-format.md` and accurately attributing the developer's judgment. Update only the current developer's file under `docs/active-work/` at the beginning and end of every task. Never delete prior sprint records. For schema-affecting work, record the migration identifier, purpose, expected schema version, clean/upgrade verification, peer handoff, and rollback/recovery considerations in the related change or active-work record; cloud infrastructure provisioning does not replace application schema migrations.

## Teach and persist meaningful learning

Reuse the existing Order Service `learning/` directory. Do not create a parallel learning or
knowledge system. When a turn introduces a meaningful engineering concept, setup, architecture
decision, workflow, or implementation discovery, update the most relevant learning document rather
than creating a file for a trivial edit. Explain both the general transferable approach and the
current project's concrete application. Where useful, label statements as `General engineering
principle`, `Common implementation pattern`, `Current-project decision`, or
`Technology-specific implementation`; never present a project-specific choice as universally
required.

Learning entries should cover the problem, common patterns, alternatives and trade-offs, failure
modes, testing/verification, suitability for small/medium/production systems, and the exact
project files, services, requirements, decisions, diagrams, contracts, tests, and configuration
involved. Link the learning to the requirement -> architecture -> design -> contract -> test ->
implementation -> verification chain when applicable. If implementation discovers a meaningful
component, interaction, infrastructure resource, configuration, or practice, explain why it was
needed, classify it through `docs/architecture-evolution.md`, obtain approval for a material
change, and update the learning and affected persistent records. For major choices, present
general options and project-specific consequences, recommend one, and wait for explicit approval.

Use the existing learning document's appropriate sections, such as simple explanation, general
approach, current-project application, detailed implementation, alternatives/trade-offs, common
mistakes, testing/verification, beginner takeaway, and related requirements/decisions. Add
task-specific learning headers such as `What I learned`, `Why`, `Trade-offs`, `Learning
documentation`, and `Remaining questions` to the normal completion report when meaningful; they
supplement the required report and never replace it. Workflow-only learning updates must not
modify application source code.

## Verify completion

Verify acceptance conditions, negative/edge cases, relevant NFRs, contracts, service ownership, and absence of unapproved behavior. Produce the completion report required by `AGENTS.md`, including this table:

| Project D1 reference | Requirement | Implementation | Test | Result |
|---|---|---|---|---|
| F/NFR/NTH ID | Approved behavior | File/symbol | Test | Passed/Failed |

Do not mark a feature `[x]` or declare completion until every applicable completion-gate condition in `AGENTS.md` is satisfied, the detailed architecture is approved, actual peer APIs and any approved event contracts are tested, peer API feedback is verified or formally blocking, all required tests ran successfully without skips or false passes, the AI usage disclosure is current, and persistent records contain the verification evidence.

For every final response under this skill, read and use `docs/completion-reporting.md`, including advisory-only, status, planning, partial, blocked, decision-request, workflow, design, implementation, test, and verification turns. Lead with the direct answer or outcome. Include every required section once and in relative order, write `None.` when empty, and add meaningful scenario-specific headers or details before, between, or after them when useful. Do not create a separate per-turn summary file.


## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].
