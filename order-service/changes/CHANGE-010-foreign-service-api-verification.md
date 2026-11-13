# CHANGE-010: Add Foreign-Service API Verification and Dependency Feedback

Date: 2026-09-27

Status: Completed

Approved by: User

## Requested change

Compare the supplied foreign-service API verification/dependency-gap workflow with the current Order Service workflow and persist the missing applicable rules without modifying application code.

## Reason

The existing peer-API gate covered inspection, mismatch approval, and a planned API-gap record, but not the full five-result classification, one shared feedback lifecycle, blocked/resume handoff fields, prototype risk, or exact foreign-API response format.

## Scope

- Added `docs/peer-service-api-feedback.md` as the single append-only record for missing, unsuitable, incomplete, or incompatible peer APIs.
- Added ADR-006 to extend ADR-003 and supersede only its unused planned `docs/integration-api-gaps.md` location.
- Expanded peer verification in `AGENTS.md`, the architecture review playbook, repository-local skill, canonical/structured context, Sprint navigation, instruction map, and skill index.
- Added feedback/resumption/completion rules to active work and the completion gate.
- Updated decision/change indexes and the AI usage disclosure.

## Unchanged decisions

No concrete peer API was inspected or approved in this workflow-only task. No adapter, endpoint, event, DTO, contract deviation, application code, implementation test, or peer-service source was created or changed. Existing architecture, Sprint scope, and open technology/role conflicts remain unchanged.

## Verification

- The workflow contains all five compatibility classifications and both matched/mismatched paths.
- The feedback record has one template, stable IDs, all required statuses, stopping-point/resume fields, and verification evidence rules.
- Approved-prototype development remains distinguishable from actual peer implementation verification.
- Mandatory loaders reference the shared feedback file.
- Authoritative source fingerprints remain unchanged.
- Local skill/TOML/link validation and `git diff --check` pass.

## Rollback or reversal considerations

Removing this workflow would allow logical contracts or peer claims to be mistaken for verified implementations. Any replacement must preserve actual-code inspection, explicit mismatch approval, shared feedback history, stopping points, and re-verification before integration completion.
