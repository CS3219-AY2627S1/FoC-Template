# CHANGE-111: Admin UI mock prototype

Date: 2026-10-11. Owner: Yao Xiang. Branch: order-service/admin-dashboard.

## User-approved scope

The pasted Admin UI request explicitly approves Orders, Users and Suppliers tabs,
top-right admin/normal mode switching, mocked role verification and all demo APIs
inside Order Service. Frontend and Order Service only; peers are read-only.
The identity/branch mismatch was resolved explicitly by Yao Xiang in chat.
This is a mock prototype milestone, not real administrative integration.

## Detailed design recorded before implementation

- Approved existing architecture: Next.js App Router, useApi through gateway,
  Geist/shadcn/Base UI/Lucide styling, one-based paginated response envelope.
- User-approved deviation: sample admin role lookup and sample peer operations
  reside only under /api/orders/admin-mock, gated to explicitly local emulator runs.
  No real Firebase role, User/Supplier record, Credit balance or Order row changes.
- Component design: shared shell selects normal/admin navigation from the route;
  AdminModeProvider associates permission with current Firebase UID, checks the
  adapter on entry/direct navigation, denies on missing/failed/non-admin response,
  clears access on account change, and supplies only display authorization.
  Server profile restriction is the demo boundary; real backend role guards remain.
- API adapter: useAdminApi owns all mock URLs and response normalization. The UI
  calls semantic methods, allowing later provider-specific integration without
  changing page controls. It must not silently fall back to mocks on real failure.
- Backend: isolated local-conditional controller, application sample store, typed
  Lombok request/response DTOs, MapStruct response copies, explicit Java types.
  Shared in-memory demo data resets on service restart; synchronized store methods
  make demo mutations atomic. No migration or extra broker/job is needed.
- Orders: all statuses, exact ID search, latest created first with deterministic ID
  tie-break, server pagination/filtering, details including existing Order fields;
  names plus buttons that copy associated IDs with success/error feedback.
- Users: dropdown name/ID search, paginated sample list, profile/details, future UTC
  suspension ending at selected local date/time, promote and confirmed deactivate.
  Credit is a mock projection, not a financial mutation. Missing profile fields
  are explicitly demo extensions, not asserted existing User wire fields.
- Suppliers: existing SupplierResponse/SupplierInput shapes, name/ID search,
  existing SupplierForm, confirmed soft deactivation, details and pagination.
- Failure/security: loading/error/empty/retry states, mutation pending/disable,
  field validation on server and form, no unguarded admin route rendering, no
  cloud mock beans, no persisted tokens or trusted client roles for real endpoints.
- Responsive: existing desktop sidebar/mobile sheet, top-right mode button on both,
  wrapping toolbars/dialogs and horizontally scrollable order table at small widths.
- Tests: permission denial/identity switches, mode navigation, searches/pagination,
  detail/mutation confirmations, DTO/validation/profile exclusion/OpenAPI contract,
  frontend lint/typecheck/tests and appropriate Order verify checks.

## Alternatives and boundaries

Using real peer endpoints now would require real admin accounts and several
missing APIs; the user explicitly chose a complete mock prototype. Browser-only
fixtures would not exercise gateway/API formats. Order-owned local HTTP mocks
meet the request while keeping real domain/peer implementation isolated.

No new durable broker interactions: admin actions here are synchronous mock HTTP.
Existing event decisions EV-1 through EV-7 are unchanged. Real integration remains
pending documented peer contracts; admin mode is not proof of backend authority.
Requirements: user-approved admin prototype amendment; existing D1 admin supplier
management and NFR2.1 responsive web, NFR3 testing/security remain applicable.
No arbitrary requirement IDs are invented for the new mock milestone.

## Verification

- TDD: initial frontend test failed on missing admin-api module; initial backend
  compile failed on missing mock controller/service/mapper. Implemented to green.
- Focused Admin UI: 22 tests across adapter, permission/identity, navigation,
  search/page/copy, profile/suspension/promote, supplier form and confirmations.
- Full frontend: 146 tests across 32 files pass, no skips. Typegen/TypeScript pass.
  Full lint has zero errors and three pre-existing login warnings; changed Admin
  files have zero warnings. React effect lint failure was fixed and rechecked.
- Order full verify: 379 tests, zero failures/errors/skips; PostgreSQL/live Credit
  regression tests and coverage gates pass. Final supplier detail addition was
  additionally verified by 10 mock API/OpenAPI tests against final source.
- Next production build and both changed Docker builds pass. Base Compose and
  HTTP-peer override config checks pass. Git diff whitespace checks pass.
- Local runtime: existing peer images reused; only Order/frontend rebuilt.
  Docker Desktop started; Compose gateway/dependencies started without removing
  any volumes. All running application containers healthy. Runtime OpenAPI has
  ten sample paths (eleven operations). Three /admin pages return HTTP200;
  unauthenticated sample API returns401 under existing prod-security Compose.
- The first PowerShell HTTP smoke call used localhost and reset its connection;
  curl with explicit 127.0.0.1/no-proxy succeeded. No gateway code was changed.
- Browser automation inventory is empty (in-app browser unavailable). No visual
  320px/1920px or authenticated browser display claim is made. DOM interaction
  tests pass; manual login/Admin Mode visual check remains.
- Other backend source/tests/configuration unchanged. No cloud/IAM writes, data
  reset, real admin promotion, Git staging/commit/push or new persistence migration.

## Handoff and remaining scope

Local gateway: http://127.0.0.1:8080. Sign in with an existing local account,
click Admin Mode, exercise tabs/actions, then Normal Mode. Sample mutations
reset on Order restart. README documents the scoped rebuild command and demo gate.
Real provider integration remains pending the exact contracts in
docs/admin-peer-api-request.md. Overall NTH1/Sprint status stays in progress.

## Implementation discovery and effective local gate

Local Compose already uses prod security with Firebase emulator tokens.
A non-prod-profile-only guard would make the requested local UI unusable.
The effective refinement requires all three: ORDER_ADMIN_MOCK_ENABLED=true,
FOC_ENVIRONMENT=local and Firebase Auth emulator configuration. Existing
JWT/role authentication is untouched. Root Compose receives only an Order-owned
flag; root .env.example documents it. Cloud configuration, peer backend blocks,
credentials and schema remain unchanged. ADR-039 has effective diagrams.
