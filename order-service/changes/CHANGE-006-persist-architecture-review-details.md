# CHANGE-006: Persist Detailed Architecture Review Catalogue and Templates

Date: 2026-09-26

Status: Completed

Approved by: User

## Requested change

Persist the parts of the approved Order Service architecture-review prompt that were not yet recorded in the local workflow, especially the exact D1-supported interaction candidates, stable candidate identifiers, separate decision identifiers, and reusable proposal/approval templates.

## Reason

Attachments and chat history are not durable repository context. The broad approval gates already existed, but later turns could not reliably recover the exact candidate mappings, statuses, or the full operational checklists from the workflow files alone.

## Scope

- Added `docs/event-candidates.md` as the proposal-only registry for `EV-1` through `EV-7`.
- Kept candidate IDs stable and introduced separate `EV-DEC-NNN` decision IDs so the conflicting numbering in the source prompt is not silently propagated.
- Recorded `EV-1` through `EV-6` as proposals and `EV-7` as an approved synchronous boundary that does not approve an event.
- Added `docs/architecture-review-playbook.md` with the peer-inspection, API-mismatch, detailed-proposal, deviation, AI-disclosure, required-response, and post-approval checklists and templates.
- Added both records to the mandatory context-loading paths in the Order Service instructions, local skill, project context, current Sprint workflow, instruction map, and skill index.
- Refreshed the current developer handoff and change log.

## Unchanged decisions

This change does not approve an event, broker, API, adapter, feature design, service contract, persistence technology, deployment target, test, or implementation. It does not resolve the PostgreSQL/Firestore or Kubernetes/Cloud Run conflicts. CHANGE-004 and ADR-003 remain the governing architecture-review decision.

No `docs/decisions/event-driven-decisions.md` was created because no event choice was approved. No `docs/integration-api-gaps.md` was created because no actual rejected API mismatch was discovered in this workflow-persistence task.

## Verification

- The registry preserves all seven Section 8 candidates without renumbering them.
- Every interaction has a distinct decision ID and a blank decision field unless an existing boundary already constrains it.
- The registry explicitly states that it does not approve a broker or event implementation.
- The detailed review and response checklists are reachable from the mandatory per-turn context path.
- No application source, implementation test, sibling-service source, service contract, architecture diagram, or product requirement changed.

## Rollback or reversal considerations

Removing these records would make exact architecture-review requirements dependent on an attachment or chat history again. Any replacement should preserve stable proposal IDs, approval status, and the no-implementation gate.
