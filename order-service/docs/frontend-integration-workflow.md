# Shared Next.js Frontend Integration Workflow

This document governs Order Service work that affects the shared top-level `../frontend/` application. It records approved frontend context and review gates; it does not authorize a particular feature, UI design, API contract, or source-code change.

## Approved project frontend context

- Framework: Next.js.
- Client: one responsive web application used from desktop and mobile browsers.
- Native mobile application: not currently included; do not create `mobile-client/` without explicit approval.
- Frontend location: the shared top-level `../frontend/` directory.
- Application roles: `ADMIN` and `USER`.
- `USER` functions/modes: Requester and Courier. They are functions of the same account, not separate applications or accounts.
- The current approved Order dashboard exposes both functions through shared navigation; it does not provide a client-side mode-switch control or persist a selected mode.
- Do not assume an `ADMIN` can act as a Requester or Courier. Ask before implementation if that distinction affects behavior.
- Client-side role, mode, authentication, and permission checks improve UX only. Backend services remain authoritative for every protected operation.

The frontend application-role model does not silently replace the parent repository's current backend authorities (`ROLE_REQUESTER`, `ROLE_COURIER`, and `ROLE_ADMIN`). Before role-sensitive implementation, inspect the actual User Service and frontend authentication/permission contract and obtain approval for the mapping between `USER` modes and backend authorities. Record a mismatch through the existing API-mismatch workflow.

## Inspected frontend baseline

Inspected on 2026-09-26 without modifying frontend source:

- Existing reusable directory: `../frontend/`; no competing frontend is permitted.
- Next.js 16.3.6 App Router with React 19.2.8 and TypeScript.
- Tailwind CSS 4 and shadcn/ui using the Base UI flavour.
- Routes live under `src/app/`; shared feature components under `src/components/<feature>/`; navigation in `src/config/navigation.ts`.
- Client components are present. Server-rendered App Router components and the `/health` route handler are present. No Server Actions or Order Service frontend module were discovered.
- Auth uses Firebase through `src/components/providers/auth-provider.tsx`; the current provider exposes identity/token state but not an approved `ADMIN`/`USER` mode model.
- Protected-page UX uses `RequireAuth`; backend authorization remains final.
- Backend calls use `useApi()` and `src/lib/api.ts`, attach the Firebase token, and go through the gateway using relative `/api/...` paths.
- Runtime configuration comes from `src/lib/runtime-config.ts`; do not introduce `NEXT_PUBLIC_*` configuration without approval.
- Existing feature routes/components concern suppliers. Reuse existing utilities and UI components where suitable.
- Visual consistency baseline: read `docs/frontend-ui-style-guide.md` before proposing or implementing Order Service UI. The guide records the supplied staging screenshot's visual language and reconciles it with the live Geist/shadcn/Lucide implementation.
- No frontend test files or configured frontend test script were discovered. The test framework and commands require a shared architecture decision before adding them.
- The frontend working tree was clean during this inspection. Recheck before every coding turn; this statement is not permanent allocation evidence.

## Mandatory inspection before coding

Before every Order Service coding turn, and again immediately before touching frontend source:

1. Read root, Order Service, and `../frontend/AGENTS.md`; read any deeper instruction file governing a target.
2. Read applicable project context, current sprint, work allocation, all relevant active-work records, requirements, designs, contracts, ADRs, gaps, and change records.
3. Inspect the current `../frontend/` structure rather than relying on this baseline.
4. Read `../frontend/package.json`, Next.js configuration, and applicable Next.js version-matched documentation required by `../frontend/AGENTS.md`.
5. Read `docs/frontend-ui-style-guide.md`, then inspect applicable routes, layouts, components, styles, API clients, authentication, permissions, runtime configuration, and tests.
6. Determine the actual use of App Router, Pages Router, Server/Client Components, Server Actions, route handlers, and API clients. Do not migrate routing models without approval.
7. Inspect the actual Order Service API and every required peer-service API; confirm request/response, authentication, authorization, errors, retries, and idempotency.
8. Check Git branch and working-tree status, including `../frontend/`, and compare the current task with developer allocation and active-work records.
9. Identify related frontend files being modified by another developer. Stop and coordinate when ownership overlaps or cannot be established.
10. Ask before coding when a requirement, API, role, mode, UI behavior, shared structure, or architecture decision is ambiguous.

If `../frontend/` remains suitable, reuse its conventions and extend existing modules. Do not create another frontend, or move/delete existing code, merely to simplify a feature. If it becomes unsuitable or absent, propose a structure and its shared-development impact and obtain approval before creating or reorganizing it.

## Visual consistency gate

- Treat `docs/frontend-ui-style-guide.md` as the current Order Service visual baseline.
- Reuse the shared Geist Sans font, semantic CSS tokens, AppShell/sidebar, shadcn/Base UI
  primitives, and Lucide icon language before creating new styling primitives.
- Preserve the screenshot's quiet monochrome hierarchy, generous whitespace, thin neutral
  borders, rounded panels, restrained motion, and responsive web behavior.
- Do not infer new product behavior, navigation, role/mode controls, or page structure
  from the screenshot alone; those still require requirements and feature-level approval.
- If a proposed feature must depart from the baseline, record the rationale and approval
  in the existing change/architecture records.

## Responsibility boundaries

- UI components handle presentation.
- Feature modules coordinate user workflows.
- API clients handle backend communication.
- Authentication and permission utilities handle client-side access decisions only.
- Backend services own business rules, authoritative authentication/authorization, data, and state transitions.
- Never place Order Service or another microservice's business logic in Next.js.
- Keep domain/API logic shared across desktop and mobile web. Prefer responsive components and layouts over parallel clients.

## Role, mode, and feature boundaries

- `ADMIN`: administrator dashboards and only actions approved by Admin Service requirements.
- `USER` Requester mode may expose only approved requester behavior, such as creating/viewing/cancelling eligible orders, viewing status/checkpoints, or reporting issues.
- `USER` Courier mode may expose only approved courier behavior, such as viewing/accepting/starting assigned work, marking pickup/delivery, viewing assignment information, or reporting issues.
- A mode switcher is not used by the current approved Order dashboard. If a future feature proposes one, it requires an explicit design decision and change record.
- A route does not authorize a capability. The backend must reject unauthorized operations and incorrect authorities.
- Do not invent layouts, navigation, controls, messages, or feature behavior not supported by requirements or an approved design.

## Responsive web requirements

Desktop and mobile browsers use the same application. For an approved feature, explicitly design and test applicable navigation, screen size, touch interaction, information density, loading/error states, accessibility, mobile-browser constraints, and responsive dashboard behavior. Follow the parent requirement that pages support 320 px through 1920 px. Responsive behavior is not proven merely by applying different CSS.

## Order Service vertical-slice gate

Unless a feature is explicitly recorded as backend-only, a user-visible Order
Service behavior is presumed to have frontend impact. The implementation task
must either deliver the shared frontend route/components/API integration and its
responsive verification together with the backend, or record the explicit
backend-only reason, deferred frontend scope, and owner in active work and the
change record. A backend endpoint alone is not a complete user-facing slice.

For every Order Service feature with frontend impact:

1. Read the exact FR/NFR/NTH, approved amendments, Order Service architecture, class diagram, and sequence diagram.
2. Inspect the actual shared frontend and implemented backend/peer APIs.
3. Confirm contracts and identify `ADMIN`, `USER` Requester mode, or `USER` Courier mode impact.
4. Propose backend and frontend changes together without inventing UI requirements.
5. Apply the expected-versus-actual API verification process. An approved mismatch updates context, contract, architecture/ADR, traceability, tests, change record, and AI disclosure. A missing, unsuitable, incomplete, incompatible, or rejected capability is recorded in `docs/peer-service-api-feedback.md` for the responsible owner.

Before implementation, report:

1. Relevant requirements and approved decisions.
2. Existing frontend structure and conventions.
3. Proposed frontend files.
4. Proposed Order Service files.
5. Affected application role and `USER` mode.
6. Expected and actual API contracts.
7. Desktop and mobile-web behavior.
8. Authentication and authorization behavior.
9. Tests to add or change.
10. Architecture, contract, shared-component, authentication, permission, or allocation decisions requiring approval.

Wait for explicit approval before significant architecture, contract, shared API-client, authentication, permission, layout, navigation, or design-system changes.

## Shared-developer safety

- The top-level frontend is shared. Feature ownership does not grant unilateral ownership of shared API clients, auth/permission utilities, layouts, navigation, or design-system components.
- Inspect before editing, preserve unrelated work, reuse existing components/utilities, and do not modify another developer's feature without agreement.
- Before moving or deleting anything, find all references, inspect other active work, explain impact, and obtain approval when shared work may be affected.
- Record coordinated changes to shared files in work allocation/active work and the existing change system.

Shared-file ownership follows the Order Service boundary: sibling service folders
remain read-only, and a shared Compose, gateway, CI, or environment file may only
receive an Order Service-specific block. Preserve peer-owned sections. If a peer
section blocks local Order Service startup, record the conflict and comment out
only the incompatible line/block with a restoration note; never delete or rewrite
peer code or configuration.

Use the same small atomic-change protocol for frontend-impacting work: inspect
`git status` and the current diff first, stage explicit paths, keep each commit to
one coherent concern, run the applicable checks plus `git diff --cached --check`,
and record the resulting commit in active work or the change record. Never use a
frontend change to bundle unrelated peer-service or pre-existing local edits.

## Test-first and completion requirements

For an approved frontend change:

1. Trace it to a requirement and measurable acceptance criteria.
2. Write and observe a failing test first where practical; document any justified exception.
3. Implement only the minimum approved behavior.
4. Run configured component, integration, relevant end-to-end, and regression tests.
5. Test the correct application role and `USER` mode, unauthorized access, and incorrect-mode access.
6. Test applicable desktop/mobile responsive behavior, accessibility, loading, and error behavior.
7. Run `npm run lint` and `npm run typecheck`, plus any approved test commands.

For a backend change affecting the frontend, add/update contract tests and verify request/response shapes, errors, authentication, and authorization before changing the API client. A page rendering or application starting is not completion.

Do not mark the feature complete until the approved frontend/backend design is implemented, correct role/mode behavior and responsive behavior are verified, actual APIs and cross-service contracts are tested, required frontend/backend/regression tests pass, traceability and deviations are current, and no architecture/API decision remains unresolved.

## Required response for every frontend-related turn

Use the project-wide per-turn response in `docs/completion-reporting.md`, including advisory-only, partial, blocked, and decision-request turns as well as completed changes. Do not create a separate summary file for each task. Update existing traceability, evolution, change, active-work, ADR/override, and API-gap records when applicable.

For frontend-impacting work, also state the frontend directory/structure used, affected backend microservice files, affected role/mode, API contracts used, responsive behavior verified, shared files touched, and unresolved questions or blockers.
