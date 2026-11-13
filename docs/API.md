<!--
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-04
Scope: Drafted the API reference from the codebase, verified against.
Author review: I validated correctness, edited for domain needs, and amend the changes as necessary.
-->

# Relay API Reference

- **Repository:** [AY2627S1-CS3219-P9/Relay](https://github.com/AY2627S1-CS3219-P9/Relay)
- **Audience:** Relay frontend developers, reviewers, and anyone integrating with
  the Relay backend through the host application. It is not a public third-party API:
  all browser APIs are cookie-authenticated and same-origin through the host.

## Contents

- [Base URLs](#base-urls)
- [How Relay is structured](#how-relay-is-structured)
- [Authentication](#authentication)
- [Authorisation and roles](#authorisation-and-roles)
- [Request conventions](#request-conventions)
- [Response conventions and error handling](#response-conventions-and-error-handling)
- [Health checks](#health-checks)
- [Quick start](#quick-start)
- [API overview](#api-overview)
- [User Auth API — `/api/auth`](#user-auth-api--apiauth)
- [User API — `/api/user`](#user-api--apiuser)
- [Supplier API — `/api/supplier`](#supplier-api--apisupplier)
- [Errand API — `/api/errands`](#errand-api--apierrands)
- [Credit API — `/api/credit`](#credit-api--apicredit)
- [Errand lifecycle and credit flow](#errand-lifecycle-and-credit-flow)
- [Data models](#data-models)
- [Enumerations](#enumerations)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [Internal service APIs (not for browsers)](#internal-service-apis-not-for-browsers)
- [Error code reference](#error-code-reference)

## Base URLs

There is **no version prefix** such as `/v1` in Relay today. Do not add one:
the host proxy and the services route on the unversioned paths below.

| Environment | Base URL | Notes |
| --- | --- | --- |
| Local Docker Compose (host) | `http://localhost:8080` | The only public entry point. API containers are not exposed to the host; they are reached by service name inside Compose (for example `http://user-api:3000`). |
| Local `npm run dev` (Vite host) | `http://localhost:8080` | Vite runs with `--port 8080` (`host/package.json`), not the Vite default 5173. It proxies `/api/auth`, `/api/user`, `/api/supplier`, `/api/errands`, `/api/credit`, and `/api/notifications/stream` (SSE), plus `/remotes/*` for the federated frontends. See the repository README for the full local port table. |
| AWS / EKS deployment | `https://<distribution>.cloudfront.net` | Public HTTPS only (HTTP redirects to HTTPS). Chain: CloudFront → API Gateway (regional REST API, stage `relay`) → VPC Link → private internal ALB (HTTP :80 only) → host Nginx. The `/relay` stage/origin path is origin-side only and is **not** part of the viewer-facing base URL. The ALB DNS is private and is not a public entry point. No real distribution hostname is recorded in the repo; retrieve it from the `relay-edge` CloudFormation stack output `DistributionDomainName`. |

All examples in this document use `http://localhost:8080` as the base URL.
Replace it with deployed host when testing against AWS.

## How Relay is structured

Relay is a microfrontend host plus one backend per domain. The browser talks
to **one origin** — the host — and the host Nginx proxy forwards API paths
to the matching backend. That is why every public path below starts with
`/api/*`, even though each backend mounts its own shorter internal path
(for example, the Errand backend mounts `/api/errands` itself).

| Public path (via host) | Backend service | Repo location |
| --- | --- | --- |
| `/api/auth/*` | User Auth API (Cognito proxy) | `user-service/auth/` |
| `/api/user/*` | User API (profile) | `user-service/backend/` |
| `/api/supplier/*` | Supplier API | `supplier-service/backend/` |
| `/api/errands/*` | Errand API | `errand-service/backend/` |
| `/api/credit/*` | Credit API | `credit-service/backend/` |
| `/api/notifications/stream` | Errand Notification API (SSE) | `errand-notification-service/backend/` |
| `/remotes/supplier/`, `/remotes/user/`, `/remotes/errand/`, `/remotes/credit/` | Microfrontends (not APIs) | Service `frontend/` folders, served through the host |

The Credit Estimation service has no direct public host route. Browser clients
use the Errand API proxy at `POST /api/errands/estimate-credit`; the Errand API
authenticates the caller with the normal cookie session and calls the
Credit Estimation service with its internal service token. The direct
`/internal/estimation/estimate-credit` service route remains service-to-service
only (see [Internal service APIs](#internal-service-apis-not-for-browsers)).

## Authentication

Relay does **not** use a bearer token in an `Authorization` header for
browser APIs. Authentication is cookie-based, backed by AWS Cognito
(locally, the Floci emulator at `http://localhost:4566`).

### Cookies set on login / verification

After a successful login or email-verification login, the Auth API sets
three `HttpOnly` cookies:

| Cookie | Path | Lifetime | Purpose |
| --- | --- | --- | --- |
| `relay_access` | `/` | `Max-Age=900` (15 minutes) | Cognito access token. |
| `relay_id` | `/` | `Max-Age=900` (15 minutes) | Cognito ID token. |
| `relay_refresh` | `/api/auth` | Session cookie; no `Max-Age` or `Expires` | Cognito refresh token. |

All three are `SameSite=Strict` and `HttpOnly`, so JavaScript cannot read
them. `Secure` is added only when `COOKIE_SECURE` is enabled; on the
current HTTP demo deployment it is off. The frontend refreshes the session
by calling `POST /api/auth/refresh`.

Every authenticated backend request must send **both** `relay_access` and
`relay_id`. The backend middleware verifies both JWTs against the Cognito
JWKS, requires the two `sub` claims to match, requires an `email` claim,
and derives the role from the access token's `cognito:groups`. A request
with a missing, expired, or mismatched token pair is rejected with `401`.

```http
POST /api/errands HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Cookie: relay_access=<access-token>; relay_id=<id-token>

{
  "supplierDetails": { "supplierId": "…", "supplierName": "…", "serviceType": 0 },
  "name": "Pick up bubble tea",
  "pickupLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
  "targetLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 2 },
  "deliveryDetails": { "description": "One brown sugar milk tea, less sweet" },
  "creditAmount": 15
}
```

> **Do not** put tokens in query strings, `localStorage`, or screenshots.
> Tokens in the examples here are placeholders.

### Same-origin rule for Auth endpoints

`POST /api/auth/register`, `/verification/resend`,
`/verification/confirm-and-login`, `/login`, `/refresh`, `/logout`,
`/password`, `/admin/promote`, and `/admin/demote` enforce a same-origin
check: if the request carries an `Origin` header, it must equal
`AUTH_PUBLIC_ORIGIN` when that environment variable is set (AWS
deployments set it to the deployed public origin), otherwise
`<protocol>://<host>` from `X-Forwarded-Host`/`Host` and
`X-Forwarded-Proto`. A cross-origin request is rejected with `403
FORBIDDEN`. Non-browser clients that send no `Origin` header are not
blocked by this check. `GET /api/auth/me` is not subject to this check;
it is protected by the cookie middleware instead.

### Session lifecycle

1. Register → account is created unverified; the response does **not**
   set cookies.
2. Verify with the emailed code → cookies are set, session starts.
3. Login with a verified account → cookies are set.
4. Login with an unverified account → `403 EMAIL_NOT_VERIFIED`; no cookies.
5. Access and ID cookies expire after 15 minutes → call
   `POST /api/auth/refresh` with the `relay_refresh` cookie to rotate them.
   If the refresh cookie is missing, refresh returns `401 UNAUTHENTICATED`
   with the message `A refresh token is required.`
6. Logout → the presented refresh token is revoked in Cognito and all
   three cookies are cleared. Logout always clears cookies, even if
   revocation itself is ignored for an already-invalid token.
7. Password change → sessions are cleared (see
   [Change password](#change-password)) and the user must log in again.

## Authorisation and roles

Roles come from Cognito groups and are `user`, `admin`, or `super-admin`.
In the middleware, `admin` endpoints accept both `admin` and `super-admin`;
`super-admin` endpoints accept only `super-admin`.

| Role | What it can do via the API |
| --- | --- |
| `user` (verified email) | Own profile, suppliers (read), errands (own/visible), own credit balance and history, and credit estimation through `POST /api/errands/estimate-credit`. |
| `admin` | Everything a user can do, plus create/update/delete suppliers. |
| `super-admin` | Everything an admin can do, plus promote/demote admins. A super-admin's own role cannot be changed through promote/demote. |

Two further gates apply on top of the role check:

- **Verified email:** Errand and Credit endpoints require
  `emailVerified: true` and return `403 FORBIDDEN` when it is false.
  Supplier read endpoints check the same flag but return `401
  UNAUTHORIZED` (see the Supplier section — this inconsistency is in the
  code and is documented as-is, not normalised here).
- **Ownership:** Errand transitions are restricted to the requester or the
  assigned courier as listed per endpoint. Credit endpoints only ever
  return the caller's own balance/history; passing another user's `userId`
  returns `403 FORBIDDEN`.

## Request conventions

- **Format:** JSON request and response bodies throughout, unless an
  endpoint says otherwise (health checks, `204` responses, SSE).
- **Content type:** Send `Content-Type: application/json` on `POST`,
  `PATCH`, and `PUT` requests with a body. Malformed JSON returns `400`.
- **IDs:** Resource IDs are opaque strings. Do not assume they are numeric
  or UUIDs in client code unless the code guarantees it.
- **Timestamps:** ISO 8601 strings with an offset, for example
  `2026-11-04T15:30:00.000Z`. Errand `startAt`/`expiresAt` must be valid
  datetimes with an offset when supplied.
- **Credits:** Integer credits. There is no fractional credit and no
  currency conversion — credits are a closed in-platform economy and
  cannot be bought, withdrawn, or exchanged for money.
- **Query parameters:** Only the parameters documented per endpoint are
  honoured. Unknown query parameters are ignored by most endpoints.
- **Pagination:** There is no cursor or page-based pagination in the
  public API today. The single exception is credit history, which uses
  `offset` and returns at most 100 records (see
  [Get credit history](#get-credit-history)).
- **Idempotency:** No public endpoint accepts an idempotency key.
  Internal credit reservations are idempotent by transaction reference
  (see [Internal service APIs](#internal-service-apis-not-for-browsers)),
  but a retried browser request (for example, creating the same errand
  twice) can create a second resource. Clients should disable double
  submission in the UI rather than rely on the API to deduplicate.
- **No versioning:** Paths are unversioned. Breaking changes require a
  coordinated frontend/backend release and an update to this document
  in the same change.

## Response conventions and error handling

> **Read this first — envelopes are not uniform across services.**
> This document preserves the actual envelope per service instead of
> inventing a uniform one. New endpoints should follow the Auth/User
> envelope (`{ ok, data }` / `{ ok, error }`) and the team should migrate
> older services to it in a separate, coordinated change.

| Service | Success envelope | Error envelope |
| --- | --- | --- |
| User Auth, User | `{ "ok": true, "data": … }` | `{ "ok": false, "error": { "code", "message", "fieldErrors?" } }` |
| Supplier, Errand, Credit, Credit Estimation | Bare resource, for example `{ "supplier": … }`, `{ "errands": […] }`, or a balance object | `{ "code", "message", "fieldErrors?" }` (no `ok` wrapper) |
| User `POST /api/user/check-auth` (exception) | `{ "success": true, "data": { "role": "…" } }` — note `success`, not `ok` | Auth/User error envelope |

Common HTTP status mapping (individual endpoints list their own codes):

| Status | Meaning in Relay |
| --- | --- |
| `200 OK` | Request succeeded; body is in the success envelope for that service. |
| `201 Created` | Resource created (register, create supplier, create errand). |
| `204 No Content` | Request succeeded; there is no body (resend verification, logout, password change, promote/demote, delete supplier, delete errand). |
| `400 Bad Request` | Validation failed, invalid input, invalid OTP, or invalid query/scope. Body carries a machine-readable `code` and, where applicable, `fieldErrors` mapping a field name to a message. |
| `401 Unauthorized` | Missing/invalid/expired session, missing refresh token, invalid service token (internal), or — for Supplier reads — an unverified email. |
| `403 Forbidden` | Authenticated but not allowed: wrong role, unverified email (Errand/Credit), wrong owner, requester accepting their own errand, or cross-origin Auth request. |
| `404 Not Found` | Resource not found or profile not found. For errands, `404` is ambiguous in two different ways: `GET /api/errands/:id` returns the same `404` for a never-existed errand, a deleted errand, and an errand not visible to the caller; `DELETE /api/errands/:id` returns the same `404` for a missing errand and for an errand not in a deletable terminal state (see Errand delete). |
| `409 Conflict` | State conflict: email already registered, already admin / not admin, duplicate supplier, invalid errand transition (for example, accepting an already-accepted errand). |
| `422 Unprocessable Entity` | Credit amount invalid or insufficient for an internal reservation (`INVALID_CREDIT_AMOUNT`, `INSUFFICIENT_CREDITS`). |
| `429 Too Many Requests` | Cognito rate limit surfaced by the Auth API (`RATE_LIMITED`), or credit-estimation rate limiting (`CREDIT_ESTIMATION_RATE_LIMITED` through the Errand API; `RATE_LIMITED` on the direct internal service route). |
| `500 Internal Server Error` | Unexpected failure. `500` bodies use `INTERNAL_ERROR` (or, for Credit, a plain `message` without a code — see the Credit section). |
| `503 Service Unavailable` | Dependency unavailable: supplier health check DB failure, credit DB check failure, notification or errand Kafka consumer not yet ready, or credit estimation service unavailable via the errand proxy. |

Error example (Auth/User envelope):

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The authentication request is invalid.",
    "fieldErrors": { "password": "At least 8 characters" }
  }
}
```

Error example (Supplier/Errand/Credit envelope):

```json
{
  "code": "INVALID_ERRAND",
  "message": "The errand request is invalid.",
  "fieldErrors": { "scope": "Scope must be mine or visible." }
}
```

`fieldErrors` is present only for validation failures. Do not rely on the
human-readable `message` for control flow — branch on `code` and status.

## Health checks

Every backend exposes `GET /health` and `GET /healthz`. The host exposes
`GET /healthz` returning plain text `ok`. Use these for liveness/readiness
only; they are not authenticated and return no user data.

| Check | Typical success | Failure meaning |
| --- | --- | --- |
| Host `GET /healthz` | `200`, body `ok` | Host/Nginx not serving. |
| Auth/User `GET /health`, `GET /healthz` | `200`, `{ "status": "ok" }` | Service down. |
| Supplier `GET /healthz` | `200`, `{ "status": "ok" }` | `503 { "status": "unavailable" }` means the DB `SELECT 1` check failed. `GET /health` always returns `ok` without a DB check. |
| Errand `GET /healthz` | `200`, body `ok` | `503`, body `Kafka unavailable`, until the user-deletion Kafka consumer has connected, subscribed to `user-events`, and started running. `GET /health` always returns `ok` without a Kafka check. Once the consumer has started, the flag stays set — there is no ongoing liveness check. |
| Credit `GET /health`, `GET /healthz` | `200`, `{ "status": "ok" }` for `/health`; `200`, `{ "status": "ok", "database": "ok" }` for `/healthz` | `/health` performs no DB check. `/healthz` returns `503`, `{ "status": "unavailable", "database": "unavailable" }` when table checks fail. |
| Notification `GET /health`, `GET /healthz` | `200`, `{ "status": "ok" }` for `/health`; `200`, body `ok` for `/healthz` | `503`, body `Kafka not ready`, until the Kafka consumer has connected, subscribed, and started running. `/health` always returns `ok` without a Kafka check. These endpoints are **not** exposed through the host/Nginx — only `/api/notifications/stream` is proxied; check them directly on port `3010`. |
| Credit Estimation `GET /health` | `200`, `{ "status": "ok" }` | Service down. `GET /healthz` returns `200` with plain text `ok` and performs no Redis or AI check — it reports healthy even when Redis is unreachable. |

```bash
curl -s http://localhost:8080/healthz
# ok
```

## Quick start

```bash
BASE=http://localhost:8080

# 1. Register (NUS email only) — no cookies are set yet.
curl -s -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"e1234567@u.nus.edu","password":"Example!1","passwordConfirmation":"Example!1"}'
# {"ok":true,"data":{"verificationRequired":true}}

# 2. Verify with the code emailed to you — cookies are set from here on.
#    Use -c to save cookies and -b to send them on later calls.
curl -s -c cookies.txt -X POST "$BASE/api/auth/verification/confirm-and-login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"e1234567@u.nus.edu","password":"Example!1","code":"123456"}'

# 3. Create the required Relay profile.
#    A username is required when creating a profile. The profile picture is optional.
curl -s -b cookies.txt -X PATCH "$BASE/api/user/me" \
  -H 'Content-Type: application/json' \
  -d '{"username":"e1234567"}'

# Optional: create the profile with a JPG/PNG data URL instead.
# The decoded image must be smaller than 5 MB.
# curl -s -b cookies.txt -X PATCH "$BASE/api/user/me" \
#   -H 'Content-Type: application/json' \
#   -d '{"username":"e1234567","profilePicture":"data:image/jpeg;base64,<base64-image-data>"}'

# 4. Check who you are and confirm that the profile was created.
curl -s -b cookies.txt "$BASE/api/auth/me"
curl -s -b cookies.txt "$BASE/api/user/me"

# 5. List suppliers and check your credit balance.
curl -s -b cookies.txt "$BASE/api/supplier"
curl -s -b cookies.txt "$BASE/api/credit"
```

The first successful profile creation publishes the `UserRegistered` event.
Credit is then allocated asynchronously after Credit Service consumes that
event. If `/api/credit` is not ready immediately, retry it after a short delay
until the balance exists (normally 100 available credits for a new user).

In a browser, `fetch(..., { credentials: 'include' })` is required so the
cookies are sent. The frontend's `authFetch` helper refreshes once on `401`
and retries once; application code should not implement its own refresh loop
on top of that.

## API overview

Public (browser) endpoints only. Internal endpoints are listed separately
in [Internal service APIs](#internal-service-apis-not-for-browsers).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | None (same-origin) | Register a new NUS account; verification required. |
| POST | `/api/auth/verification/resend` | None (same-origin) | Resend the verification code. |
| POST | `/api/auth/verification/confirm-and-login` | None (same-origin) | Confirm code and start a session. |
| POST | `/api/auth/login` | None (same-origin) | Log in with a verified account. |
| POST | `/api/auth/refresh` | Refresh cookie (same-origin) | Rotate access/id cookies. |
| GET | `/api/auth/me` | Cookie | Get the authenticated identity. |
| POST | `/api/auth/logout` | Refresh cookie (same-origin) | Revoke refresh token and clear cookies. |
| POST | `/api/auth/password` | Cookie (same-origin) | Change password; clears cookies. |
| POST | `/api/auth/admin/promote` | Super-admin (same-origin) | Promote a user to admin. |
| POST | `/api/auth/admin/demote` | Super-admin (same-origin) | Demote an admin to user. |
| POST | `/api/user/check-auth` | Cookie | Check session and return the caller's role. |
| GET | `/api/user/me` | Cookie | Get the caller's profile. |
| PATCH | `/api/user/me` | Cookie | Update username and/or profile picture. |
| DELETE | `/api/user/me` | Cookie | Delete the caller's account (username confirmation). |
| GET | `/api/supplier` | Cookie + verified email | List suppliers, optionally filtered. |
| GET | `/api/supplier/:id` | Cookie + verified email | Get one supplier. |
| POST | `/api/supplier` | Admin | Create a supplier. |
| PUT | `/api/supplier/:id` | Admin | Partially update a supplier. |
| DELETE | `/api/supplier/:id` | Admin | Delete a supplier. |
| GET | `/api/notifications/stream` | Cookie | SSE stream for the caller's errands (Errand Notification API). |
| POST | `/api/errands` | Cookie + verified email | Create an errand (reserves credit). |
| GET | `/api/errands` | Cookie + verified email | List errands (`mine` / `visible`). |
| GET | `/api/errands/suppliers/:supplierId/errands` | Cookie + verified email | List errands for a supplier (`open` / `all`). |
| GET | `/api/errands/:id` | Cookie + verified email | Get one errand visible to the caller. |
| DELETE | `/api/errands/:id` | Cookie + verified email | Delete a terminal errand owned by the caller. |
| POST | `/api/errands/:id/accept` | Cookie + verified email | Courier accepts an open errand. |
| POST | `/api/errands/:id/cancel` | Cookie + verified email | Requester cancels an open errand. |
| POST | `/api/errands/:id/pickup` | Cookie + verified email | Courier picks up an accepted errand. |
| POST | `/api/errands/:id/deliver` | Cookie + verified email | Courier delivers a picked-up errand. |
| POST | `/api/errands/:id/confirm` | Cookie + verified email | Requester confirms a delivered errand. |
| POST | `/api/errands/:id/drop` | Cookie + verified email | Courier drops an accepted errand. |
| GET | `/api/credit` | Cookie + verified email | Get the caller's credit balance. |
| GET | `/api/credit/history` | Cookie + verified email | Get credit history (max 100, `offset`). |

## User Auth API — `/api/auth`

Base path via host: `/api/auth`. Backend mount: `/api/auth` in
`user-service/auth`. Envelope: `{ ok, data }` / `{ ok, error }`.
All `POST` endpoints in this section require the same-origin check
described in [Authentication](#authentication), except where noted.
Passwords and emails are validated by Zod in
`user-service/auth/src/validators/auth.validator.ts`.

**Registration rules (all Auth password fields):**

- Email must be a NUS address: `*@u.nus.edu` or `*@nus.edu.sg`,
  case-insensitive, except the configured bootstrap admin email.
- Password must be at least 8 characters and contain at least one
  lowercase letter, one uppercase letter, one number, and at least one
  special character from `!@#$%^&*`. Other special characters (for
  example `~`, `(`, `)`) are permitted — they are simply not counted
  toward the special-character requirement.
- `passwordConfirmation` / `newPasswordConfirmation` must match the
  corresponding password field, otherwise `400 VALIDATION_FAILED` with
  `fieldErrors`.
- Login passwords are only checked for non-emptiness at validation time;
  correctness is checked by Cognito and returns `401 INVALID_CREDENTIALS`.

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "e1234567@u.nus.edu",
  "password": "Example!1",
  "passwordConfirmation": "Example!1"
}
```

- **Auth:** None.
- **Success:** `201`

  ```json
  { "ok": true, "data": { "verificationRequired": true } }
  ```

  No session cookies are set. The account cannot log in until verified.
- **Errors:** `400 VALIDATION_FAILED` (bad email, weak/mismatched
  password), `409 EMAIL_ALREADY_REGISTERED`, `429 RATE_LIMITED`,
  `500 INTERNAL_ERROR`.

### Resend verification code

```http
POST /api/auth/verification/resend
Content-Type: application/json

{ "email": "e1234567@u.nus.edu" }
```

- **Auth:** None.
- **Success:** `204 No Content` (no body).
- **Errors:** `400 VALIDATION_FAILED`, `429 RATE_LIMITED`. An unknown
  email surfaces through Cognito mapping; do not use this endpoint to
  enumerate accounts in client UI copy.

### Confirm verification and log in

```http
POST /api/auth/verification/confirm-and-login
Content-Type: application/json

{
  "email": "e1234567@u.nus.edu",
  "password": "Example!1",
  "code": "123456"
}
```

- **Auth:** None.
- **Success:** `200`, cookies set (`relay_access`, `relay_id`,
  `relay_refresh`).

  ```json
  {
    "ok": true,
    "data": {
      "user": {
        "subject": "cognito-sub-uuid",
        "email": "e1234567@u.nus.edu",
        "emailVerified": true,
        "role": "user"
      }
    }
  }
  ```

- **Errors:** `400 VALIDATION_FAILED`, `400 OTP_INVALID`,
  `400 OTP_EXPIRED`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`.

### Log in

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "e1234567@u.nus.edu", "password": "Example!1" }
```

- **Auth:** None.
- **Success:** `200`, cookies set, body is the same
  `{ ok: true, data: { user: … } }` shape as verification login.
- **Errors:** `400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS`,
  `403 EMAIL_NOT_VERIFIED`, `429 RATE_LIMITED`,
  `500 INTERNAL_ERROR` (Cognito did not return all three tokens).

### Refresh session

```http
POST /api/auth/refresh
Cookie: relay_refresh=<refresh-token>
```

- **Auth:** `relay_refresh` cookie. No body is required.
- **Success:** `200`, new `relay_access` / `relay_id` cookies set, and a
  new `relay_refresh` cookie when Cognito rotates it (otherwise the
  presented refresh token is re-issued). Body is
  `{ ok: true, data: { user: … } }`.
- **Errors:** `401 UNAUTHENTICATED` when the refresh cookie is missing
  or invalid, `403 FORBIDDEN` for a cross-origin request.

### Get current identity

```http
GET /api/auth/me
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair.
- **Success:** `200`

  ```json
  {
    "ok": true,
    "data": {
      "user": {
        "subject": "cognito-sub-uuid",
        "email": "e1234567@u.nus.edu",
        "emailVerified": true,
        "role": "user"
      }
    }
  }
  ```

  Note: this is the **identity** (`subject`, Cognito email, role). It is
  not the User API profile (username, profile picture). Do not confuse
  `GET /api/auth/me` with `GET /api/user/me`.
- **Errors:** `401 UNAUTHENTICATED`.

### Log out

```http
POST /api/auth/logout
Cookie: relay_refresh=<refresh-token>
```

- **Auth:** Refresh cookie (logout still clears cookies if no refresh
  token is presented).
- **Success:** `204 No Content`. The presented refresh token is revoked
  in Cognito and all three cookies are cleared.
- **Errors:** Revocation failures for an already-invalid token are
  ignored by design; the endpoint still returns `204` and clears cookies.

### Change password

```http
POST /api/auth/password
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{
  "currentPassword": "Example!1",
  "newPassword": "Example!2",
  "newPasswordConfirmation": "Example!2"
}
```

- **Auth:** Cookie pair, plus same-origin check. The current password is
  re-verified against Cognito before the change.
- **Success:** `204 No Content`. All cookies are cleared and Cognito
  global sign-out is performed, so the user must log in again.
- **Errors:** `400 VALIDATION_FAILED` (including mismatched new
  passwords), `401 UNAUTHENTICATED` (wrong current password / Cognito
  authentication failed), `403 FORBIDDEN` (cross-origin).

### Promote user to admin

```http
POST /api/auth/admin/promote
Content-Type: application/json

{ "email": "e1234567@u.nus.edu" }
```

- **Auth:** Super-admin cookie pair, plus same-origin check.
- **Success:** `204 No Content`. The new role appears in tokens only
  after the target user's next login/refresh.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN` (not super-admin,
  or attempting to change a super-admin's role), `404 USER_NOT_FOUND`,
  `409 ALREADY_ADMIN`, `400 VALIDATION_FAILED`.

### Demote admin to user

```http
POST /api/auth/admin/demote
Content-Type: application/json

{ "email": "e1234567@u.nus.edu" }
```

- **Auth:** Super-admin cookie pair, plus same-origin check.
- **Success:** `204 No Content`, with the same token-refresh caveat as promote.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
  `404 USER_NOT_FOUND`, `409 NOT_ADMIN`, `400 VALIDATION_FAILED`.

## User API — `/api/user`

Base path via host: `/api/user`. Backend mount: `/api/user` in
`user-service/backend`. Envelope: `{ ok, data }` / `{ ok, error }`,
except `POST /api/user/check-auth` (see below). JSON body limit is `7mb`
because profile pictures are sent as base64 data URLs (see below).
Profile creation is driven by the frontend after login; the API itself
returns `404 PROFILE_NOT_FOUND` when no profile row exists for the
authenticated subject.

### Check auth

```http
POST /api/user/check-auth
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair. No body is required.
- **Success:** `200`

  ```json
  { "success": true, "data": { "role": "user" } }
  ```

  Note the `success` field here, which differs from the `ok` field used
  by every other User/Auth endpoint.
- **Errors:** `401 UNAUTHENTICATED` (from the cookie middleware).

### Get my profile

```http
GET /api/user/me
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair.
- **Success:** `200`

  ```json
  {
    "ok": true,
    "data": {
      "id": "profile-id",
      "email": "e1234567@u.nus.edu",
      "username": "alice123",
      "profilePictureUrl": "https://…/profile.jpg",
      "emailVerified": true,
      "profileCreated": true,
      "role": "user"
    }
  }
  ```

  `username` and `profilePictureUrl` are `null` when not set.
  `profileCreated` is always `true` in a returned profile.
- **Errors:** `401 UNAUTHENTICATED`, `404 PROFILE_NOT_FOUND`.

### Update my profile

```http
PATCH /api/user/me
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{
  "username": "alice123",
  "profilePicture": "data:image/jpeg;base64,/9j/…"
}
```

- **Auth:** Cookie pair.
- **Body:** At least one of `username` or `profilePicture` is required.
  - `username`: optional, 3–50 alphanumeric characters only
    (`^[a-zA-Z0-9]{3,50}$`). No spaces or symbols.
  - `profilePicture`: optional, `null` to clear, or a data URL for
    `image/jpeg` or `image/png` only. The decoded image must be smaller
    than 5 MB. The service stores the image (local storage / S3 in
    deployment) and returns a URL; it does not echo the data URL back.
- **Success:** `200`, body is the full updated `User` object in the
  same shape as `GET /api/user/me`. Partial profile responses are not
  returned.
- **Errors:** `400 VALIDATION_FAILED` (including an empty update and
  an invalid image), `401 UNAUTHENTICATED`, `404 PROFILE_NOT_FOUND`,
  `409 USERNAME_TAKEN`.

### Delete my account

```http
DELETE /api/user/me
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{ "confirmation": "alice123" }
```

- **Auth:** Cookie pair.
- **Body:** `confirmation` must be exactly the caller's current
  `username`. This is a deliberate destructive-action guard, not a
  password check. If the user has no username, deletion cannot be
  confirmed this way and returns `400 VALIDATION_FAILED`.
- **Success:** `204 No Content` when deletion completes synchronously.
  The three auth cookies are cleared. A `UserDeleted` event is published
  so the Credit Service can close the credit account asynchronously.
  Deletion can also return `202 { "ok": true, "data": { "status":
  "pending" } }` when the profile is already deleted and a `UserDeleted`
  outbox event exists (a retry of an in-flight deletion), when a
  concurrent delete removed the profile, or when Cognito removal fails —
  the profile is gone and Cognito cleanup completes asynchronously via
  the Auth account-deletion consumer.
  Credit data is **closed, not deleted**: the balance row is set to
  `status: 'CLOSED'` (amounts retained, but `GET /api/credit` then
  returns `404 USER_NOT_FOUND`); settlements already credited to the
  deleted user become `PENDING` in `credit_settlements`, and any later
  transfer to a closed account records a `PENDING` settlement instead of
  crediting the balance. The `UserDeleted` event (v1) optionally carries
  `profilePictureKey` so the S3 image can be deleted by a consumer.
- **Errors:** `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`,
  `404 PROFILE_NOT_FOUND`.

## Supplier API — `/api/supplier`

Base path via host: `/api/supplier`. Backend mount: `/api/supplier` in
`supplier-service/backend`. Envelope: bare resource
(`{ suppliers: […] }` / `{ supplier: … }`); errors are flat
`{ code, message }` with no `ok` wrapper. Note the singular path:
`/api/supplier`, not `/api/suppliers`. The frontend route `/suppliers`
is a UI route, not the API path.

All read endpoints in this section first pass the cookie middleware
(`401 UNAUTHENTICATED` if the cookie pair is missing/invalid) and then
check `emailVerified`. If the email is unverified, the controller
returns `401` with code `UNAUTHORIZED` — not `403`. Write endpoints use
the admin middleware, which returns `403 FORBIDDEN` for non-admins.

### List suppliers

```http
GET /api/supplier?status=operational&serviceTypes=[0,1]
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email.
- **Query parameters:**

  | Parameter | Type | Description |
  | --- | --- | --- |
  | `status` | `all` \| `operational` \| `not-operational` | Optional. Omitted or `all` means no status filter. Any other value returns `400 INVALID_REQUEST`. |
  | `serviceTypes` | JSON array of integers | Optional. Must be a JSON-encoded array, for example `serviceTypes=[0,1]`, not repeated query keys. Matching is OR: a supplier matches if it offers any listed type. An empty array matches no supplier. Non-JSON or non-numeric values return `400 INVALID_REQUEST`. |

- **Success:** `200`

  ```json
  {
    "suppliers": [
      {
        "id": "supplier-id",
        "name": "UTown Food Court",
        "location": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
        "isOperational": true,
        "operatingHours": { "openingTime": "08:00", "closingTime": "21:00", "daysOfWeek": [0, 1, 2, 3, 4] },
        "serviceTypes": [0, 1]
      }
    ]
  }
  ```

- **Errors:** `401 UNAUTHENTICATED` / `401 UNAUTHORIZED` (unverified
  email), `400 INVALID_REQUEST` (bad filter).

### Get one supplier

```http
GET /api/supplier/:id
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email.
- **Success:** `200`, `{ "supplier": { … } }` in the same shape as above.
- **Errors:** `401 UNAUTHENTICATED` / `401 UNAUTHORIZED`,
  `404 NOT_FOUND`.

### Create supplier

```http
POST /api/supplier
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{
  "name": "UTown Food Court",
  "location": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
  "isOperational": true,
  "operatingHours": { "openingTime": "08:00", "closingTime": "21:00", "daysOfWeek": [0, 1, 2, 3, 4] },
  "serviceTypes": [0, 1]
}
```

- **Auth:** Admin (admin or super-admin) + verified email.
- **Validation:** `name` is required and non-blank; `isOperational`
  must be a boolean; `location` requires numeric `lat`/`lng`, a
  non-blank `buildingName`, and a numeric `floorNumber`;
  `operatingHours` requires `HH:mm` (24-hour) `openingTime` and
  `closingTime` and a non-empty `daysOfWeek` array of valid days
  (0 = Monday … 6 = Sunday); `serviceTypes` must be a non-empty array
  of valid service types (see [Enumerations](#enumerations)).
- **Success:** `201`, `{ "supplier": { … } }`.
- **Errors:** `401 UNAUTHENTICATED` / `401 UNAUTHORIZED`,
  `403 FORBIDDEN` (non-admin), `400 INVALID_REQUEST`,
  `409 DUPLICATE_SUPPLIER` (same name at the same location),
  `500 INTERNAL_ERROR`.

Creating, updating, or deleting a supplier also notifies the Errand
Service via an internal supplier event (see
[Internal service APIs](#internal-service-apis-not-for-browsers)).
If a supplier becomes non-operational, its open/accepted errands are
deleted by that flow; clients should re-fetch errand lists after a
supplier change.

### Update supplier

```http
PUT /api/supplier/:id
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{ "isOperational": false }
```

- **Auth:** Admin + verified email.
- **Body:** Any subset of the create fields. This is a `PUT` endpoint
  in code, but the controller forwards whatever fields are present to
  the service — it does not require a complete replacement object.
  **Update validation is currently incomplete:** unlike create, the
  update controller applies no field validation before forwarding
  supplied fields to the service, so malformed fields may reach the
  database unchecked. (Fix in code: validate supplied fields with the
  same validators as create.)
- **Success:** `200`, `{ "supplier": { … } }` (updated object).
- **Errors:** `401 UNAUTHENTICATED` / `401 UNAUTHORIZED`,
  `403 FORBIDDEN`, `400 INVALID_REQUEST`, `500 INTERNAL_ERROR`.
  Note: updating a non-existent supplier currently surfaces as `500
  INTERNAL_ERROR`, not `404` — the service throws a plain
  `Error('Supplier not found')` which the Supplier error handler does
  not map to `NOT_FOUND`. This is a bug to fix in code, documented
  here as-is.

### Delete supplier

```http
DELETE /api/supplier/:id
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Admin + verified email.
- **Success:** `204 No Content`.
- **Errors:** `401 UNAUTHENTICATED` / `401 UNAUTHORIZED`,
  `403 FORBIDDEN`, `500 INTERNAL_ERROR`. As with update, deleting a
  non-existent supplier currently surfaces as `500`, not `404`, for
  the same unmapped-error reason.

## Errand API — `/api/errands`

Base path via host: `/api/errands`. Backend mount: `/api/errands` in
`errand-service/backend`, behind `sessionMiddleware` — that is, the
cookie middleware **plus** a verified-email check (`403 FORBIDDEN` if
unverified). Envelope: bare resource (`{ errand: … }` /
`{ errands: […] }`); errors are flat
`{ code, message, fieldErrors? }`.

The Errand Notification API provides the SSE stream at
`GET /api/notifications/stream` (see
[Server-Sent Events (SSE)](#server-sent-events-sse)).
`GET /api/errands/suppliers/:supplierId/errands` is a distinct route from
`GET /api/errands/:id`.

### Create errand

```http
POST /api/errands
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{
  "supplierDetails": { "supplierId": "supplier-id", "supplierName": "UTown Food Court", "serviceType": 0 },
  "name": "Pick up bubble tea",
  "pickupLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
  "targetLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 2 },
  "deliveryDetails": { "description": "One brown sugar milk tea, less sweet", "instructions": "Leave at the lobby" },
  "creditAmount": 15,
  "startAt": "2026-11-04T16:00:00.000+08:00",
  "expiresAt": "2026-11-04T18:00:00.000+08:00"
}
```

- **Auth:** Cookie pair + verified email. The requester is always the
  authenticated user; there is no requester field in the body.
- **Profile required:** Creation also requires a completed requester
  profile (a profile row must exist in the User API), checked after the
  verified-email check and before supplier validation and credit
  reservation; otherwise `400 INVALID_ERRAND` — "A completed profile is
  required to create an errand." If the User API is unreachable the call
  fails closed with `503 INTERNAL_ERROR`.
- **Validation:**
  - `supplierDetails.supplierId` and `supplierName`: non-blank strings;
    `serviceType`: integer.
  - `name`: non-blank, max 200 characters.
  - `pickupLocation` / `targetLocation`: `lat` in [-90, 90], `lng` in
    [-180, 180], non-blank `buildingName`, integer `floorNumber`.
  - `deliveryDetails.description`: non-blank, max 5000 characters;
    `instructions`: optional, non-blank if present.
  - `creditAmount`: integer, `>= 0`. Note: the validator allows `0`;
    whether a zero-credit errand is desirable is a product decision,
    not an API rejection.
  - `startAt` / `expiresAt`: optional ISO datetimes with an offset.
    `expiresAt`, when supplied, must be in the future, and `startAt`
    must be on or before `expiresAt`.
- **Side effects, in order:** the supplier selection is validated
  against the Supplier API (supplier must exist, be operational, and
  offer the service type); the errand amount is reserved from the
  requester's available credit via the internal Credit reserve
  endpoint; only then is the errand created in status `OPEN`. If
  reservation fails, the pending errand is removed and an
  `ERRAND_CREATION_FAILED` event is published so credit can be
  released. A failure therefore does **not** leave a dangling `OPEN`
  errand with unreserved credit, but the client must still handle the
  error response — it must not assume creation succeeded.
- **Success:** `201`, `{ "errand": { … } }` (see
  [Data models](#data-models)).
- **Errors:** `400 INVALID_ERRAND` (validation, with `fieldErrors`),
  `401 UNAUTHENTICATED`, `403 FORBIDDEN` (unverified email),
  `409` / `422` from the supplier/credit checks surfaced as
  `SUPPLIER_UNAVAILABLE`, `SUPPLIER_INACTIVE`,
  `SERVICE_TYPE_NOT_OFFERED`, or `INSUFFICIENT_CREDIT`,
  `500 INTERNAL_ERROR`.

### List errands

```http
GET /api/errands?scope=mine
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email.
- **Query parameters:**

  | Parameter | Values | Default / behaviour |
  | --- | --- | --- |
  | `scope` | `mine` \| `visible` | Omitted means `visible`. Any other value returns `400 INVALID_ERRAND` with `fieldErrors.scope`. |

  - `mine`: errands owned by the caller.
  - `visible`: errands visible to the caller (their own plus errands
    they can discover/accept — the exact visibility predicate is in
    `errand.repository.listVisibleTo`; clients should not assume it is
    simply “all open errands”).
- **Success:** `200`, `{ "errands": [ … ] }`. Reading this list also
  triggers due lifecycle transitions first (expired open errands become
  `EXPIRED`; delivered errands past their confirmation deadline become
  `CONFIRMED` — see
  [Errand lifecycle and credit flow](#errand-lifecycle-and-credit-flow)).
- **Errors:** `400 INVALID_ERRAND`, `401 UNAUTHENTICATED`,
  `403 FORBIDDEN`.

### List errands for a supplier

```http
GET /api/errands/suppliers/:supplierId/errands?scope=open
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email.
- **Query parameters:**

  | Parameter | Values | Behaviour |
  | --- | --- | --- |
  | `scope` | `open` \| `all` | Omitted means `all` (via `listBySupplier`). `open` lists only open errands for that supplier. Any other value returns `400 INVALID_ERRAND`. |

- **Success:** `200`, `{ "errands": [ … ] }`, with courier profiles
  enriched where a courier is assigned.
- **Errors:** `400 INVALID_ERRAND`, `401 UNAUTHENTICATED`,
  `403 FORBIDDEN`.

Do not confuse this route with the internal supplier-view endpoint
(`POST /internal/errands/supplier-view`, see
[Internal service APIs](#internal-service-apis-not-for-browsers)),
which returns privacy-safe `SupplierErrandSummary` objects without
`requesterSub`/`courierSub`.

### Get one errand

```http
GET /api/errands/:id
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. The caller must be able to
  see the errand (requester or courier visibility); otherwise the
  service returns `404`, deliberately not distinguishing “does not
  exist” from “not visible to you”.
- **Success:** `200`, `{ "errand": { … } }`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
  `404 NOT_FOUND`.

### Delete errand

```http
DELETE /api/errands/:id
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. Only the requester may delete,
  and only when the errand is in a terminal state: `CANCELLED`,
  `EXPIRED`, or `CONFIRMED`. Deleting sets status to `DELETED`; it does
  not hard-delete the row in the repository path.
- **Success:** `204 No Content`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`ONLY REQUESTER CAN DELETE`), `404 NOT_FOUND` (not found, or not in
  a terminal state — the error map returns `NOT_FOUND` for
  `ERRAND NOT IN TERMINAL`, so clients must not infer “missing” from
  this code alone), `409 INVALID_TRANSITION` (already deleted).

### Accept errand

```http
POST /api/errands/:id/accept
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Errand must be `OPEN` and not expired; the requester
  cannot accept their own errand; a courier may have at most
  **5** errands in `ACCEPTED`, `PICKED_UP`, or `DELIVERED` at once.
  Acceptance is transactional in the repository, so concurrent accepts
  yield exactly one winner and the rest fail with `409
  INVALID_TRANSITION` (`ERRAND ALREADY ACCEPTED`).
- **Success:** `200`, `{ "errand": { … } }` with status `ACCEPTED`
  and `courierSub` set to the caller.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`REQUESTER CANNOT ACCEPT OWN ERRAND`, `MAX ERRANDS REACHED`),
  `404 NOT_FOUND` (including `ERRAND HAS EXPIRED`),
  `409 INVALID_TRANSITION` (already accepted / not `OPEN`),
  `409 REQUESTER_DELETED` — "The requester account has been deleted."
  — if the requester's profile no longer exists. The check runs after
  open-errand expiry and before the `OPEN`-status and 5-errand-per-courier
  checks. If the User API is unavailable the call fails closed with
  `503 INTERNAL_ERROR`.

### Cancel errand

```http
POST /api/errands/:id/cancel
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Only the requester, and only while the errand is `OPEN`.
  Cancellation releases the reserved credit asynchronously via Kafka
  (see [Errand lifecycle and credit flow](#errand-lifecycle-and-credit-flow)).
- **Success:** `200`, `{ "errand": { … } }` with status `CANCELLED`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`ONLY REQUESTER CAN CANCEL`), `404 NOT_FOUND`,
  `409 INVALID_TRANSITION` (already cancelled / not `OPEN`).

### Pick up errand

```http
POST /api/errands/:id/pickup
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Only the assigned courier, and only from `ACCEPTED`.
- **Success:** `200`, `{ "errand": { … } }` with status `PICKED_UP`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`ONLY COURIER CAN PICK UP`), `404 NOT_FOUND`,
  `409 INVALID_TRANSITION` (already picked up / not `ACCEPTED`).

### Deliver errand

```http
POST /api/errands/:id/deliver
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Only the assigned courier, and only from `PICKED_UP`.
  Delivery sets `confirmationDeadline` to **23:59:59.999 Singapore time
  on the delivery date** (Asia/Singapore, UTC+08:00, no daylight saving).
- **Success:** `200`, `{ "errand": { … } }` with status `DELIVERED`
  and `confirmationDeadline` set.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`ONLY COURIER CAN DELIVER`), `404 NOT_FOUND`,
  `409 INVALID_TRANSITION` (already delivered / not `PICKED_UP`).

### Confirm errand

```http
POST /api/errands/:id/confirm
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Only the requester, and only from `DELIVERED`. Confirming
  triggers the credit transfer (requester's reserved credit →
  courier's available credit) via the Kafka completion event. If the
  requester does not confirm, delivered errands past their
  `confirmationDeadline` are auto-confirmed on the next read lifecycle
  pass.
- **Success:** `200`, `{ "errand": { … } }` with status `CONFIRMED`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`
  (`ONLY REQUESTER CAN CONFIRM`), `404 NOT_FOUND`,
  `409 INVALID_TRANSITION` (already confirmed / not `DELIVERED`).

### Drop errand

```http
POST /api/errands/:id/drop
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. No body is required.
- **Rules:** Only the assigned courier, and only from `ACCEPTED`
  (not from `PICKED_UP`). Dropping clears `courierSub` and returns the
  errand to `OPEN`, or to `EXPIRED` if `expiresAt` has already passed.
  The reserved credit stays reserved to the requester; dropping does
  not cancel the errand.
- **Success:** `200`, `{ "errand": { … } }` with status `OPEN` (or
  `EXPIRED`) and `courierSub: null`.
- **Errors:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`,
  `409 INVALID_TRANSITION` (not `ACCEPTED`).
  Note: a drop attempt by a non-assigned courier currently surfaces as
  `500 INTERNAL_ERROR`, not `403` — the repository throws
  `ONLY COURIER CAN DROP`, but that string is missing from
  `errand-error-map.ts`, so `translateError` re-throws it unmapped.
  This is a bug to fix in code (add the mapping), documented here as-is.

## Credit API — `/api/credit`

Base path via host: `/api/credit`. Backend mount: `/api/credit` in
`credit-service/backend`, behind `creditAuthMiddleware` — cookie
middleware plus a verified-email check (`403 FORBIDDEN` if unverified).
Envelope: bare balance / history objects; errors are flat
`{ code, message }`. Note: the Credit `500` error body is
`{ "message": "An unexpected error occurred." }` with **no `code`**,
unlike every other service.

Credits are per-user, keyed internally by Cognito `sub` (`userId` in
API payloads). A new user starts with **100 available credits and 0
reserved credits**, allocated asynchronously when the Credit Service
consumes the `UserRegistered` event published by first profile creation.
Do not assume the balance exists immediately after profile creation — poll
`GET /api/credit` until it
returns `200` (the load-test provisioner in the repository does exactly
this, with a 30-second timeout).

### Get credit balance

```http
GET /api/credit
GET /api/credit?userId=<own-sub>
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. The balance is always the
  caller's own.
- **Query parameters:** `userId` is optional. If supplied, it must be
  a non-empty string equal to the caller's own subject; any other value
  returns `403 FORBIDDEN` (`You can only view your own credits.`).
  An empty `userId` returns `400 INVALID_REQUEST`.
- **Success:** `200`

  ```json
  {
    "userId": "cognito-sub-uuid",
    "availableCredit": 90,
    "reserveCredit": 10,
    "lastUpdated": "2026-11-04T15:30:00.000Z"
  }
  ```

  `lastUpdated` is serialised as an ISO timestamp in the HTTP response
  even though the contract types it as `Date`.
- **Errors:** `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
  `404 USER_NOT_FOUND` (no credit record yet — for example, before the
  `UserRegistered` event has been consumed).

### Get credit history

```http
GET /api/credit/history
GET /api/credit/history?offset=100
GET /api/credit/history?userId=<own-sub>&offset=100
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** Cookie pair + verified email. The same `userId` rule as
  balance applies.
- **Query parameters:**

  | Parameter | Type | Default | Rules |
  | --- | --- | --- | --- |
  | `offset` | Non-negative integer | `0` | Number of newest records to skip. Must match `^(0\|[1-9]\d*)$` and be at most `2147483647`, otherwise `400 INVALID_REQUEST`. |
  | `userId` | String | Caller's subject | Must equal the caller's subject if supplied, otherwise `403 FORBIDDEN`. |

- **Success:** `200`, at most **100 records**, newest first, starting
  after `offset`:

  ```json
  {
    "records": [
      {
        "reference": { "service": "errand", "id": "errand-id", "type": "CREDIT_RESERVE" },
        "time": "2026-11-04T15:30:00.000Z",
        "senderId": "cognito-sub-uuid",
        "receiverId": "cognito-sub-uuid",
        "type": "CREDIT_RESERVE",
        "amount": 15
      }
    ]
  }
  ```

  `reference.service`, `reference.id`, and `reference.type` together
  form the idempotency key for credit operations
  (`service:id:type`). `time` is an ISO timestamp in the HTTP response.
- **Errors:** `400 INVALID_REQUEST` (bad `offset`/`userId`),
  `401 UNAUTHENTICATED`, `403 FORBIDDEN`. There is no `404` on this
  endpoint: unlike `GET /api/credit`, history does not look up the
  balance first — it queries transaction records directly, so a user
  with no credit record and no transactions gets `200 { "records": [] }`.
  History also survives balance closure (the balance row is set to
  `status: 'CLOSED'` and is never deleted).

## Errand lifecycle and credit flow

This section is normative for clients: do not invent transitions that
are not listed here, and do not assume a transition is allowed from a
state not listed for it.

```
OPEN ──accept──▶ ACCEPTED ──pickup──▶ PICKED_UP ──deliver──▶ DELIVERED ──confirm──▶ CONFIRMED (deletable)
  │                │
  │                └─drop──▶ OPEN (or EXPIRED if past expiresAt)
  └─cancel──▶ CANCELLED (deletable)
  └─expiry──▶ EXPIRED (deletable)

DELIVERED ──(past confirmationDeadline, on next read pass)──▶ CONFIRMED
CANCELLED / EXPIRED / CONFIRMED ──delete──▶ DELETED
```

| From | Action (endpoint) | Actor | To | Credit effect |
| --- | --- | --- | --- | --- |
| — | Create (`POST /api/errands`) | Requester | `OPEN` | `creditAmount` moves from requester's available → reserved, synchronously via internal reserve. Fails the whole creation on insufficient credit. |
| `OPEN` | Accept | Courier (not requester) | `ACCEPTED` | None. |
| `OPEN` | Cancel | Requester | `CANCELLED` | Reserved amount released back to requester's available, asynchronously via Kafka (`ERRAND_CANCELLED`). |
| `ACCEPTED` | Pick up | Assigned courier | `PICKED_UP` | None. |
| `ACCEPTED` | Drop | Assigned courier | `OPEN` or `EXPIRED` | None (reservation stays with the requester). |
| `PICKED_UP` | Deliver | Assigned courier | `DELIVERED` | None at delivery time; `confirmationDeadline` is set. |
| `DELIVERED` | Confirm | Requester | `CONFIRMED` | Reserved amount transfers to the courier's available credit, asynchronously via Kafka (`ERRAND_COMPLETED`). |
| `DELIVERED` | Auto-confirm (read pass) | System | `CONFIRMED` | Same transfer as manual confirm. |
| `OPEN` | Expiry (read pass) | System | `EXPIRED` | Reserved amount released, asynchronously via Kafka (`ERRAND_EXPIRED`). |
| `CANCELLED` / `EXPIRED` / `CONFIRMED` | Delete | Requester | `DELETED` | None. |

### Account-deletion transitions

When a user deletes their account, the Errand API consumes the
`UserDeleted` event and applies system transitions (`actorType:
'system'`) in addition to the user-driven transitions above:

| Deleted user | From | To | Event | Credit effect |
| --- | --- | --- | --- | --- |
| Requester | `OPEN` | `CANCELLED` | `ERRAND_CANCELLED` | Reserved amount released, as for a normal cancel. |
| Requester | `ACCEPTED` / `PICKED_UP` / `DELIVERED` | `CONFIRMED` | `ERRAND_COMPLETED` | Full reserved credit transferred to the courier, even though nothing was delivered. |
| Courier | `ACCEPTED` / `PICKED_UP` (not expired) | `OPEN` | `ERRAND_STATUS_CHANGED` (`reason: 'courier-deleted'`) | None — reservation stays held; the errand is re-offered. |
| Courier | `ACCEPTED` / `PICKED_UP` (expired) | `EXPIRED` | `ERRAND_EXPIRED` (`reason: 'courier-deleted'`) | Reserved amount released. |
| Courier | `DELIVERED` | `CONFIRMED` | `ERRAND_COMPLETED` (`reason: 'courier-deleted'`) | Transfer is attempted to the deleted courier; because their balance is closed, the payment is recorded as a `PENDING` settlement instead of crediting a balance. |

Terminal errands are untouched by either handler. Requester-deletion
events carry no `reason` metadata (unlike the courier path). Known gap
in `main` at this snapshot: in-flight errand creations
(`pendingErrand` rows) are not handled by the deletion flow.

**Client guidance for the async credit steps:** after cancel, expiry,
or confirm, do not read the balance once and treat it as final.
Re-read `GET /api/credit` (and history) until the expected transaction
appears, with a timeout — settlement is event-driven through Kafka, not
part of the HTTP response. The repository's load tests poll credit for
up to 30 seconds for the same reason.

**Courier limit:** at most 5 errands in `ACCEPTED`, `PICKED_UP`, or
`DELIVERED` combined. The 6th accept fails with `403 FORBIDDEN`
(`MAX ERRANDS REACHED` in the repository error map).

## Data models

Field types below follow `packages/contracts/src/*`. `string` IDs are
opaque. Timestamps are ISO 8601 strings in HTTP responses. Fields
marked optional are omitted or `null` as noted per endpoint; do not
send `null` for a required field unless the endpoint explicitly allows it.

### AuthenticatedUser (Auth identity)

```json
{
  "subject": "cognito-sub-uuid",
  "email": "e1234567@u.nus.edu",
  "emailVerified": true,
  "role": "user"
}
```

`role` is one of `user`, `admin`, `super-admin`.

### User (profile)

```json
{
  "id": "profile-id",
  "email": "e1234567@u.nus.edu",
  "username": "alice123",
  "profilePictureUrl": "https://…/profile.jpg",
  "emailVerified": true,
  "profileCreated": true,
  "role": "user"
}
```

`username` and `profilePictureUrl` may be `null`.

### UserProfileSummary (internal only)

```json
{ "username": "alice123", "profilePictureUrl": "https://…/profile.jpg" }
```

Returned by `GET /internal/user/profile/:sub`. Both fields may be `null`.

### Supplier

```json
{
  "id": "supplier-id",
  "name": "UTown Food Court",
  "location": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
  "isOperational": true,
  "operatingHours": { "openingTime": "08:00", "closingTime": "21:00", "daysOfWeek": [0, 1, 2, 3, 4] },
  "serviceTypes": [0, 1]
}
```

### Errand

```json
{
  "id": "errand-id",
  "name": "Pick up bubble tea",
  "requesterSub": "cognito-sub-uuid",
  "courierSub": null,
  "courierProfile": null,
  "supplierDetails": { "supplierId": "supplier-id", "supplierName": "UTown Food Court", "serviceType": 0 },
  "pickupLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 1 },
  "targetLocation": { "lat": 1.29, "lng": 103.77, "buildingName": "UTown", "floorNumber": 2 },
  "deliveryDetails": { "description": "One brown sugar milk tea, less sweet", "instructions": "Leave at the lobby" },
  "creditAmount": 15,
  "status": "OPEN",
  "startAt": "2026-11-04T16:00:00.000+08:00",
  "expiresAt": "2026-11-04T18:00:00.000+08:00",
  "confirmationDeadline": null,
  "createdAt": "2026-11-04T15:30:00.000Z",
  "updatedAt": "2026-11-04T15:30:00.000Z"
}
```

`courierSub` and `courierProfile` are `null` until accepted.
`courierProfile`, when present, is `{ username, profilePictureUrl }`
with either field possibly `null`. `deliveryDetails.instructions` is
omitted when not supplied. `confirmationDeadline` is `null` until
delivery, then an ISO timestamp.

### SupplierErrandSummary (internal supplier view only)

The `Errand` shape **without** `requesterSub` and `courierSub`. Used by
the internal supplier-view endpoint so supplier map/detail views do not
leak user subjects.

### CreditBalance

```json
{
  "userId": "cognito-sub-uuid",
  "availableCredit": 90,
  "reserveCredit": 10,
  "lastUpdated": "2026-11-04T15:30:00.000Z"
}
```

### TransactionRecord

```json
{
  "reference": { "service": "errand", "id": "errand-id", "type": "CREDIT_RESERVE" },
  "time": "2026-11-04T15:30:00.000Z",
  "senderId": "cognito-sub-uuid",
  "receiverId": "cognito-sub-uuid",
  "type": "CREDIT_RESERVE",
  "amount": 15
}
```

`type` is one of `INITIAL_ALLOCATION`, `CREDIT_RESERVE`,
`CREDIT_RELEASE`, `CREDIT_TRANSFER`, `USER_DELETION`.

### EstimateCreditResponse

```json
{
  "minCredits": 15,
  "maxCredits": 25,
  "reason": "Food baseline adjusted for the errand details and time window."
}
```

The UI uses the returned range to suggest the midpoint as the errand's
credit amount. A response with `minCredits: -1` and `maxCredits: -1` means
the estimation input could not be evaluated; the UI displays an error rather
than using `-1` as a price.

### ErrandNotification (SSE payload)

```json
{
  "eventId": "event-id",
  "type": "ERRAND_STATUS_CHANGED",
  "errandId": "errand-id",
  "timestamp": "2026-11-08T15:30:00.000Z",
  "oldStatus": "OPEN",
  "newStatus": "ACCEPTED"
}
```

`type` is one of `ERRAND_CREATED`, `ERRAND_STATUS_CHANGED`,
`ERRAND_DELETED`. `oldStatus`/`newStatus` are `ErrandStatus` values.

## Enumerations

### ServiceType (supplier / errand / estimation)

| Value | Name |
| --- | --- |
| `0` | Food |
| `1` | Drink |
| `2` | Shopping |
| `3` | Printing |
| `4` | Parcel |

The estimation service rejects service types outside `0`–`4` with
`400 INVALID_INPUT`; there is no unknown-type fallback in the current
implementation.

### Day (supplier operating hours)

| Value | Day |
| --- | --- |
| `0` | Monday |
| `1` | Tuesday |
| `2` | Wednesday |
| `3` | Thursday |
| `4` | Friday |
| `5` | Saturday |
| `6` | Sunday |

### ErrandStatus

`OPEN`, `ACCEPTED`, `PICKED_UP`, `DELIVERED`, `CANCELLED`, `EXPIRED`,
`CONFIRMED`, `DELETED`.

### Errand list scopes

- Public list: `mine`, `visible` (default `visible`).
- Supplier list: `open`, `all` (default `all`).
- Internal supplier view: `explore`, `mine`.

## Server-Sent Events (SSE)

### Stream errand notifications

```http
GET /api/notifications/stream
Cookie: relay_access=<access-token>; relay_id=<id-token>
Accept: text/event-stream
```

- **Auth:** Cognito cookie pair (`relay_access` + `relay_id` JWTs) via
  `userAuthMiddleware`. There is **no verified-email gate** on this
  endpoint, so there is no `403` for an unverified email — only `401
  UNAUTHENTICATED`.
- **Response:** `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, `X-Accel-Buffering: no`. (No
  `Connection: keep-alive` header is set by the application.) The
  server first writes the comment line `: connected`, then subscribes
  the connection to the **user** (keyed by Cognito `sub`), not to
  individual errands, and sends a `: keepalive` heartbeat comment
  every 15 seconds. It delivers only events whose `recipientSubs`
  include that user (as requester or courier), excluding events the
  user triggered themselves. Each event is a `data:` frame carrying an
  `ErrandNotification` (see [Data models](#data-models)).
- **Delivery guarantees:** in-memory, best-effort only. There is no
  persistence, no replay, and no `Last-Event-ID` support; the client
  dedupes by `eventId` (last 100 seen). On disconnect the subscription
  is removed; on (re)connect the client re-fetches the errand list and
  any open errand details. Events missed while disconnected are lost.
  Note the additional AWS limit: API Gateway caps a stream at 15
  minutes, so the browser must reconnect.
- **Errors:** `401 UNAUTHENTICATED`.

The frontend opens the stream only once the caller has at least one errand
to show
(`errands.length > 0` gates the connection in `useErrandNotifications`),
so a user with no errands has no open SSE connection.

## Internal service APIs (not for browsers)

> **Do not build third-party clients against this section.** These
> routes are service-to-service, authenticated by a shared internal
> token header that differs per service, and are not proxied by the host.
> They are documented here so reviewers and operators can trace a request
> end-to-end, and so a future public API does not accidentally expose
> them unchanged.

Internal token headers (one per receiving service; values are deployment
secrets configured by environment, never hard-coded in client code):

| Receiving service | Header | Mount |
| --- | --- | --- |
| User API | `x-user-service-token` | `GET /internal/user/profile/:sub`; `GET /internal/user/deletion-status/:sub` |
| Supplier API | `x-supplier-service-token` | `POST /internal/suppliers/validate-selection` |
| Errand API | `x-errand-service-token` | `POST /internal/errands/supplier-events`, `POST /internal/errands/supplier-view`, `POST /internal/errands/estimate-credit` |
| Credit API | `x-credit-service-token` | `POST /internal/credit/reserve` |
| Credit Estimation API | `x-credit-estimation-service-token` (or `x-service-token`) | `POST /internal/estimation/estimate-credit` |

A missing or wrong token returns `401 UNAUTHENTICATED` (envelope varies
by service, as with public errors).

### Get profile by subject (internal)

```http
GET /internal/user/profile/:sub
x-user-service-token: <service-token>
```

- **Success:** `200`, `{ "ok": true, "data": { "username": …, "profilePictureUrl": … } }`.
- **Errors:** `400 VALIDATION_FAILED` (missing subject),
  `401 UNAUTHENTICATED`, `404 PROFILE_NOT_FOUND`.
- **Used by:** Errand API to enrich `courierProfile` on errand responses.

### Get deletion status by subject (internal)

```http
GET /internal/user/deletion-status/:sub
x-user-service-token: <service-token>
```

- **Success:** `200`, `{ "ok": true, "data": { "profileExists": …, "deletionEventExists": …, "identityExists": … } }`.
  `profileExists` is whether a profile row exists; `deletionEventExists`
  is whether a live `UserDeleted` outbox event exists for the subject;
  `identityExists` is whether the Cognito user still exists (`true` /
  `false`, or `null` when the identity provider cannot be queried).
  There is no `404` — an unknown subject returns all-`false` booleans.
- **Errors:** `400 VALIDATION_FAILED` (missing subject),
  `401 UNAUTHENTICATED`.
- **Used by:** the one-off `audit-profileless-errands` script, which
  classifies requesters with no profile as legitimately-deleted,
  legacy-profile-never-created, inconsistent-data, or
  needs-manual-classification. No runtime consumer calls it.

### Validate supplier selection (internal)

```http
POST /internal/suppliers/validate-selection
x-supplier-service-token: <service-token>
Content-Type: application/json

{ "supplierId": "supplier-id", "serviceType": 0 }
```

- **Body:** `supplierId` is required and non-blank; `serviceType` is
  optional for now (the contract carries a TODO to require it once the
  errand creation form always sends it).
- **Success:** `200`, one of:

  ```json
  { "valid": true, "supplierId": "supplier-id", "serviceType": 0 }
  ```

  ```json
  {
    "valid": false,
    "supplierId": "supplier-id",
    "code": "SUPPLIER_INACTIVE",
    "message": "…"
  }
  ```

  Failure codes: `SUPPLIER_NOT_FOUND`, `SUPPLIER_INACTIVE`,
  `SERVICE_TYPE_NOT_OFFERED`.
- **Errors:** `400 INVALID_REQUEST` (missing/invalid `supplierId` or
  non-numeric `serviceType`), `401 UNAUTHORIZED` (bad service token,
  via the Supplier error type).
- **Used by:** Errand API during errand creation, before reserving credit.

### Receive supplier event (internal)

```http
POST /internal/errands/supplier-events
x-errand-service-token: <service-token>
Content-Type: application/json

{
  "supplierId": "supplier-id",
  "name": "New name",
  "isOperational": false
}
```

- **Body:** `supplierId` is required; `name`, `location`,
  `operatingHours`, `isOperational`, and `serviceTypes` are optional
  updates.
- **Success:** `200`

  ```json
  { "processed": true, "affectedErrandIds": ["errand-id"] }
  ```

  If `isOperational` is `false`, open/accepted errands for that
  supplier are deleted and their IDs are returned. Otherwise, open/
  accepted errands are updated with the new supplier info. A request
  with no `supplierId` returns `400 INVALID_EVENT` from the controller;
  the service layer returns `{ processed: false, affectedErrandIds: [] }`
  for an empty supplier ID if reached directly.
- **Errors:** `400 INVALID_EVENT`, `401 UNAUTHENTICATED`.
- **Used by:** Supplier API after supplier create/update/delete.

### Supplier view (internal)

```http
POST /internal/errands/supplier-view?supplierId=<id>&scope=explore
x-errand-service-token: <service-token>
Cookie: relay_access=<access-token>; relay_id=<id-token>
```

- **Auth:** This route is unusual — it sits behind the internal token
  middleware **and** applies the user session middleware inside the
  router, so a caller needs both a service token and a user session.
  It is not a browser route and should not be called directly from
  frontend code.
- **Query:** `supplierId` (required, non-blank) and `scope`
  (`explore` | `mine`, required).
- **Success:** `200`, `{ "errands": [ SupplierErrandSummary, … ] }`
  — errands without `requesterSub`/`courierSub`.
- **Errors:** `400 INVALID_ERRAND` (bad scope/supplier), `401`
  (bad service token or session), `403 FORBIDDEN` (unverified email).

### Estimate credit via Errand API

```http
POST /api/errands/estimate-credit
Cookie: relay_access=<access-token>; relay_id=<id-token>
Content-Type: application/json

{
  "name": "Pick up bubble tea",
  "description": "One brown sugar milk tea",
  "serviceType": 0,
  "instructions": "Less sweet",
  "startAt": "2026-11-08T10:00:00.000Z",
  "expiresAt": "2026-11-08T12:00:00.000Z",
  "availableCredit": 37
}
```

- **Auth:** Requires the normal Relay cookie pair and a verified email.
- **Validation:** `name`, `description`, `instructions`, `startAt`, and
  `expiresAt` must be strings; `serviceType` must be a valid integer from
  `0` to `4`; and `availableCredit` must be a finite nonnegative number.
  `expiresAt` must be after both `startAt` and the current time. Invalid
  requests return `400 INVALID_INPUT`.
- **Success:** `200`, an [EstimateCreditResponse](#estimatecreditresponse).
- **Errors:** `400 INVALID_INPUT` for invalid request data, `401
  UNAUTHENTICATED`, `403 FORBIDDEN` for an unverified account, `429
  CREDIT_ESTIMATION_RATE_LIMITED`, `503 CREDIT_ESTIMATION_UNAVAILABLE`, or
  `500 INTERNAL_ERROR`.
- **Used by:** The errand creation frontend before submitting a new errand.

### Estimate credit (internal, direct)

```http
POST /internal/estimation/estimate-credit
x-credit-estimation-service-token: <service-token>
Content-Type: application/json

{
  "name": "Pick up bubble tea",
  "description": "One brown sugar milk tea",
  "serviceType": 0,
  "instructions": "Less sweet",
  "startAt": "2026-11-08T10:00:00.000Z",
  "expiresAt": "2026-11-08T12:00:00.000Z",
  "userId": "cognito-sub-uuid",
  "availableCredit": 37
}
```

- **Auth:** Service token only (no user session).
- **Validation:** `userId` is required; `availableCredit` must be a finite
  nonnegative number; `name` must be non-empty and at most 200 characters;
  `description` must be non-empty and at most 5000 characters;
  `instructions` is optional and at most 5000 characters; `startAt` and
  `expiresAt` must be valid date strings with `expiresAt` after the effective
  start time; and `serviceType` must be an integer 0–4.
  Inputs matching dangerous patterns (script tags, `javascript:`,
  `eval(`, `document.`, and similar — see
  `credit-estimation-service/backend/src/validators/estimation.validator.ts`)
  are rejected with `400 INVALID_INPUT`. This is a prompt-injection /
  XSS guard for the AI path, not general input sanitisation.
- **Behaviour:** The configured AI client is called first. AI failures
  return `503 SERVICE_UNAVAILABLE`; rate-limit failures return `429
  RATE_LIMITED`. The configured per-service-type baselines are used to
  construct the AI prompt and to apply the deterministic time-window
  adjustment. The final range is clamped to the global 10–50 credit bounds,
  and the maximum is capped by `availableCredit` when the balance covers the
  minimum but not the maximum. Baseline values can be overridden by
  deployment environment variables.
- **Success:** `200`, an [EstimateCreditResponse](#estimatecreditresponse).
- **Errors:** `400 INVALID_INPUT` (with `fieldErrors`),
  `401 UNAUTHENTICATED`, `429 RATE_LIMITED`,
  `503 SERVICE_UNAVAILABLE`, `500 INTERNAL_ERROR`.
- **Used by:** Errand API's estimation client.

### Reserve credit (internal)

```http
POST /internal/credit/reserve
x-credit-service-token: <service-token>
Content-Type: application/json

{
  "transactionReference": { "service": "errand", "id": "errand-id", "type": "CREDIT_RESERVE" },
  "userId": "cognito-sub-uuid",
  "amount": 15
}
```

- **Auth:** Service token (`x-credit-service-token`) only. There is no
  user authentication on this route: the controller copies the body's
  `userId` into request-local context (`res.locals.creditUserId`) and
  the validator compares the body against that same value, so the
  `userId` in the body *is* the reservation subject — it is trusted
  once the service token passes, and no cross-check against an
  independently authenticated identity exists.
- **Validation:** `transactionReference.service` and `.id` must be
  non-empty strings without `:`; `.type` must be exactly
  `CREDIT_RESERVE`; `amount` must be a finite number `>= 0`, otherwise
  `422 INVALID_CREDIT_AMOUNT`.
- **Success:** `200`, the updated balance plus
  `"status": "RESERVE_SUCCESS"`:

  ```json
  {
    "userId": "cognito-sub-uuid",
    "availableCredit": 85,
    "reserveCredit": 15,
    "lastUpdated": "2026-11-04T15:30:00.000Z",
    "status": "RESERVE_SUCCESS"
  }
  ```

- **Errors:** `400 INVALID_REQUEST`, `401 UNAUTHENTICATED`
  (bad service token),
  `404 USER_NOT_FOUND`, `409 TRANSACTION_CONFLICT` (duplicate
  transaction reference), `422 INSUFFICIENT_CREDITS`. There is no
  `403 FORBIDDEN` (user mismatch) on this endpoint — that check is
  unreachable here; the `403` for a mismatched `userId` applies only
  to the user-facing `GET /api/credit` endpoints, where the subject
  comes from the authenticated cookie session.
- **Used by:** Errand API during errand creation. Release and transfer
  are **not** HTTP endpoints — they happen only via Kafka events
  consumed by the Credit Service (see
  [Errand lifecycle and credit flow](#errand-lifecycle-and-credit-flow)).

### Async credit commands (Kafka, not HTTP)

For completeness, the Credit Service also implements these commands
from Kafka events; there is no HTTP route for them:

| Command | Trigger | Effect |
| --- | --- | --- |
| `allocateInitialCredit` | `UserRegistered` | Creates a balance of 100 available / 0 reserved. |
| `releaseCredit` | `ERRAND_CANCELLED`, `ERRAND_EXPIRED`, creation failure | Reserved → available for the requester. |
| `transferCredit` | `ERRAND_COMPLETED` | Requester's reserved → courier's available. If the receiver's balance is closed, the transfer records a `PENDING` settlement instead of crediting the balance. |
| `deleteUserCredit` | `UserDeleted` | Closes the user's credit account (`status: 'CLOSED'`, amounts retained, history preserved) and flips the deleted user's already-credited settlements to `PENDING`. |

## Error code reference

Status codes are per endpoint above; this table collects the codes so
reviewers can check for typos and collisions. Codes are
service-scoped — the same word can mean slightly different things in
different services, and Supplier's `UNAUTHORIZED` is not the same
envelope as Auth's `UNAUTHENTICATED`.

| Code | Services | Typical status | Meaning |
| --- | --- | --- | --- |
| `VALIDATION_FAILED` | Auth, User | 400 | Zod validation failed; see `fieldErrors`. |
| `INVALID_CREDENTIALS` | Auth | 401 | Wrong email/password (Cognito `NotAuthorized` / `UserNotFound`). |
| `EMAIL_ALREADY_REGISTERED` | Auth | 409 | Cognito `UsernameExists`. |
| `EMAIL_NOT_VERIFIED` | Auth | 403 | Login attempted before verification. |
| `EMAIL_ALREADY_VERIFIED` | Auth (contract only) | — | Defined in the contract error type; no current controller path in the snapshot returns it. |
| `OTP_INVALID` / `OTP_EXPIRED` | Auth | 400 | Verification code mismatch / expired. |
| `RATE_LIMITED` | Auth, Estimation | 429 | Cognito limit, or AI rate limit (estimation usually falls back instead). |
| `UNAUTHENTICATED` | All | 401 | Missing/invalid session or service token. |
| `FORBIDDEN` | All | 403 | Authenticated but not allowed (role, owner, unverified email, cross-origin). |
| `PROFILE_NOT_FOUND` | User | 404 | No profile row for the authenticated subject. |
| `USERNAME_TAKEN` | User | 409 | Username already taken. |
| `PASSWORD_REUSED` | User (contract only) | 409 | Defined in the contract; password-change reuse is enforced by Cognito in the current flow. |
| `USER_NOT_FOUND` | Auth, Credit | 404 | No such Cognito user / no credit record. |
| `ALREADY_ADMIN` / `NOT_ADMIN` | Auth | 409 | Promote/demote state conflict. |
| `INTERNAL_ERROR` | All | 500 | Unexpected failure. Credit's 500 body has no `code` (see Credit section). |
| `NOT_FOUND` | Supplier, Errand | 404 | Supplier/errand not found (or not visible / not deletable, for errands). |
| `UNAUTHORIZED` | Supplier | 401 | Supplier-service auth failure, including unverified email on reads. |
| `SESSION_EXPIRED` | Supplier (contract only) | — | Defined in the contract; the middleware returns `UNAUTHENTICATED`/`UNAUTHORIZED` in practice. |
| `INVALID_REQUEST` | Supplier, Credit | 400 | Bad filter, bad body, bad `offset`/`userId`. |
| `DUPLICATE_SUPPLIER` | Supplier | 409 | Same name at the same location. |
| `INVALID_ERRAND` | Errand | 400 | Errand validation failed; see `fieldErrors`. |
| `CONFLICT` | Errand (contract only) | — | Defined in the contract; transitions use `INVALID_TRANSITION` in practice. |
| `INVALID_TRANSITION` | Errand | 409 | Errand not in the required state for this transition. |
| `REQUESTER_DELETED` | Errand | 409 | The requester's profile no longer exists when accepting an errand. |
| `INSUFFICIENT_CREDIT` | Errand | 422 / via create | Errand creation could not reserve the requested amount. |
| `SUPPLIER_UNAVAILABLE` / `SUPPLIER_INACTIVE` / `SERVICE_TYPE_NOT_OFFERED` | Errand | Via create | Supplier validation failed during errand creation. |
| `INVALID_EVENT` | Errand (internal) | 400 | Supplier event missing `supplierId`. |
| `INVALID_CREDIT_AMOUNT` | Credit | 422 | Reservation amount negative / non-numeric. |
| `INSUFFICIENT_CREDITS` | Credit | 422 | Available credit below the reservation amount. |
| `TRANSACTION_CONFLICT` | Credit | 409 | Duplicate transaction reference. |
| `INVALID_INPUT` | Estimation | 400 | Bad name/description/serviceType, or dangerous pattern rejected. |
| `SERVICE_UNAVAILABLE` | Estimation | 503 | Estimation service unreachable via the errand proxy. |

---

*End of Relay API Reference. Questions or corrections: open an issue or
PR against this file in the Relay repository — do not edit a deployed
copy in isolation, or the document and the code will drift again.*
