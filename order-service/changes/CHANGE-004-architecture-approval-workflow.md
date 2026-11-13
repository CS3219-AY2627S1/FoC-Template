# CHANGE-004: Add Detailed Architecture Approval Workflow

Date: 2026-09-26

Status: Completed

Approved by: User

## Requested change

Read the supplied Order Service architecture-review prompt and update only the existing workflow records necessary to make its pre-implementation, peer-service inspection, API-mismatch, event-review, architecture-approval, and AI-disclosure rules persistent.

## Reason

Prevent implementation from starting from high-level diagrams or assumed peer APIs, preserve human architectural judgment, and force explicit decisions for synchronous, polling, in-process event, durable event, hybrid, adapter, or provider-change options.

## Project D1 references

Workflow applies to Order Service F1-F13, platform NFR1-NFR5, and NTH1-NTH5. It confirms the approved credit, penalty, overdue, and service-ownership interpretations without implementing a feature.

## Affected requirements and decisions

- Added a mandatory feature-level detailed architecture approval gate.
- Added actual User, Supplier, Credit, and Admin implementation/API inspection before dependent design.
- Added explicit expected-versus-actual API mismatch review and approval.
- Added four-way event-option comparison and durable-event operational criteria.
- Recorded synchronous credit-consequence processing and non-blocking factual penalty signaling boundaries.
- Recorded the unresolved PostgreSQL/Firestore and Kubernetes/Cloud Run instruction conflict as an implementation blocker.

## Affected services and contracts

Order Service workflow records only. Sibling services were not modified. No concrete endpoint, DTO, service contract, event schema, broker, persistence schema, or implementation was approved or changed.

## Affected diagrams

No source diagram changed. Overall diagrams remain long-term context and Sprint diagrams remain the implementation subset. A feature-specific proposal must identify later approved diagram changes.

## Affected tests

No application or implementation test was created or run. The workflow now forbids creating implementation tests before architecture approval and requires actual peer API contract/integration tests after approval when applicable.

## Implementation result

Updated the service instructions, repository-local skill, canonical/structured context, active Sprint pointer, instruction map, skill index, ADR/change indexes, current developer handoff, and project AI usage log. Added ADR-003 and this change record. Did not create speculative integration-gap or event-decision files.

## Verification

- Local developer is Vincent (Developer 2), allocated sequences 7-11 on the current `sprint-1/seq-7-to-11` branch.
- Authoritative source timestamps and SHA-256 hashes still match `docs/project-d1-reference.md`.
- TOML keys, values, and table placement were checked manually; an executable Python/TOML parser was unavailable in this environment.
- Workflow documents consistently prohibit implementation before detailed approval.
- No production source, application test, concrete contract, or sibling-service implementation changed.

## Rollback or reversal considerations

Removing the gate would permit assumed APIs and unapproved communication choices. Any reversal or relaxation requires a later approved ADR/change; do not rewrite this record.
