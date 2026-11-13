# ADR-007: Per-Turn Structured Completion Reporting

Date: 2026-09-28

Status: Accepted

Approved by: User-provided per-turn reporting instruction

## Context

The Order Service workflow already required an Added/Updated/Removed-style response after workflow, design, backend, or frontend changes. That rule did not explicitly cover advisory-only questions, status requests, planning, partial or blocked work, or turns ending in a decision request. Its report also lived inside the architecture-evolution register even when no architecture evolution occurred.

## Decision

1. `docs/completion-reporting.md` is the single response-format authority for every Order Service chat turn handled by the local workflow.
2. Every final response includes `Added`, `Updated`, `Removed`, `Design Decisions`, `Affected Artifacts`, `Verification`, and `Remaining Issues` exactly once and in that relative order. Empty sections use `None.`.
3. The required sections are an audit baseline, not the entire response. The AI may add meaningful task-specific headers and details before, between, or after them when the scenario benefits from additional explanation.
4. Reporting distinguishes completed from planned work, proposed from approved decisions, inspected from verified integrations, and blockers from completed outcomes.
5. Advisory-only, status, planning, partial, blocked, decision-request, workflow, design, implementation, test, and verification turns all use the same baseline.
6. Implementation and frontend turns retain their existing Project D1, TDD, contract, role/mode, responsive, and persistent-context details as scenario-specific report content.
7. The response does not create a separate per-turn Markdown summary. Durable facts remain in their owning active-work, change, ADR, traceability, API-feedback, architecture-evolution, and AI-disclosure records.

## Superseded process detail

This ADR supersedes only ADR-005 decision 7's response-format location and post-change-only scope. Architecture-evolution classification, approval, history, supersession, and artifact-synchronization rules remain unchanged. Their scenario-specific report details now extend the shared `docs/completion-reporting.md` baseline.

## Consequences

- Future turns have a consistent auditable summary without preventing scenario-specific explanations.
- `docs/architecture-evolution.md` no longer owns a duplicate general response template; it adds architecture-evolution-specific content through the shared reporting authority.
- This ADR changes workflow reporting only. It does not approve Sprint implementation, product behavior, architecture, API contracts, diagrams, persistence, deployment, or frontend UI.
