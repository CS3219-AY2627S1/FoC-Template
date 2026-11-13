# CHANGE-025 — Local frontend integration fixes

- **Date:** 2026-09-30
- **Status:** Implemented; verification pending local Docker availability
- **Scope:** Approved Order Service vertical slice on `sprint-1/seq-1-to-seq-11`
- **Approver:** Vincent, 2026-09-30

## Decision and rationale

The approved frontend uses the existing shared Next.js application and gateway-relative API
boundary. The Post Request form now loads active suppliers from the verified Supplier Service
contract and submits stable supplier IDs selected from name-labelled controls. Direct local
frontend access on port 3000 is supported by an explicit gateway CORS allowlist for localhost
ports 3000 and 8080. Signup now calls the verified Credit Service registration-fact endpoint
after User Service registration, forwarding the Firebase bearer token and the required event,
user, and timestamp fields.

These changes are a design refinement within the approved sequences 1–11 vertical slice; they
do not change Order Service ownership, peer-service source, event decisions, or production
deployment configuration. No sibling service directory was modified.

## Actual contracts verified

- Supplier Service: `GET /api/suppliers?status=active&page=1&size=100&sort=name&order=asc`,
  authenticated, returns `PageResponse<Supplier>` with `id`, `name`, and `building`.
- Credit Service: authenticated `POST /api/credits/registration-facts` with
  `{eventId,userId,occurredAt}`; replay/account initialization is provider-owned and
  idempotent.

## Files

- `frontend/src/app/requests/new/page.tsx` — active supplier loading and two controlled selects.
- `frontend/src/lib/suppliers.ts` — supplier option-label helper.
- `frontend/src/lib/supplier-selection.test.ts` — label contract tests.
- `frontend/src/components/providers/auth-provider.tsx` — bearer-forwarded credit registration.
- `frontend/src/lib/registration.ts` and `registration.test.ts` — registration payload helper/tests.
- `gateway/templates/default.conf.template` — local CORS preflight/allowlist.
- `order-service/docs/requirements-traceability.md`, `docs/active-work/vincent.md`,
  `docs/change-log.md`, `../ai/usage-log.md` — persistent traceability and disclosure.

## Verification

The required focused test command was attempted before implementation, but this Windows session
does not expose `node`/`npm` on PATH. `git diff --check` and `docker compose config --quiet` pass;
container startup, CORS preflight, and browser verification are unavailable because the Docker
engine is not accessible. Run the frontend Vitest/typecheck/lint/build suite and an authenticated
browser check when Node and Docker are available.
