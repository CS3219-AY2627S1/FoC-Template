# CHANGE-005: Require Per-Turn Context Rehydration

Date: 2026-09-26

Status: Completed

Approved by: User

## Requested change

Persist the already-approved Order Service architecture-review instructions so they are reloaded before every relevant workflow turn, including later turns in the same conversation.

## Reason

Chat history can be incomplete or stale. Re-reading the applicable repository records on each workflow, architecture, design, implementation, test, verification, resumption, or completion turn prevents an earlier conversational summary from silently replacing the current source of truth.

## Scope

- Clarified the mandatory context-loading rule in `AGENTS.md`.
- Clarified the per-invocation loading rule in the repository-local skill and human-readable skill index.
- Recorded the requirement in canonical and structured project context.
- Refreshed the current developer handoff.

## Unchanged decisions

This clarification does not approve a feature design, API, event, broker, persistence technology, deployment target, contract, diagram, or implementation. CHANGE-004 and ADR-003 remain the governing architecture-review decision. The attached prompt is byte-for-byte identical to the prompt already adopted by those records.

## Verification

- Local developer, allocation, active-work scope, and branch agree.
- The mandatory context list includes governing instructions, project context, sprint references, architectures, contracts, decisions, change log, developer state, AI usage log, and applicable traceability/override/gap/proposal records.
- No application source, implementation test, sibling service, service contract, diagram, or product requirement changed.

## Rollback or reversal considerations

Relaxing per-turn rehydration risks decisions based on stale chat context. Any relaxation should be explicit and recorded in a later change.
