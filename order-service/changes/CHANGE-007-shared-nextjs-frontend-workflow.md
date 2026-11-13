# CHANGE-007: Add Shared Next.js Frontend Workflow

Date: 2026-09-26

Status: Completed

Approved by: User

## Requested change

Persist every applicable part of the supplied shared Next.js frontend-development prompt in the Order Service workflow so later turns reload the frontend context, shared-developer safeguards, architecture gate, testing requirements, completion rule, and response format.

## Reason

The workflow previously required frontend tests when applicable but did not persist the shared directory, concrete Next.js conventions, `ADMIN`/`USER` application-role model, Requester/Courier modes, responsive-web rule, frontend inspection procedure, shared-file coordination, or complete cross-stack approval gate.

## Scope

- Added `docs/frontend-integration-workflow.md` as the detailed reusable workflow.
- Added ADR-004 for the approved shared Next.js topology and application-role model.
- Linked the workflow from mandatory per-turn instructions, the repository-local skill/index, canonical/structured context, current Sprint, architecture review, instruction map, work allocation, and active work.
- Updated the architecture summary to record one shared responsive client and preserve the source-diagram clarification.
- Extended Sprint acceptance guidance for any later approved frontend slice.
- Added application-role/mode terminology to the glossary and frontend responsibility boundaries to service ownership.

## Inspected repository evidence

- Reused `../frontend/`; no competing frontend was created.
- Confirmed Next.js 16.3.6 App Router, React 19.2.8, TypeScript, Tailwind CSS 4, shadcn/Base UI, Firebase authentication, gateway-based `useApi()`, and runtime configuration.
- Confirmed no discovered Order Service frontend feature, Server Actions, or frontend test files/test command.
- Confirmed no current Git-visible modification under `frontend/` during this task.

## Prompt coverage

| Prompt section | Persistent coverage |
|---|---|
| Project frontend context | ADR-004; canonical/structured context; frontend workflow |
| 1. Required context updates | `AGENTS.md`, context Markdown/TOML, skill/index, Sprint, allocation, active work, ADR/change log |
| 2. Frontend directory inspection | Inspected baseline and mandatory live-inspection checklist in frontend workflow |
| 3. Next.js rules | Existing-router/component/API boundaries and no-migration/no-business-logic rules in frontend workflow |
| 4. Role and mode behavior | `ADMIN`/`USER` plus Requester/Courier mode rules in ADR-004, context, glossary, and frontend workflow |
| 5. Responsive web/mobile web | Single responsive client, no native app, 320-1920 px and behavioral considerations in frontend workflow |
| 6. Order Service/frontend integration | Vertical-slice and actual API/mismatch gate in frontend and architecture-review workflows |
| 7. Per-turn context | Mandatory loader in `AGENTS.md`, local skill, context, and current Sprint |
| 8. Shared-developer safety | Work allocation and shared-file/deletion/move safeguards in frontend workflow |
| 9. Testing | Test-first role/mode/auth/contract/responsive/regression rules in frontend workflow and Sprint acceptance guidance |
| 10. Architecture approval | Ten-part frontend/backend proposal gate in frontend workflow and architecture review |
| 11. Response after every change | Exact response template in frontend workflow and mandatory reference in `AGENTS.md` |
| 12. Completion | Frontend/backend completion conditions in frontend workflow and `AGENTS.md` completion gate |
| 13. Final response | Required directory, backend, role/mode, contract, tests, requirements, and blockers in frontend workflow |

## Unchanged decisions

No application code, implementation test, frontend source, root/sibling instruction, API contract, UI layout, mode switcher, backend-authority mapping, Sprint feature, persistence choice, or deployment choice was approved or implemented. Existing technology conflicts and architecture/API approval gates remain open.

## Verification

- Every numbered section of the supplied prompt maps to the new detailed workflow and at least one mandatory loader/reference.
- The exact `ADMIN`/`USER` and Requester/Courier distinction is preserved.
- The role-authority terminology mismatch is explicit and blocks role-sensitive implementation until reconciled.
- The repository-local skill and structured TOML validate.
- Authoritative source hashes match the recorded fingerprints.

## Rollback or reversal considerations

Reversal would remove approved frontend context and make future frontend-impacting Order Service work dependent on chat history. Any superseding change must preserve shared-file safety, backend authorization authority, and recorded role/authority conflicts.
