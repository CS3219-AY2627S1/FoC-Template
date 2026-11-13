# CHANGE-001: Establish Specification-Driven Workflow

Date: 2026-09-23

Status: Completed

Approved by: User

## Requested change

Create the persistent specification-driven and test-driven workflow, load the supplied project sources, record approved amendments, prepare Sprint 1 context, and stop before code development.

## Reason

Make repository files the durable source of agent context and prevent unapproved deviation from Project D1, approved amendments, architecture, contracts, diagrams, and sprint scope.

## Project D1 references

Order Service F1-F13; platform NFR1-NFR5; NTH1-NTH5. No feature implementation was performed.

## Affected requirements

Workflow and traceability requirements only. Product requirements were indexed and clarified, not implemented or changed.

## Affected services

Order Service documentation only. Ownership boundaries for User, Supplier, Order, Credit, and Admin Services were recorded; no sibling service was modified.

## Affected contracts

Logical contracts from the approved overall and Sprint 1 design were recorded in `docs/service-contracts.md` and `sprints/sprint-1/contracts.md`. No concrete endpoint was created or changed.

## Affected diagrams

Existing overall architecture, Order Service architecture, overall class diagram, Sprint 1 class diagrams, and Sprint 1 sequences 1-11 were reviewed and indexed. Source diagrams were not modified.

## Affected tests

No production tests exist. Candidate Sprint 1 acceptance tests were documented. The repository-local skill was syntax-validated.

## Implementation result

Created the required persistent workflow/context structure, active sprint pointer, ADR, change log, handoff record, sprint records, and reusable Codex skill. No backend, frontend, database, container, Kubernetes, or CI/CD implementation was added.

## Verification

- Required path inventory checked.
- Source PDF text and image-only diagrams reviewed.
- TOML syntax parsed.
- Skill validated with the official validator.
- Repository diff checked to confirm only Order Service workflow/context files changed.

## Rollback or reversal considerations

The setup consists only of documentation and repository-local agent metadata. Reversal would remove durable safeguards and should be an explicit approved change. Product behavior is unaffected.
