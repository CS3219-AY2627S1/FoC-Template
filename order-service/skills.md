# Repository Skills

CHANGE-132: PenaltySystemPolicy is the current shared enum. Order uses its
getSuccessfulDeliveryReward query; getCourierPenaltyCases excludes the original
three automatic outcomes, getFullPenaltyPolicy returns all six. No wire changes.


## spec-driven-development

CHANGE-130 / ADR-043: shared penalty policy is the ordinary `../foc-common` Maven
library, package `sg.edu.nus.foc.common.penalty`. Keep auth and other code local.
Verify common/Order from root with wrapper `-pl order-service -am verify`;
Order uses root Docker context. Do not recreate a service-local policy enum.


Location: `.codex/skills/spec-driven-development/SKILL.md`

Use this skill for every Order Service workflow, architecture, design, implementation, bug fix, behavior-affecting refactor, test, verification, resumption, sprint transition, specification review, advisory/status request, blocked or partial task, decision request, or completion turn. Invoke its context-loading section again on every relevant turn, even in the same conversation; repository state is authoritative. It reads `docs/architecture-review-playbook.md`, `docs/architecture-evolution.md`, `docs/database-migration-workflow.md`, `docs/completion-reporting.md`, `docs/peer-service-api-feedback.md`, `docs/frontend-integration-workflow.md`, `docs/frontend-ui-style-guide.md`, `docs/ai-usage-format.md`, and `docs/event-candidates.md` for detailed review templates, implementation-discovery classification and supersession, versioned local-database migration and peer-handoff rules, mandatory per-turn reporting with meaningful scenario-specific sections, foreign-API compatibility/blocked-resume tracking, shared Next.js/role-mode and visual-style rules, consistent AI disclosure, and stable proposal/decision IDs. It enforces local developer/branch/scope validation, source-drift checks, live shared-frontend inspection, actual peer-service implementation verification, five-result API classification, mismatch approval, shared dependency feedback, detailed architecture approval, architecture-evolution tracking, event-option comparison, shared-developer safety, responsive role/mode testing, per-developer resumable handoffs, Project D1 traceability, test-first development after approval, AI disclosure, the completion gate, change recording, and completion reporting.

The official skill initializer also generated `.codex/skills/spec-driven-development/agents/openai.yaml` so the skill has discoverable UI metadata.

The skill also supports an on-demand pre-push CI rehearsal. When explicitly
triggered, it runs only the applicable Order Service backend checks, approved
shared-frontend checks, and relevant container/configuration checks once. It
does not push changes or run sibling-service, Cloud IAM, or browser checks by
default.

## Codex configuration

No repository `.codex/config.toml` was created. The workflow requires no repository-local Codex configuration, and no unverified configuration keys were invented. The repository-local skill and `AGENTS.md` provide the required behavior.

## Event publisher placement

For Order Service event-publisher code, put typed publisher interfaces under `src/main/java/sg/edu/nus/foc/order/messagingpublisher/interfaces/` and matching implementations under `src/main/java/sg/edu/nus/foc/order/messagingpublisher/publisher/`. Use the three effective `*TaskPublisher` pairs: `OrderCompletionTaskPublisher`, `OpenOrderRefundTaskPublisher`, and `AcceptedOrderCancellationTaskPublisher`. Requester cancellation and scheduled OPEN expiry use `OpenOrderRefundTaskEvent` and the same topic; Credit distinguishes them by resulting Order status. Every completion uses `OrderCompletionTaskEvent` with the full Order snapshot and `overdue`/`overdueAt` facts, as recorded in CHANGE-056/ADR-011. Under CHANGE-073/ADR-021, local Compose uses the three dev topics in the existing project with per-developer ADC; production topic IDs are environment-configured and Cloud Run uses its service identity. Do not use the Pub/Sub emulator or shared service-account keys; apply publisher IAM at topic scope. A real publisher must wait for transport confirmation; never treat a no-op as success. Peer consumers are future work under the user's explicit scope, not verified integration.

For the effective delivery flow, persist the post-transition event in `OrderEventOutboxRepository` within the same transaction as Order state, checkpoint, and command receipt. Trigger immediate `AFTER_COMMIT` dispatch, and use the Spring cron scheduler only for recovery. Publisher confirmation marks a row published; failure records bounded-backoff retry state without turning a committed transition into a failed response. Use leased claims and stable event IDs; delivery is at least once and consumers must deduplicate. Cloud Run scale-to-zero with request-based CPU does not guarantee in-process cron while idle; do not change cost-affecting deployment settings without separate approval.


## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].
