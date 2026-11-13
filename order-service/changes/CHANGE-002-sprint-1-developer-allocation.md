# CHANGE-002: Add Sprint 1 Developer Allocation Workflow

Date: 2026-09-23

Status: Completed

Approved by: User

## Requested change

Divide Sprint 1 Order Service work between Yao Xiang (sequences 1-6) and Vincent (sequences 7-11), keep current-developer identity local, make work resumable per developer, enforce branch/scope validation, and prevent unverified completion claims.

## Reason

Allow two developers and their AI sessions to work safely in the same repository without crossing assigned implementation scopes or losing unfinished-work context.

## Project D1 references

No product behavior changed. Existing Order Service F1-F13, platform NFRs, NTH4, approved amendments, Sprint 1 sequences, class diagrams, and contracts remain authoritative.

## Affected requirements

Development workflow and Sprint 1 work allocation only. Requirements were not modified.

## Affected services

Order Service workflow documentation only. No sibling service was modified.

## Affected contracts

No service contract changed. Shared-contract changes now require developer discussion and an approved record before implementation.

## Affected diagrams

No architecture, class, or sequence diagram changed. Ownership was allocated as sequences 1-6 and 7-11.

## Affected tests

No application test changed or ran. The workflow now forbids `[x]` until all required unit, integration, contract, frontend, acceptance, and regression checks pass without skips or false positives.

## Implementation result

Added the shared allocation, per-developer active-work files, ignored local Vincent profile, branch/scope consistency checks, and strict completion gate. Migrated the former single `docs/active-work.md` record to `docs/active-work/`.

## Verification

- Vincent maps to Developer 2, sequences 7-11, branch `sprint-1/seq-7-to-11`.
- Yao Xiang maps to Developer 1, sequences 1-6, branch `sprint-1/seq-1-to-6`.
- The local profile is ignored by Git.
- The current branch matches Vincent's profile.
- No feature is marked complete.
- No application source, requirement, architecture, diagram, or contract file changed.

## Rollback or reversal considerations

Reversal would restore a single shared active-work record and remove developer isolation. Any allocation change should be recorded as a later approved change rather than silently editing history.
