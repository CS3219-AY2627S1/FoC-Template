# ADR-006: Verify Foreign-Service APIs and Track Dependency Gaps

Date: 2026-09-27

Status: Accepted

Approved by: User-provided foreign-service API verification workflow prompt

## Context

ADR-003 requires peer implementation inspection and approval before using a mismatched API. The workflow did not yet define a complete compatibility classification, one persistent feedback lifecycle for missing/unsuitable dependencies, an exact implementation stopping-point record, or the distinction between an approved prototype and a verified peer implementation.

## Decision

1. For every required foreign API, read the expected Order Service contract and relevant requirements/architecture/diagrams before inspecting the actual peer code, routes, controllers, interfaces, DTOs, events, API documentation, and tests.
2. Compare operation, parameters/body, response/return type, authentication/authorization, errors/status codes, communication style, data semantics, and sequence compatibility.
3. Classify the result as matching, different but potentially usable, similar but unsuitable, missing, or incomplete/incompatible.
4. A matching API is recorded as verified for the feature before TDD. A potentially usable mismatch requires the exact comparison/risk report and explicit approval.
5. An approved mismatch updates the current integration contract and every affected context, architecture/class/sequence/data, traceability, test, decision/change, supersession, and AI-disclosure record before implementation.
6. Missing or unsuitable capabilities are appended to `docs/peer-service-api-feedback.md`; Order Service implementation stops and the active-work blocker records the exact stopping point. Peer-service source is not modified without explicit authorization.
7. After peer confirmation, re-read and verify the actual implementation before setting feedback to `VERIFIED` and resuming TDD. A prototype/stub remains unverified implementation unless the user explicitly approves a contract-stub milestone.
8. The foreign-API check uses the response format recorded in the architecture review playbook and reports whether work is blocked or ready.

## Superseded process detail

This ADR supersedes only the planned gap-record filename `docs/integration-api-gaps.md` in ADR-003 and earlier workflow text. No such file existed and no entry required migration. Missing, unsuitable, incomplete, and incompatible peer dependencies now use the single shared `docs/peer-service-api-feedback.md`. API decision IDs (`API-DEC-NNN`) remain unchanged.

## Consequences

- A documented logical contract is never treated as proof of peer implementation.
- Similar endpoint names are insufficient without semantic, authorization, error, and sequence compatibility.
- A feature cannot be completed against an unverified peer implementation unless the user explicitly defines a separate contract-stub milestone.
- This ADR approves the verification and feedback process, not any concrete peer API, adapter, contract deviation, or peer-service source change.
