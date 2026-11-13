# Detailed Architecture Review Playbook

This playbook preserves operational detail from the approved pre-implementation workflow without turning proposals into architecture decisions. `AGENTS.md`, approved ADRs, requirements, and service contracts remain authoritative when they conflict with this checklist.

## 1. Before proposing a feature

Complete the per-turn context rehydration in `AGENTS.md`. Report missing, stale, contradictory, or inaccessible context before making a design decision. Keep overall architecture as the long-term blueprint and Sprint architecture as the approved implementation subset.

Inspect each relevant peer implementation, including User, Supplier, Credit, and Admin where applicable:

- Applicable `AGENTS.md`, context, and architecture.
- Controllers, routes, endpoints, handlers, and consumers.
- Request/response DTOs and validation.
- Service interfaces and client adapters.
- Event schemas.
- Contract and integration tests.
- Communication and authentication configuration.
- OpenAPI/API documentation and existing usage examples.

Record the actual request, response, authentication, synchronous/asynchronous behavior, errors, timeouts/retries, idempotency, and whether the API satisfies the Order Service requirement. Never invent an API before inspecting the provider.

## 2. API mismatch procedure

For every foreign API, compare expected and actual operation/endpoint name, parameters, request body, response body/return type, authentication/authorization, errors/status codes, synchronous/asynchronous behavior, data semantics, tests, and sequence compatibility. Classify the result as `MATCHES_APPROVED_CONTRACT`, `DIFFERS_MAY_BE_USABLE`, `SIMILAR_BUT_UNSUITABLE`, `MISSING`, or `INCOMPLETE_OR_INCOMPATIBLE`.

### Matching API

Record the inspected provider files/API revision, why implementation satisfies the approved contract and sequence, response/error sufficiency, and existing or planned contract/integration tests. Then continue with TDD.

### Different but potentially usable API

Report and stop for approval:

```text
Required Order Service contract:
Actual peer-service API:
Differences:
Why the difference exists:
Can Order Service use it safely:
Required adapter or mapping:
Behavioral risks:
Contract and sequence impact:
Testing impact:
Recommendation:
Approval required:
```

Classify the difference as backward-compatible, usable through an adapter, usable only after changing Order Service expectations, or unsafe/semantically incorrect. Compare an Order-side adapter, provider change, rejection, and other viable alternatives with trade-offs.

If approved, update affected context/metadata, original/current/superseded contract, architecture/class/sequence/data design, ADR or override, architecture evolution, traceability, change record, contract/integration tests, approval date/approver, and `../ai/usage-log.md` before implementation.

### Missing, unsuitable, incomplete, or incompatible API

Do not implement a temporary assumption. Report:

```text
Required capability:
Expected contract:
Current peer-service status:
Why no existing API is suitable:
Why similar APIs cannot safely be reused:
Required operation or endpoint:
Required request:
Required response:
Required errors:
Required authorization:
Required data semantics:
Required synchronous or asynchronous behavior:
Affected Order Service feature:
Affected sequence:
Suggested implementation for the peer service:
```

Read `docs/peer-service-api-feedback.md`, append one stable `FEEDBACK-NNN` section, preserve earlier entries, and do not modify peer-service source. Copy this blocker into active work:

```text
Blocked feature:
Missing or unsuitable dependency:
Expected contract:
Current peer-service status:
Feedback document:
Files not changed:
Implementation stopping point:
What approval or peer-service change is required:
Next verification step:
```

Report the feedback ID and required peer action. On peer confirmation, re-read code and tests, verify the full contract, and set `VERIFIED` only when implementation evidence matches. A peer claim may set `READY_FOR_VERIFICATION`, not `VERIFIED`.

An approved prototype may support a separately approved contract-stub milestone. Record that the API is not implemented, assumed request/response/semantics, stubs/tests, compatibility requirement, and remaining integration risk. Do not claim final integration completion without actual peer implementation verification unless the user explicitly approves the stub milestone as the endpoint.

### Required response for every foreign API check

```text
Dependency:
Required capability:
Expected contract:
Actual peer-service API:
Compatibility status:
Differences:
Recommendation:
Approval required:
Files updated:
Tests affected:
Blocked or ready to proceed:
Next action:
```

Also include the project-wide per-turn response required by `docs/completion-reporting.md`. If blocked, do not implement the integration.

## 3. Detailed design proposal contents

For the requested feature or sequence, cover all applicable items:

1. FR, NFR, NTH, and approved amendments.
2. Current approved architecture.
3. Actual peer APIs found.
4. Detailed component architecture.
5. Detailed class diagram or changes.
6. Detailed service-level sequence diagram.
7. Actors and components.
8. Control flow.
9. Data flow.
10. Synchronous interactions.
11. Proposed event interactions.
12. Inbound contracts.
13. Outbound contracts.
14. Actual peer-service contracts.
15. Data ownership.
16. Persistence changes.
17. Concurrency behavior.
18. Consistency guarantees.
19. Idempotency.
20. Retry and failure behavior.
21. Security and authorization.
22. Observability and audit.
23. Test strategy.
24. Affected source files.
25. Affected documentation.
26. Peer-service API feedback and unresolved gaps.
27. Alternatives considered.
28. Advantages and disadvantages.
29. Operational complexity and infrastructure impact.
30. Exact decisions requiring approval.

Label design statements as `Approved existing architecture`, `Existing peer-service implementation`, `Proposed design`, `Unresolved decision`, or `User-approved deviation`.

For a feature with frontend impact, also read and apply `docs/frontend-integration-workflow.md`. Record the current shared Next.js structure, proposed frontend and Order Service files, affected `ADMIN`/`USER` role and Requester/Courier mode, actual API contracts, desktop/mobile-web behavior, backend-enforced authorization, shared-file ownership, and frontend/contract test strategy. Treat any frontend-role-to-backend-authority mapping as unresolved until actual contracts are inspected and approved.

## 4. Event review

Read `docs/event-candidates.md`. Include every applicable candidate row in the feature proposal and use its stable candidate and decision IDs. Evaluate all four communication styles and every comparison dimension listed there. Do not equate non-real-time work with broker-based events, and do not implement a blank or `PROPOSED` decision.

## 5. Approved deviation updates

When the user approves a design that differs from a requirement or architecture, record the original statement, approved change, reason, trade-offs, and approver. Update every affected ADR/override, overall and service architecture, class/sequence diagram, contract, API-gap record, traceability, change log, tests, current Sprint scope, and AI usage entry. Do not make the original source appear unchanged.

## 6. AI usage entry

After an approved architecture decision or meaningful implementation, test-generation, or verification assistance, update `../ai/usage-log.md` using the established project style in `docs/ai-usage-format.md`. Do not recreate the superseded `## AI Usage:`/unbolded-field schema. Preserve the prompt, key response, affected locations, and author verification accurately; never claim that AI independently approved the architecture.

## 7. Response required before implementation

Before coding, provide and then stop for explicit approval:

1. Context summary.
2. Relevant D1 requirements.
3. Actual peer APIs found.
4. API mismatches and gaps.
5. Detailed architecture proposal.
6. Detailed class diagram.
7. Detailed sequence diagram.
8. Applicable event-candidate and decision table.
9. Synchronous-versus-event trade-offs.
10. Credit-handling behavior.
11. Penalty-fact behavior.
12. Proposed contracts.
13. Failure and consistency behavior.
14. Test strategy.
15. Documents to update after approval.
16. Questions requiring the user's decision.

Do not proceed from proposal to implementation without explicit approval.

## 8. Post-approval implementation gate

After approval: update design and traceability records; record API compatibility/gaps and the change; update event decisions and AI usage when applicable; reconfirm scope; write and run a failing test first; implement only the approved design; run unit, integration, cross-service contract, applicable frontend, regression, and deterministic verification; then update active work.

Completion remains blocked until the approved design is implemented, traceability is complete, actual peer APIs and approved event contracts are tested, required tests pass, gaps/deviations are resolved or formally blocking, no architecture decision remains unresolved, and the required AI disclosure is current.

## 9. Architecture evolution discovered during implementation

Read `docs/architecture-evolution.md` before resuming implementation. When code/test work exposes a missing class, interaction, validation, persistence detail, contract assumption, or unsuitable design, stop and classify it before changing the design.

- Safe implementation details may continue inside the approved proposal.
- Material internal refinements must be recorded with affected artifacts.
- Architecture/specification changes require an options-and-trade-offs proposal and explicit approval.

An approved change is not complete until its evolution entry, ADR/change link, effective/supersession state, affected diagrams/contracts/traceability/tests, and implementation status agree. Report stale artifacts as blockers rather than silently following the code.

## 10. Response after every architecture-review turn

Use the project-wide response in `docs/completion-reporting.md`, including advisory-only, partial, blocked, and decision-request turns. Add meaningful architecture-proposal, API-gap, compatibility, security, decision, and next-step headers when useful. Do not create a separate response-summary Markdown file. Frontend-impacting work also includes the frontend-specific directory, role/mode, contract, responsive, and shared-file details required by `docs/frontend-integration-workflow.md`.
