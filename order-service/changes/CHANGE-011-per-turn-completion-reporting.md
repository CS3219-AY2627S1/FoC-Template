# CHANGE-011: Mandate Flexible Per-Turn Completion Reporting

Date: 2026-09-28

Status: Completed

Approved by: User

## Requested change

Check whether the Order Service project workflow mandates the structured Added/Updated/Removed/Design Decisions/Affected Artifacts/Verification/Remaining Issues report for every chat turn. Add the missing rule while allowing meaningful scenario-specific headers and details.

## Reason

The existing report applied after selected changes and was embedded in the architecture-evolution document. It did not explicitly govern advisory-only, status, planning, partial, blocked, or decision-request turns, and it did not clearly permit additional headers around the audit baseline.

## Scope

- Added `docs/completion-reporting.md` as the single per-turn response authority.
- Added ADR-007 to record the accepted reporting policy.
- Updated `AGENTS.md`, the repository-local skill and human-readable skill index, canonical and structured context, instruction navigation, architecture evolution, architecture review, and frontend workflow to use the shared authority.
- Preserved the detailed implementation and frontend reporting obligations as scenario-specific additions.
- Updated the current developer handoff, change/decision indexes, and AI usage disclosure.

## Unchanged decisions

No Project D1 requirement, product behavior, Sprint scope, API contract, architecture interaction, event, diagram, data model, application source, implementation test, persistence technology, deployment target, or frontend UI was approved or changed. Sprint 1 coding remains unauthorized, and all existing technology, role-mapping, peer-inspection, and detailed-design blockers remain open.

## Verification

- The seven required headers are defined once in `docs/completion-reporting.md`.
- Advisory, status, planning, partial, blocked, decision-request, workflow, design, implementation, test, and verification turns are explicitly covered.
- Scenario-specific headers/details are permitted before, between, or after the required sections while preserving their relative order.
- Mandatory loaders and specialized architecture/frontend workflows reference the shared reporting authority.
- Local skill structure, TOML syntax, Markdown links, authoritative source hashes, and whitespace validation pass.

## Rollback or reversal considerations

Rollback would require restoring the former post-change-only reporting text in every caller. Any replacement should preserve accurate verification reporting, explicit empty sections, advisory/blocked coverage, and the ability to add meaningful scenario-specific content.
