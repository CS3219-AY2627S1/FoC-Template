<!--
  AI Assistance Disclosure:
  Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
  Scope: Documentation only - wrote this API reference by reading the routes, controllers,
         services, middleware, config and error-handling code as they stand on
         feat/stage-32-schedule-errand-form (based on main). No source code was changed, and
         no requirements, architecture, schema, or API decisions were made by the AI tool.
         Items not traceable to a numbered stage in instructions.md are marked INVENTED or
         cited to the external spec/commit note they actually come from, per
         credit-service/API.md's convention.
  Author review:
-->

# User Service API

Base URL in Compose: `http://user-service:3001`. Published on the host at
`http://localhost:3001` (compose hard-codes `3001:3001`; unlike order-service and
credit-service, there is no `${USER_SERVICE_PORT:-...}` host-port override — `PORT` and every
other setting come from `user-service/.env`, per `docs/user-service-instructions.md` Part 1 /
instructions.md Stage 3b-3c).

All user ids are **UUID**. `supplierId` (bookmarks) is a supplier-service **integer** id.
Request bodies are JSON (`Content-Type: application/json`). CORS is restricted to
`http://localhost:5173` with `credentials: true` (hardcoded in `src/app.ts`).

## Contents

- [Authentication](#authentication)
- [Errors](#errors)
- [The user object](#the-user-object)
- [Health](#health): `GET /health`
- [Auth](#auth-auth): register, login, logout, refresh, OTP, password reset, unlock, JWKS
- [My profile](#my-profile-usersme): `/users/me/*`
- [Users (admin)](#users-admin-and-service-usersusers): `/users/*`
- [Audit log (admin)](#audit-log-admin-adminaudit-logs): `GET /admin/audit-logs`
- [Admin elevation OTP](#admin-elevation-otp-admin): `/admin/*`
- [Credit-allocation outbox relay](#credit-allocation-outbox-relay)

## Authentication

Four independent credential types are checked by different middleware; most routes need
exactly one of the first two.

**Bearer access token** (`authenticate`, `src/middleware/authenticate.ts`):

```
Authorization: Bearer <access token>
```

Verified locally as **RS256**, header `typ` must be exactly `at+JWT`. Sets `req.user = {
user_id, role, sid }` from the `sub`, `role` and `sid` claims. Missing, malformed, wrong
`typ`, bad signature or expired → `401 { "message": "Unauthorized", "code": "UNAUTHORIZED" }`.

**Role** (`authorize(minimumRole)`, must run after `authenticate`): `ROLE_RANK = { user: 0,
admin: 1, 'super admin': 2 }`. No `req.user` → `401 UNAUTHORIZED`; rank too low → `403 {
"message": "Forbidden", "code": "FORBIDDEN" }`. Governing decision: instructions.md Stage 8.

**Service key** (`authenticateServiceKey`): header `User-Order-Service-Key`, constant-time
compared against `USER_ORDER_SERVICE_API_KEY`. Mismatch or absent → `401 { "message":
"Invalid service key", "code": "INVALID_SERVICE_KEY" }`. Used only by `GET /users/worker/:id`
(instructions.md Stage 28b, order-service's errand scheduler).

**Elevation token** (admin-only, in addition to the access token): header `Elevated-Token`, a
short-lived RS256 token (`typ: ep+JWT`, `sub`/`sid` must match the caller's own session), TTL
`ELEVATION_TOKEN_TTL_MINUTES` (bounded 1-15). Obtained via the `/admin/*` OTP flow below.
Required on `PUT /users/:id/status` and `PUT /users/:id/role`, except on a no-op write.
Missing/invalid/mismatched → `403 { "code": "ELEVATION_REQUIRED" }`. Governing decision:
instructions.md Stage 27 (elevation token table), Stage 27b (where the check sits in the
write's ordering).

**JWKS** — `GET /auth/.well-known/jwks.json` is how every other service verifies the bearer
tokens above; see [Auth](#auth-auth).

## Errors

One envelope everywhere:

```json
{ "message": "Human sentence.", "code": "MACHINE_READABLE_CODE" }
```

A `429` additionally sets a `Retry-After` response **header** (seconds), not just a body
field. Zod validation failures are `400 VALIDATION_ERROR`; a request with an unexpected field
on a `.strict()` schema always gets the fixed message `"Request contains unexpected fields"`.
Malformed JSON is `400 { "message": "Malformed JSON body", "code": "VALIDATION_ERROR" }`.
Anything unhandled is `500 { "message": "Internal server error", "code": "INTERNAL_ERROR" }`.
These three are omitted from the per-endpoint tables below, as are `401 UNAUTHORIZED` and `403
FORBIDDEN` from the Authentication section above wherever a route requires `authenticate` /
`authorize`.

## The user object

Returned by every admin user-lookup/mutation route and by the two `/users/me/*` routes that
change account-wide state (`UserResponse`, `src/services/userResponse.ts`):

```json
{
  "id": "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "username": "alice",
  "email": "a***@example.com",
  "status": "active",
  "role": "user",
  "activeView": "requester",
  "preferredLang": "en",
  "createdAt": "2026-09-24T00:00:00.000Z",
  "updatedAt": "2026-11-10T00:00:00.000Z",
  "isLocked": false,
  "lockedUntil": null,
  "lockLevel": 0
}
```

| Field | Notes |
| ----- | ----- |
| `email` | Masked (`a***@example.com`) unless the caller is reading their own row. See `POST /users/:id/full-email` to unmask |
| `status` | `pending`, `active` or `suspended` |
| `role` | `user`, `admin` or `super admin` |
| `isLocked` | Computed from the database clock at read time, not the app clock |
| `lockLevel` | The OTP/login-lockout escalation level reached so far |

---

## Health

### `GET /health`

No authentication. `200 { "status": "ok" }`. Unlike order-service and credit-service, this
does not check the database, and there is no Compose `healthcheck:` block for user-service.

---

## Auth (`/auth/*`)

All routes here are public (no `authenticate`).

### `POST /auth/register`

```json
{ "username": "alice", "email": "alice@example.com", "password": "Str0ng!Pass" }
```

| Field | Rules |
| ----- | ----- |
| `username` | Lowercased, `^[A-Za-z0-9_]{3,255}$` |
| `email` | Lowercased/trimmed, basic email shape |
| `password` | At least 8 characters, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special character |

Inserts a `pending` user and emails a registration OTP (deleting stale pending rows for the
same username/email first). Sets an httpOnly `pendingToken` cookie (signed `pv+JWT`,
`maxAge` = `OTP_TTL_MINUTES`).

**`201`** `{ "message": "Verification code sent to your email", "code": "OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 409 | `USERNAME_TAKEN` | Including a unique-constraint race |
| 409 | `EMAIL_TAKEN` | ditto |
| 503 | `EMAIL_SEND_FAILED` | SMTP send failed |

```bash
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"Str0ng!Pass"}'
```

### `POST /auth/login`

```json
{ "identifier": "alice", "password": "Str0ng!Pass" }
```

`identifier` is a username **or** email (lowercased/trimmed). Order of checks: user lookup →
row lock → login-lockout check → password compare → pending/suspended check.

**`200`**

```json
{
  "accessToken": "<jwt>",
  "user": { "id": "<uuid>", "username": "alice", "email": "alice@example.com", "role": "user", "activeView": "requester" },
  "sessionTimeLeftSeconds": 900
}
```

Sets an httpOnly `refreshToken` cookie (`maxAge` = `REFRESH_TOKEN_TTL_DAYS` days).

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | No such user, or a wrong password that doesn't cross the lock threshold |
| 429 | `ACCOUNT_LOCKED` | Including the failure that crosses the threshold. `Retry-After` set. Fires (unawaited) an unlock-link email to the account's own address |
| 403 | `ACCOUNT_NOT_VERIFIED` | Still `pending`. Also sets a `pendingToken` cookie on this response |
| 403 | `ACCOUNT_SUSPENDED` | — |

```bash
curl -X POST http://localhost:3001/auth/login -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"alice","password":"Str0ng!Pass"}'
```

### `POST /auth/logout`

Reads the `refreshToken` cookie directly (deliberately not behind `authenticate`). Revokes
that refresh-token row.

**`200`** `{ "message": "Logged out successfully", "code": "LOGOUT_SUCCESS" }`, clears the
`refreshToken` cookie.

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_REFRESH_TOKEN` | Missing, unknown, or already-revoked cookie |

### `POST /auth/refresh`

Reads the `refreshToken` cookie, locks the user row then the token row (in that order),
re-checks revoked/expired/suspended on the locked rows.

**`200`** `{ "accessToken": "<jwt>", "sessionTimeLeftSeconds": 900 }` — role/claims come from
the freshly-locked user row, so a role change takes effect on the caller's next refresh.

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_REFRESH_TOKEN` | Missing, expired or revoked |
| 403 | `ACCOUNT_SUSPENDED` | — |

### `POST /auth/verify-otp`

```json
{ "email": "alice@example.com", "otp": "123456", "purpose": "registration" }
```

`purpose` is `registration` or `forgot_password`.

- **`registration`**: requires the `pendingToken` cookie to resolve to the same user as
  `email` (`403 EMAIL_MISMATCH` otherwise, checked before the OTP attempt counter). On success,
  activates the user, inserts a credit-allocation outbox row in the same transaction, clears
  the `pendingToken` cookie. `200 { "message": "Registration complete. You can now log in.",
  "code": "REGISTER_SUCCESS" }`.
- **`forgot_password`**: a non-consuming check (the code stays valid for the following
  `/auth/reset-password` call). `200 { "message": "Code verified. You can now set a new
  password.", "code": "OTP_VERIFIED" }`.

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_OTP` | Wrong code |
| 400 | `OTP_EXPIRED` | — |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | `Retry-After` set |
| 403 | `EMAIL_MISMATCH` | `registration` only |

### `POST /auth/resend-otp`

```json
{ "email": "alice@example.com", "purpose": "registration" }
```

`registration` also requires the matching `pendingToken` cookie (`403 EMAIL_MISMATCH`
otherwise) and is capped by `OTP_MAX_RESENDS` **over all rows for that registration**, not a
rolling window — deliberate, so the flow ends when the last OTP expires — plus
`OTP_RESEND_COOLDOWN_SECONDS` between sends. `forgot_password` reuses the escalating block
described under `/auth/forgot-password`.

**`200`** `{ "message": "A new verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 400 | `NO_PENDING_REGISTRATION` | `registration` only |
| 429 | `OTP_RESEND_LIMIT` | `registration`: fixed resend cap. `forgot_password`: see below |
| 403 | `EMAIL_MISMATCH` | `registration` only |
| 429 | `OTP_RESEND_COOLDOWN` | `forgot_password` only, `Retry-After` set |

### `POST /auth/forgot-password`

```json
{ "email": "alice@example.com" }
```

Uses an escalating send-block (instructions.md Stage 18c): hitting the rolling resend cap
raises an escalation level (1→2→3+, delays taken from `LOCK_ESCALATION_HOURS`, e.g.
`"1,4,24"`, capped at the last entry) and blocks sends until `send_blocked_until`; the block
clears after `LOCK_ESCALATION_RESET_HOURS` of quiet.

**`200`** `{ "message": "A reset code has been sent to your email", "code": "OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 404 | `EMAIL_NOT_FOUND` | — |
| 403 | `ACCOUNT_NOT_VERIFIED` | Still pending |
| 429 | `OTP_RESEND_COOLDOWN` | `Retry-After` set |
| 429 | `OTP_RESEND_LIMIT` | `Retry-After` set; message names the escalation delay |

### `POST /auth/reset-password`

```json
{ "email": "alice@example.com", "otp": "123456", "newPassword": "NewStr0ng!Pass" }
```

Consumes the `forgot_password` OTP, updates the password hash, and **revokes every refresh
token for the user** in the same transaction.

**`200`** `{ "message": "Password reset successful. Please log in with your new password.",
"code": "PASSWORD_RESET_SUCCESS" }`

| Status | Code | When |
|---|---|---|
| 404 | `EMAIL_NOT_FOUND` | — |
| 403 | `ACCOUNT_NOT_VERIFIED` | — |
| 400 | `INVALID_OTP` / `OTP_EXPIRED` | — |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | — |

### `POST /auth/unlock`

```json
{ "token": "<unlock-link token>" }
```

Public, no auth header — the `ul+JWT` token alone decides. Clears the login lock only if the
token's embedded lock-timestamp still equals the row's **current** `login_locked_until` to the
second (so the link is single-use/stale-safe); shares its clearing logic with the admin `POST
/users/:id/unlock` route. No audit row is written for this route (instructions.md Stage 31).

**`200`** `{ "message": "...", "code": "UNLOCKED" }` on a real clear, or `{ "code":
"ALREADY_UNLOCKED" }` for every other outcome — unknown user, pending/suspended, already
cleared, or stale — deliberately folded into the same `200`, so the response reveals nothing
about account state.

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_UNLOCK_TOKEN` | Structurally invalid, wrong `typ`, bad signature, or expired token |

### `GET /auth/.well-known/jwks.json`

Public. The contract every other service (order-service, credit-service, ...) verifies bearer
tokens against, per `docs/user-service-instructions.md` Part 2 (instructions.md Stage 13).

**`200`**

```json
{ "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "<key id>", "n": "...", "e": "AQAB" }] }
```

A second entry (the previous key) can appear during rotation, via `JWT_PREVIOUS_KEY_ID` /
`JWT_PREVIOUS_PUBLIC_KEY_PATH`. **RS256 is pinned**; a token's own `alg` header is never
trusted. The two claims downstream verifiers read are `sub` (user id) and `role`. Four
distinct `typ` values keep token purposes from being swapped across endpoints: `at+JWT`
(access), `ep+JWT` (elevation), `ul+JWT` (unlock link), `pv+JWT` (pending-registration). This
`typ`-pinning scheme for `ul+JWT`/`pv+JWT` is recorded as a bug-fix decision in commit history,
not an instructions.md stage number.

```bash
curl http://localhost:3001/auth/.well-known/jwks.json
```

---

## My profile (`/users/me/*`)

Every route below needs only `authenticate` (any role) — the target is always the caller's
own `user_id` from the token, never a body/path id.

### `GET /users/me`

**`200`** `{ "username": "alice", "email": "alice@example.com", "activeView": "requester",
"preferredLang": "en" }`

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | Token's user id no longer exists |

### `PUT /users/me/active-view`

```json
{ "activeView": "courier" }
```

`activeView` is `requester` or `courier`. Plain update, no transition rule.

**`200`** the full [user object](#the-user-object).

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |

### `PUT /users/me/preferred-lang`

```json
{ "preferredLang": "zh" }
```

`preferredLang` is one of `en`, `zh`, `hi`, `ta`, `ms`, `es`, `ar`.

**`200`** the full [user object](#the-user-object).

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |

> **INVENTED** — no instructions.md stage number was found for this endpoint. A code comment
> attributes it to "the team" without a citation; ratify or point at the real decision record.

### `PUT /users/me/username`

```json
{ "newUsername": "alice2" }
```

Same format as registration's `username`. Locks the caller's row first.

**`200`** `{ "username": "alice2", "email": "alice@example.com" }`

| Status | Code | When |
|---|---|---|
| 409 | `USERNAME_UNCHANGED` | Same as current |
| 409 | `USERNAME_TAKEN` | Including a unique-constraint race |

### `PUT /users/me/email`

```json
{ "currentPassword": "Str0ng!Pass", "newEmail": "alice.new@example.com" }
```

Two phases in one flow: re-verifies `currentPassword` under the same login-lockout counter as
`/auth/login`, then validates and OTP-codes the **new** email.

**`200`** `{ "message": "Verification code sent to your new email", "code": "OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_PASSWORD` | — |
| 429 | `ACCOUNT_LOCKED` | Same lockout mechanism as login; fires an unlock email |
| 409 | `EMAIL_UNCHANGED` | — |
| 409 | `EMAIL_TAKEN` | — |
| 404 | `USER_NOT_FOUND` | — |

### `POST /users/me/verify-otp`

```json
{ "otp": "123456", "purpose": "change_email" }
```

`purpose` must be `change_email` (a dedicated schema from `/auth/verify-otp`). Consumes the
OTP and applies the pending new email; a `409 EMAIL_TAKEN` race rolls back while keeping the
OTP usable for a retry.

**`200`** `{ "message": "Email updated successfully", "code": "EMAIL_CHANGE_SUCCESS" }`

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_OTP` | No pending change_email row, wrong code, or expired |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | — |
| 409 | `EMAIL_TAKEN` | — |

### `POST /users/me/resend-otp`

```json
{ "purpose": "change_password" }
```

`purpose` is `change_email` or `change_password`; requires an existing, unconsumed pending row
for that purpose.

**`200`** `{ "message": "A new verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 400 | `NO_PENDING_EMAIL_CHANGE` / `NO_PENDING_PASSWORD_CHANGE` | No pending row for that purpose |
| 429 | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` | — |

### `PUT /users/me/password`

```json
{ "currentPassword": "Str0ng!Pass", "newPassword": "Even$tronger1" }
```

Same two-phase, lockout-sharing pattern as email change. `newPassword` is validated here but
not written yet — it is re-supplied and re-validated at confirm.

**`200`** `{ "message": "Verification code sent to your email", "code": "OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 401 | `INVALID_PASSWORD` | — |
| 429 | `ACCOUNT_LOCKED` | Fires an unlock email |
| 400 | `PASSWORD_UNCHANGED` | `newPassword` equals current |
| 404 | `USER_NOT_FOUND` | — |

### `POST /users/me/confirm-password-change`

```json
{ "otp": "123456", "newPassword": "Even$tronger1" }
```

`newPassword` is re-validated and re-checked against "unchanged" here, to cover drift between
initiate and confirm. On success, updates the hash and revokes every refresh token for the
user.

**`200`** `{ "message": "Password changed successfully. Please log in again on other
devices.", "code": "PASSWORD_CHANGE_SUCCESS" }`

| Status | Code | When |
|---|---|---|
| 400 | `PASSWORD_UNCHANGED` | — |
| 400 | `INVALID_OTP` / `OTP_EXPIRED` | — |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | — |
| 404 | `USER_NOT_FOUND` | — |

### `GET /users/me/last-request`

**`200`** `{ "last_req_del_loc_id": 3, "last_req_del_loc_details": "Level 2 study room" }` —
`null`/`null` only if the per-user row is somehow absent (one is always inserted when the
account is created).

> Cited to an external "precise delivery location spec," not an instructions.md stage.

### `PUT /users/me/last-request`

```json
{ "last_req_del_loc_id": 3, "last_req_del_loc_details": "Level 2 study room" }
```

`last_req_del_loc_id`: positive integer up to 2147483647. `last_req_del_loc_details`:
non-empty after trimming, at most 250 characters. Upserts the row.

**`200`** `{ "message": "Last request saved", "code": "LAST_REQUEST_SAVED" }`

### `GET /users/me/bookmarks`

**`200`** `{ "supplier_ids": [12, 47] }`

> Cited to `docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md`, not an
> instructions.md stage.

### `PUT /users/me/bookmarks/:supplierId`

`:supplierId` is a positive integer string, ≤ 2147483647. Idempotent add; a cap of 20
(`MAX_BOOKMARKS`) is enforced, but re-bookmarking an already-bookmarked supplier succeeds even
at the cap.

**`200`** `{ "message": "Supplier bookmarked", "code": "BOOKMARK_ADDED" }`

| Status | Code | When |
|---|---|---|
| 422 | `BOOKMARK_LIMIT_REACHED` | At 20 distinct bookmarks and this supplier isn't one of them |

### `DELETE /users/me/bookmarks/:supplierId`

Always `200`, even for a malformed `:supplierId` — a malformed id can never have been
bookmarked, and the frontend uses this to drop records supplier-service rejected (spec clause
B23). A well-formed id is removed unconditionally; there is no error if it wasn't bookmarked.

**`200`** `{ "message": "Bookmark removed", "code": "BOOKMARK_REMOVED" }`

---

## Users (admin, and one service) (`/users/*`)

### `GET /users/public?ids=<uuid,uuid,...>`

**Auth:** `authenticate` only — any signed-in user, no role requirement.

`ids`: comma-separated, 1-50 UUIDs after trim/split (`MAX_PUBLIC_IDS = 50`). Unknown ids are
silently omitted, not an error.

**`200`** `{ "users": [{ "id": "<uuid>", "username": "alice" }] }`

> Not an instructions.md stage; code comment attributes it to "Requested by the user-service
> owner."

```bash
curl 'http://localhost:3001/users/public?ids=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /users/public/:id`

Same auth as above. **`200`** `{ "id": "<uuid>", "username": "alice" }`

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |

### `GET /users/worker/:id`

**Auth:** `authenticateServiceKey` only (no login token — this is order-service's scheduler).

**`200`** `{ "status": "active", "lockedUntil": null }` — deliberately minimal, "just enough
for order-service's scheduler to decide whether to fire an occurrence" (instructions.md Stage
28b).

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |

### `GET /users` — admin list

**Auth:** `authenticate` + `authorize('admin')`.

**Query** (all optional, unknown parameters rejected with `400`):

| Parameter | Meaning |
| --------- | ------- |
| `page` | Positive integer, default 1 |
| `username` | Substring match, lowercased |
| `email` | Exact match, lowercased/trimmed |
| `status` | `pending`, `active` or `suspended` |
| `role` | `user`, `admin` or `super admin` |
| `locked` | `true` or `false` |
| `sortBy` | `username`, `email` or `createdAt` (default) |
| `sortDir` | `asc` or `desc` (default `desc` for `createdAt`, else `asc`) |

Fixed page size of 50, offset pagination.

**`200`**

```json
{ "users": [ { "...": "user object" } ], "page": 1, "pageSize": 50, "total": 23, "totalPages": 1 }
```

Each user's `email` is masked unless it is the requesting admin's own row. Governing decisions:
instructions.md Stage 15b (shape/filters/sort), Stage 18d (`locked` filter), Stage 20
(masking).

### `POST /users/:id/full-email`

**Auth:** `authenticate` + `authorize('admin')`. Body: `{}` (no fields accepted).

Writes an `EMAIL_UNMASK` audit row with no reason (instructions.md Stage 26c; `EMAIL_UNMASK`
takes no reason code by the author's own direction in `auditReasons.ts`) **before** returning
the email — a failed audit insert means the email is never returned.

**`200`** `{ "email": "alice@example.com" }`

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |
| 403 | `FORBIDDEN` | Target is a super admin — "Cannot unmask a super administrator's email" |

### `GET /users/:id`

**Auth:** `authenticate` + `authorize('admin')`.

**`200`** the full [user object](#the-user-object) — email masked unless `:id` is the caller.

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |

### `PUT /users/:id/status`

**Auth:** `authenticate` + `authorize('admin')` **and** a valid [elevation
token](#authentication), except on a no-op write.

```json
{ "status": "suspended", "reason": "POLICY_VIOLATION" }
```

`reason` must be one of the preset codes for suspend/unsuspend (`auditReasons.ts`);
`otherReason` (10-500 chars) is required instead when `reason` is `OTHER`, and rejected as an
unexpected field otherwise.

Check order: lock target row → target-role restriction → pending-target restriction →
same-status no-op short-circuit (skips the elevation check) → elevation required → write +
(if suspending) revoke all the target's refresh tokens + insert a `USER_SUSPEND` /
`USER_UNSUSPEND` audit row.

**`200`** the full [user object](#the-user-object).

| Status | Code | When |
|---|---|---|
| 403 | `SUPER_ADMIN_IMMUTABLE` | Target is a super admin |
| 403 | `FORBIDDEN` | Target is an admin and caller is only `admin` (only super admin may suspend an admin) |
| 422 | `CANNOT_CHANGE_STATUS_PENDING_USER` | Target is `pending` |
| 403 | `ELEVATION_REQUIRED` | No/invalid elevation token, and the write is not a no-op |
| 404 | `USER_NOT_FOUND` | — |

Governing decisions: instructions.md Stage 9, Stage 26b (reason/audit), Stage 27b (where the
elevation check sits in this ordering).

### `PUT /users/:id/role`

**Auth:** `authenticate` + `authorize('super admin')` — the only super-admin-only route — plus
a valid [elevation token](#authentication), except on a no-op write.

```json
{ "role": "admin", "reason": "PROMOTION" }
```

Same `reason`/`otherReason` shape as above, from the promote/demote preset codes.

Check order mirrors `status`: `403 SELF_ROLE_CHANGE` if `:id` is the caller → lock → super-admin
target restriction → pending/suspended target restriction → same-role no-op → elevation
required → write + revoke all the target's refresh tokens + `USER_PROMOTE`/`USER_DEMOTE` audit
row.

**`200`** the full [user object](#the-user-object).

| Status | Code | When |
|---|---|---|
| 403 | `SELF_ROLE_CHANGE` | `:id` is the caller |
| 403 | `SUPER_ADMIN_IMMUTABLE` | Target is a super admin |
| 422 | `CANNOT_CHANGE_ROLE_PENDING_USER` / `CANNOT_CHANGE_ROLE_SUSPENDED_USER` | Target not `active` |
| 403 | `ELEVATION_REQUIRED` | — |
| 404 | `USER_NOT_FOUND` | — |

Governing decisions: instructions.md Stage 10, Stage 26b, Stage 27b.

### `POST /users/:id/unlock`

**Auth:** `authenticate` + `authorize('admin')`. Body: `{}`.

Same target-role restrictions as `PUT .../status`. Acts only if the target is **currently**
login-locked (computed from the database clock); otherwise it's a no-op — `200`, no audit row.
Clears the lock and any OTP send-blocks, and inserts a `USER_UNLOCK` audit row with no reason
(same shared logic `POST /auth/unlock` uses).

**`200`** the full [user object](#the-user-object).

| Status | Code | When |
|---|---|---|
| 404 | `USER_NOT_FOUND` | — |
| 403 | `SUPER_ADMIN_IMMUTABLE` / `FORBIDDEN` | Same restrictions as `status` |

Governing decisions: instructions.md Stage 18d, Stage 26b; later bug-fix notes recorded in file
headers as Fix F3/F4, not separate stage numbers.

---

## Audit log (admin) (`/admin/audit-logs`)

### `GET /admin/audit-logs`

**Auth:** `authenticate` + `authorize('admin')`.

**Query** (all optional, unknown parameters rejected):

| Parameter | Meaning |
| --------- | ------- |
| `page` | Positive integer, default 1 |
| `actor` | Actor username substring |
| `target` | Target username substring |
| `action` | One or more of `USER_PROMOTE`, `USER_DEMOTE`, `USER_SUSPEND`, `USER_UNSUSPEND`, `EMAIL_UNMASK`, `USER_UNLOCK` |
| `reasonCode` | Any code across all actions (not scoped to one `action`) |
| `from`, `to` | ISO date bounds on `createdAt`; `from` must not be after `to` |
| `sortDir` | `asc` or `desc` (default `desc`) |

Same fixed page size of 50, offset pagination as `GET /users`.

**`200`**

```json
{
  "logs": [
    {
      "id": 1,
      "createdAt": "2026-11-10T00:00:00.000Z",
      "actorId": "<uuid>",
      "actorUsername": "admin1",
      "action": "USER_SUSPEND",
      "targetId": "<uuid>",
      "targetUsername": "alice",
      "before": { "status": "active" },
      "after": { "status": "suspended" },
      "reason": "POLICY_VIOLATION",
      "userAgent": "Mozilla/5.0 ..."
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1,
  "totalPages": 1
}
```

`actorUsername`/`targetUsername` are `null` if that user row no longer exists — the audit log
has no foreign key to `users`, by design: deleting a user never touches audit rows.

Governing decisions: instructions.md Stage 26d (this route), Stage 26a (schema, append-only),
Stage 26b (reason-code presets, `src/constants/auditReasons.ts`).

---

## Admin elevation OTP (`/admin/*`)

All three routes need `authenticate` + `authorize('admin')`, and exist to issue the
[elevation token](#authentication) that `PUT /users/:id/status` and `PUT /users/:id/role`
require. Governing decision: instructions.md Stage 27a.

### `POST /admin/send-otp`

```json
{ "purpose": "admin_action" }
```

Emails an OTP to the caller's own address.

**`200`** `{ "message": "A verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 409 | `ALREADY_ELEVATED` | Caller already holds a valid elevation token for this session |
| 429 | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` | — |

### `POST /admin/verify-otp`

```json
{ "otp": "123456", "purpose": "admin_action" }
```

**`200`** `{ "elevationToken": "<jwt>" }`

| Status | Code | When |
|---|---|---|
| 409 | `ALREADY_ELEVATED` | — |
| 400 | `INVALID_OTP` / `OTP_EXPIRED` | — |
| 429 | `OTP_ATTEMPTS_EXCEEDED` | — |

### `POST /admin/resend-otp`

```json
{ "purpose": "admin_action" }
```

**`200`** `{ "message": "A new verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code | When |
|---|---|---|
| 409 | `ALREADY_ELEVATED` | — |
| 400 | `NO_PENDING_OTP` | No unconsumed `admin_action` OTP row exists |
| 429 | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` | — |

---

## Credit-allocation outbox relay

Not a request/response route, and not a BullMQ queue like order-service/credit-service use —
`src/services/creditOutbox.relay.ts` polls the `credit_allocation_outbox` table every second
(batch size 5) and `POST`s each due row to `${CREDIT_SERVICE_URL}/credits/allocate` with `{
"userId": "<uuid>" }` (3s timeout). A row is inserted, in the same transaction as the write
that creates the user, whenever registration OTP verification activates a new user, or the
super-admin/test-user bootstrap on startup creates one (instructions.md Stage 14/15/16).

Response handling:

| Credit Service response | Outcome |
|---|---|
| 2xx or `409` | Marked sent |
| `400`, `401`, `403`, `404`, `500` | Marked dead, error stored |
| `408`, `425`, `429`, any other 5xx, or a network/timeout error | Retried with backoff (`MAX_ATTEMPTS = 10`, starting at 1s, capped at 300s) |

User Service has no inbound queue consumer; this relay is the only asynchronous mechanism, and
it only produces toward credit-service.

---

## What was invented, and what the team still owes

Everything below either has no instructions.md stage citation in the code, or is cited to
something other than instructions.md. Listed so it can be ratified or pointed at its real
source.

1. **`PUT /users/me/preferred-lang`.** No instructions.md stage found; a code comment
   attributes it to "the team" without naming one.
2. **The CORS origin `http://localhost:5173`** hardcoded in `src/app.ts`. Stage 4a's comment
   covers "app setup, middleware" generally, not this specific literal.
3. **The `pendingToken` cookie, `EMAIL_MISMATCH` check, and the `ul+JWT`/`pv+JWT` token
   types.** Attributed in code comments to "team decisions recorded in this task's
   conversation" (a bug-fix session) rather than a numbered instructions.md stage.
4. **`GET /users/public` and `GET /users/public/:id`.** Attributed to "Requested by the
   user-service owner," no instructions.md stage.
5. **`/users/me/bookmarks*` and `/users/me/last-request`.** Cited to external spec documents
   (`docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md`, and an unnamed "precise
   delivery location spec"), not to instructions.md.
6. **No Compose `healthcheck:` block for user-service**, unlike order-service and
   credit-service. Not an API-shape issue, but inconsistent with the sibling services'
   convention of a health check backed by a real check.

## Design decisions

<!-- Written by the author -->
