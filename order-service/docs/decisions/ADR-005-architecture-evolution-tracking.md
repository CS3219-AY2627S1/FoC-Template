# ADR-005: Track Architecture Evolution During Implementation

Date: 2026-09-27

Status: Accepted

Approved by: User-provided architecture-evolution workflow prompt

## Context

ADR-003 prevents implementation before detailed design approval, but implementation can still reveal missing classes, interactions, persistence details, or unsuitable assumptions. The workflow did not yet define a persistent classification for these discoveries or a single index showing original, proposed, approved, implemented, rejected, and superseded designs.

## Decision

1. Read `docs/architecture-evolution.md` on every implementation-affecting turn.
2. Classify each discovered change as an implementation detail, design refinement, or architecture/specification change before acting.
3. Safe implementation details may proceed inside the approved design. Material design refinements are documented. Architecture/specification changes require explicit user approval before implementation.
4. A material proposal states the original design, discovered problem, insufficiency, options, advantages/disadvantages, trade-offs, recommendation, affected artifacts, and approval requirement. An AI recommendation is not approval.
5. Approved changes preserve history, effective dates, supersession links, current rules, and implementation status in the evolution register plus the existing ADR/change system.
6. After approval, synchronize the requirement-to-architecture-to-class-to-sequence-to-data-to-contract-to-test-to-implementation chain. Any stale affected artifact blocks feature completion.
7. Use the project-wide post-change response in `docs/architecture-evolution.md`; do not create a separate summary file for each turn.

## Consequences

- Implementation discoveries cannot silently replace approved designs.
- The architecture-evolution register is navigation/history, not a duplicate source of product requirements or exact code diffs.
- Existing ADRs, change records, traceability, diagrams, contracts, tests, and Git history retain their current authority.
- No application behavior, concrete feature design, contract, event, persistence technology, or deployment choice is approved by this ADR.
