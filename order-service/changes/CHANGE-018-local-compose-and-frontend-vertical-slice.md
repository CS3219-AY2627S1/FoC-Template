# CHANGE-018: Local Compose and Frontend Vertical-Slice Workflow

## Status

In progress; local container packaging, the Order/PostgreSQL/Firebase/User
Service vertical slice, and the approved Order Service frontend are implemented
and verified. Authenticated browser, live peer-contract, and Cloud Run checks
remain pending. Admin Service remains intentionally excluded from this local
stack until its separately owned container is available.

## Scope

- Add a multi-stage Docker image for Order Service.
- Run Order Service against a local PostgreSQL 15 container during development.
- Wire Order Service into the root Compose stack and document the local command.
- Require user-visible Order Service backend capabilities to be delivered with a
  companion shared Next.js frontend slice, unless a backend-only decision is recorded.

## Confirmed decisions

- Local Compose uses PostgreSQL, not Cloud SQL.
- Cloud SQL configuration remains deployment-only.
- The existing shared `frontend/` Next.js application remains the only frontend.
- Desktop and mobile browsers share one responsive implementation.
- Existing Geist, shadcn/Base UI, Lucide, gateway-relative `useApi()`, and runtime
  configuration conventions remain the visual and integration baseline.
- `USER` Requester mode maps to `ROLE_REQUESTER`; `USER` Courier mode maps to
  `ROLE_COURIER`; `ADMIN` Order actions are deferred.
- One user may switch Requester/Courier modes in the client UI; backend
  authorization remains authoritative.
- Frontend scope is sequences 1-11, using the authenticated Firebase UID for
  requester and actor identifiers.
- Vitest and React Testing Library are the selected frontend test stack.

## Implementation status

- Order Service Dockerfile: implemented.
- Local PostgreSQL service and Compose dependency ordering: implemented.
- Peer-owned User Service code/configuration: preserved unchanged. A temporary
  root-Compose MongoDB dependency is recorded separately in CHANGE-023.
- Root local-run documentation and `.env.example`: implemented.
- Spring Boot Flyway runtime auto-configuration: verified under CHANGE-021.
- Frontend route/components/API integration: implemented under CHANGE-022.
- Authenticated requester/courier list and role enforcement remain subject to
  live peer-contract verification.

Atomic commits:

- `ed6aab2` - local container stack and Docker packaging.
- `43c39c5` - Sprint 1 Order Service lifecycle implementation.
- `8776574` - AI usage/disclosure record.

## Verification required

- `docker compose config --quiet`.
- Confirm that peer-owned User Service/MongoDB configuration is unchanged.
- Order image build and container health: passed.
- Flyway migration against a clean local PostgreSQL container: passed.
- Order readiness and OpenAPI smoke checks: passed.
- Full local Compose startup excluding Admin Service: passed after CHANGE-023.
- Frontend lint/typecheck, Vitest/RTL, and production build: passed under
  CHANGE-022; responsive browser verification remains pending.
