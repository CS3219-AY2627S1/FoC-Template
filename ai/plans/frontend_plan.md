---
name: Frontend Plan
overview: Build the Friend on Campus browser app in frontend only. React + TypeScript with Vite, served by nginx. Covers UI FR1-FR20 and UI NFR1-NFR12, calling the services only through /api/v1 on its own origin.
todos:
  - id: scaffold
    content: Scaffold Vite React app, design tokens, AppShell, AuthLayout, shared UI components, route table, Dockerfile and nginx SPA fallback
    status: completed
  - id: auth
    content: Sign-up, email and Telegram verification, login, password reset, route guards and token handling
    status: completed
  - id: orders
    content: Browse, new request, my requests, my deliveries, requester and courier order pages wired to Order
    status: completed
  - id: rating-badges
    content: Rating prompt from pending grants, server-side skip, profile rating and badges
    status: completed
  - id: social
    content: Friends page, friend requests, names on order pages once friended, the alerts bell
    status: completed
  - id: maps
    content: Delivery points, saved places, map picker with snapping, campus geofence for location ranking
    status: completed
  - id: admin
    content: Admin pages (handed to a teammate on 2026-11-02)
    status: completed
  - id: docs
    content: README, flow diagrams and interfaces doc
    status: completed
isProject: false
---

# Frontend — author decisions and implementation plan

Owner: Ngooi Jun Sen (admin pages from 2026-11-02: handed to a teammate).
Scope is only [`frontend/`](../../frontend/) and the frontend deploy scripts.
Backend gaps are raised with the owning service; the frontend never works
around a missing endpoint by changing another service.

How this file was made: no plan file was written before implementation. The
decisions below were given by the author in Claude Code sessions between
2026-09-22 and 2026-11-10 and were compiled into this file on 2026-11-10 from
those sessions and the code. Each decision is dated with the day the author
made it.

## Already decided by author (Ngooi Jun Sen)

- 2026-09-22: React + TypeScript with Vite, not Next.js or static HTML, served
  by nginx in its container. CSS Modules with CSS variables in
  `src/styles/tokens.css`; colours approximate the D1 wireframes until
  full-resolution mockups arrive.
- 2026-09-23 to 2026-09-29 (D2, `frontend` branch): pages built from the
  desktop and mobile mockups against the UI backlog and D2 Part 2 (supplier
  browse, single-supplier view with edit and delete, suggest-a-supplier,
  approval queue with denial, sign-up, login, password reset, profile, post a
  request, order detail, task pool). Author edits made on review: supplier
  chips in a grid layout, supplier status in uppercase, the role code and the
  role column removed from admin users, the medium password strength on
  `--color-warning`.
- 2026-10-01 to 2026-10-11: auth, profile and admin user pages wired to the
  API contract, aligned with User Service, then new pages added. The
  `frontend` branch was merged into `frontend-v2` and main and is no longer
  used.
- 2026-10-10: sections without an endpoint (photos, names) are commented out
  with a `TODO(service)` rather than faked; all sample data removed.
- 2026-10-20: all frontend work on `frontend-v2`.
- 2026-10-22: hide the requester's rating while Order stored a stub 5.0;
  stars fill on hover; the requester's timeline updates without a reload.
- 2026-11-01/02: delivery points separate from supplier locations; "use my
  location"; a campus geofence (trapezoid cut along the expressway, UTown up
  to Dover Road, tightened on 2026-11-04); snap to the nearest point within
  25 m; campus points coloured differently from saved places.
- 2026-11-02: log out button; password peek; timeline colours per status;
  name filters ranked by closeness; dispute escalation UI; friends page with
  paging like the supplier catalogue; Telegram handle shown, then the real
  name once friended; placeholder badge icons.
- 2026-11-02: the bell is built on Order's alerts as the code already polls
  them; seen and cleared state kept per browser.
- 2026-11-03: requesters do not see order photos (UI FR7.4 photo display
  dropped); no Account status page; clear-all and clear-row on alerts; the
  rating prompt opens at most once and does not shift the layout; expired
  orders show no credits paid; requests have no reward in the header.
- 2026-11-03: ask User Service for an optional `q` on `GET /user/friends`
  rather than filtering one page in the browser.
- 2026-11-08: Skip in the rating prompt calls Rating's skip endpoint.

## Implementation outline (handed to Claude Code)

1. `src/lib/api.ts` as the only `fetch`; shared polled stores for credit,
   alerts, pending ratings and friends.
2. Pages in `src/pages/`, one per route; shared pieces in `src/components/`.
3. `nginx.conf` and `vite.config.ts` proxies; `deploy/push-frontend-dev.sh`.
4. Docs under `frontend/docs/`.

## Out of scope

Push to the browser (polling meets Order F2.13's one-minute alerts). Changes
to Order, Supplier or other teams' services.
