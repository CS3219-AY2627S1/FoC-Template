# Instruction Map

## Compact date-filter implementation

CHANGE-139 and service-contracts.md define the current calendar/date-search boundary; diagrams/admin-order-query-filters.mmd records query flow. This is an implementation/design refinement, not a workflow/skill amendment.


## Admin resolution UI context

CHANGE-138 / ADR-047, service-contracts.md, database-migration-workflow.md and diagrams/admin-order-resolution-ui.mmd are effective for row selection, saved reasons and V11. No new workflow/skill rule.


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


Current pending-display authority: [ADR-038](decisions/ADR-038-server-discovered-pending-card-recovery.md),
CHANGE-108 and ARCH-EVO-044. Vincent approved owner-only command display details,
shared discovery/card binding and separate creation/repost summaries. No schema,
general read-access, Credit/financial/event/infrastructure change.

Current manual-repost authority: CHANGE-106 / ADR-037, explicit Vincent approval.
Its class/sequence/data diagrams and protocol supersede earlier manual deferrals
only; automatic/delegation and peer source remain out of scope.

CHANGE-105 / [ADR-036](decisions/ADR-036-local-emulator-and-review-hardening.md)
is effective for local emulator transport, narrow Credit security exception,
legacy durable routing, replay/read protection, V6/V7 and retained-failure
outbox. See local-live-testing.md and
concurrency/credit-local-emulator-security-interference.md. Historical local
cloud/tunnel instructions are superseded; scripts/local-live.ps1 refuses to run.

CHANGE-104 / [ADR-035](decisions/ADR-035-live-credit-command-recovery.md)
supersedes the earlier HTTP mock-only gate. Current provider integration,
verification limits and run instructions are recorded in the existing
concurrency handoff and local-live-testing.md. Historical records are retained.

CHANGE-103 adds [AsyncAPI Pub/Sub contracts](asyncapi/asyncapi.yaml) and a
[reading/validation guide](asyncapi/README.md). This is documentation of existing
approved messages, not authority to implement new topics or peer consumers.

Approved foreground recovery slice: ADR-033 / CHANGE-100. Current implementation,
class/sequence/data contracts and Credit cooperation handoff are in
`concurrency/concurrency-order-credit.md`; FEEDBACK-010 tracks the live gate.
Scoped context loading applies only to this slice and preserves historical records.

| Path | Scope | Notes |
|---|---|---|
| `../AGENTS.md` | Parent multi-service repository, including Order Service | Repository-wide stack, API, security, testing, deployment, Git, and service conventions; applies together with the service instructions |
| `AGENTS.md` | Entire Order Service repository | Service-specific authority, allocation, architecture-approval, peer-integration, TDD, completion, and change-control rules |
| `docs/architecture-review-playbook.md` | Order Service feature-level architecture reviews | Operational checklists and templates required before and after architecture approval; it does not approve a design |
| `docs/architecture-evolution.md` | Discoveries made during Order Service design or implementation | Change classification, material proposal/approval, current/superseded design history, artifact synchronization, and evolution-specific completion-report details |
| `docs/database-migration-workflow.md` | Every Order Service schema-affecting change | Versioned migration files, independent local database synchronization, peer handoff, migration verification, and schema-conflict rules |
| `docs/completion-reporting.md` | Final response for every Order Service chat turn | Required audit sections plus meaningful scenario-specific headers/details for advisory, status, planning, partial, blocked, decision, workflow, design, implementation, test, and verification turns |
| `learning/` | Beginner-friendly, project-specific and transferable engineering learning | Reuse existing learning documents; explain general principles and current-project implementation, trade-offs, failure modes, verification, and traceability links |
| `docs/peer-service-api-feedback.md` | Missing, unsuitable, incomplete, or incompatible peer-service APIs | Single append-only feedback lifecycle, blocked stopping point, responsible peer action, and actual-implementation verification before resumption |
| `docs/frontend-integration-workflow.md` | Order Service work with shared frontend impact | Approved Next.js/client/role context, live inspection, shared-file safety, responsive vertical-slice gate, tests, completion, and response format |
| `docs/frontend-ui-style-guide.md` | All future Order Service UI proposals and implementation | Screenshot-informed Friend on Campus visual baseline reconciled with live Geist/shadcn/Lucide tokens; consistency gate without inventing product behavior |
| `docs/ai-usage-format.md` | Required Order Service entries in `../ai/usage-log.md` | Established task heading, bold field labels, prompt/key-response/affected-location/author-verification format; no competing schema |
| `docs/event-candidates.md` | Order Service event/interaction proposals | Stable D1 candidate IDs, separate decision IDs, comparison requirements, and proposal-only status |
| `../frontend/AGENTS.md` | Shared top-level frontend | Version-specific Next.js and frontend conventions; read before every coding turn and frontend edit together with root/Order instructions |

No nested `AGENTS.md` files exist inside `order-service/`. The shared sibling `../frontend/AGENTS.md` applies whenever an approved Order Service vertical slice affects frontend source. Add an Order Service nested file only after a local source/test/deployment subtree exists and needs rules not already covered here; register it in this map.

The parent project `../AGENTS.md` requires Java 21/Spring Boot 4.1.1, Firestore defaults, Docker/Cloud Run conventions, OpenAPI, Firebase authentication, and repository-wide tests. ADR-008 records the user-approved Order Service exception: PostgreSQL on Cloud SQL and Cloud Run. The parent file was not modified; sibling-service Firestore conventions remain unchanged.

CHANGE-092 / ADR-031 updates event guidance in AGENTS.md, skills.md and the spec-driven-development skill: compact refund/completion vs unchanged accepted envelope. FEEDBACK-009 records explicit approval of the Order-only milestone, not compatible peer integration.


CHANGE-141 / ADR-048: delivered-item report review, single Resolved status, stored delivery overdue, report-specific release and precompletion penalty waiver. See changes/CHANGE-141-delivered-reports-and-review.md and docs/decisions/ADR-048-delivered-report-review.md. No workflow or skill changes.


CHANGE-142 refines Report presentation only; see changes/CHANGE-142-report-summary-layout.md and frontend-ui-style-guide.md. No workflow or skill change.
