# ADR-004: Shared Next.js Frontend and Application Role Model

Date: 2026-09-26

Status: Accepted

Approved by: User-provided shared Next.js frontend workflow prompt

## Context

The parent repository already contains a shared top-level Next.js frontend, but the Order Service workflow previously referred only to React/mobile-capable clients and treated detailed UI as unspecified. The overall architecture summary also described a web/mobile client and a separate administrator client. The new approved context requires one responsive Next.js web application for desktop and mobile browsers and defines application roles separately from requester/courier functions.

The parent backend convention currently names requester, courier, and admin authorities. The inspected frontend currently exposes Firebase identity/token state and supplier permissions, but no approved `ADMIN`/`USER` mode contract.

## Decision

1. All project frontend development uses the existing shared top-level `frontend/` directory.
2. The frontend is one responsive Next.js web application for desktop and mobile browsers. No native mobile application or competing frontend directory is approved.
3. The application roles are `ADMIN` and `USER`. Requester and Courier are modes/functions of the same `USER` account, not separate applications or user accounts.
4. Do not assume `ADMIN` can also act as Requester or Courier.
5. Frontend role/mode checks are UX controls only. Backend services remain authoritative for authentication and authorization.
6. Before role-sensitive implementation, inspect and explicitly reconcile the frontend application-role model with actual User Service/backend authorities. The existing requester/courier/admin authority terminology is not silently rewritten by this ADR.
7. Follow the existing Next.js structure and routing model. Significant shared-component, API-client, auth, permission, layout, navigation, routing-model, or design-system changes require coordination and approval.
8. An Order Service feature with frontend impact is designed, tested, and reviewed as a vertical slice under `docs/frontend-integration-workflow.md`.

## Superseded or clarified sources

- For frontend topology, this ADR clarifies the existing architecture summary: administrator and normal-user experiences live in the same shared Next.js application even if the source diagram visually separates clients.
- This ADR does not supersede backend authorization requirements or approve a concrete mapping from `USER` Requester/Courier modes to backend authorities.
- It approves platform context and workflow gates, not detailed feature UI, a mode-switch control, a new API, or Sprint implementation.

## Consequences

- Every relevant coding turn re-inspects `frontend/`, its instructions/configuration, Git state, allocation, and overlapping active work.
- Desktop and mobile-browser behavior share domain/API logic and require explicit responsive verification.
- No frontend feature is complete without applicable role/mode, unauthorized/incorrect-mode, contract, responsive, and regression verification.
- The exact User Service role/authority payload and frontend mode-selection behavior remain unresolved implementation questions.
