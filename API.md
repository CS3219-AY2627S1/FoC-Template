<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-11
Scope: Documentation only - consolidated the existing per-service API docs (user-service,
       order-service, credit-service and chat-service's own API.md/docs/api.md files, plus
       supplier-service's openapi.yaml) into this single reference, one section per service.
       The four Markdown sources were concatenated with their heading levels shifted; the
       supplier-service section restates its OpenAPI 3.0.3 spec as prose/tables in the same
       style as the others. No wording, endpoints, schemas, or behavior were changed, added,
       or reinterpreted beyond that format conversion; each Markdown section's content,
       including its own AI disclosure history, is unchanged from its source file. No
       requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: gabriel yap

Scope (2026-11-11, Claude Code, model: claude-sonnet-5): Added a "Table of Contents" section
       listing every service and its second-level sections, with anchor links computed to
       match GitHub's heading-slug numbering. No content, wording, or structure of the
       existing sections was changed. No requirements, architecture, schema, or API decisions
       were made by the AI tool.
Author review: gabriel yap
-->

# API Reference

This file consolidates the API documentation for all services into one reference. Each
service's own API doc remains the canonical, most up-to-date source and should be edited
directly when its API changes; **this file should be refreshed to match afterwards.**

## Services

- [User Service](#user-service-api) — [`user-service/API.md`](user-service/API.md)
- [Supplier Service](#supplier-service-api) — [`supplier-service/openapi.yaml`](supplier-service/openapi.yaml)
- [Order Service](#order-service-api) — [`order-service/API.md`](order-service/API.md)
- [Credit Service](#credit-service-api) — [`credit-service/API.md`](credit-service/API.md)
- [Chat Service](#chat-service-api-reference) — [`chat-service/docs/api.md`](chat-service/docs/api.md)

## User Service API

Base URL in Compose: `http://user-service:3001`. Published on the host at
`http://localhost:3001` (compose hard-codes `3001:3001`; unlike order-service and
credit-service, there is no `${USER_SERVICE_PORT:-...}` host-port override — `PORT` and every
other setting come from `user-service/.env`, per `docs/user-service-instructions.md` Part 1 /
instructions.md Stage 3b-3c).

All user ids are **UUID**. `supplierId` (bookmarks) is a supplier-service **integer** id.
Request bodies are JSON (`Content-Type: application/json`). CORS is restricted to
`http://localhost:5173` with `credentials: true` (hardcoded in `src/app.ts`).

### Contents

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

### Authentication

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

### Errors

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

### The user object

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

| Field       | Notes                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `email`     | Masked (`a***@example.com`) unless the caller is reading their own row. See `POST /users/:id/full-email` to unmask |
| `status`    | `pending`, `active` or `suspended`                                                                                 |
| `role`      | `user`, `admin` or `super admin`                                                                                   |
| `isLocked`  | Computed from the database clock at read time, not the app clock                                                   |
| `lockLevel` | The OTP/login-lockout escalation level reached so far                                                              |

---

### Health

#### `GET /health`

No authentication. `200 { "status": "ok" }`. Unlike order-service and credit-service, this
does not check the database, and there is no Compose `healthcheck:` block for user-service.

---

### Auth (`/auth/*`)

All routes here are public (no `authenticate`).

#### `POST /auth/register`

```json
{ "username": "alice", "email": "alice@example.com", "password": "Str0ng!Pass" }
```

| Field      | Rules                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| `username` | Lowercased, `^[A-Za-z0-9_]{3,255}$`                                               |
| `email`    | Lowercased/trimmed, basic email shape                                             |
| `password` | At least 8 characters, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special character |

Inserts a `pending` user and emails a registration OTP (deleting stale pending rows for the
same username/email first). Sets an httpOnly `pendingToken` cookie (signed `pv+JWT`,
`maxAge` = `OTP_TTL_MINUTES`).

**`201`** `{ "message": "Verification code sent to your email", "code": "OTP_SENT" }`

| Status | Code                | When                               |
| ------ | ------------------- | ---------------------------------- |
| 409    | `USERNAME_TAKEN`    | Including a unique-constraint race |
| 409    | `EMAIL_TAKEN`       | ditto                              |
| 503    | `EMAIL_SEND_FAILED` | SMTP send failed                   |

```bash
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"Str0ng!Pass"}'
```

#### `POST /auth/login`

```json
{ "identifier": "alice", "password": "Str0ng!Pass" }
```

`identifier` is a username **or** email (lowercased/trimmed). Order of checks: user lookup →
row lock → login-lockout check → password compare → pending/suspended check.

**`200`**

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "<uuid>",
    "username": "alice",
    "email": "alice@example.com",
    "role": "user",
    "activeView": "requester"
  },
  "sessionTimeLeftSeconds": 900
}
```

Sets an httpOnly `refreshToken` cookie (`maxAge` = `REFRESH_TOKEN_TTL_DAYS` days).

| Status | Code                   | When                                                                                                                                     |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `INVALID_CREDENTIALS`  | No such user, or a wrong password that doesn't cross the lock threshold                                                                  |
| 429    | `ACCOUNT_LOCKED`       | Including the failure that crosses the threshold. `Retry-After` set. Fires (unawaited) an unlock-link email to the account's own address |
| 403    | `ACCOUNT_NOT_VERIFIED` | Still `pending`. Also sets a `pendingToken` cookie on this response                                                                      |
| 403    | `ACCOUNT_SUSPENDED`    | —                                                                                                                                        |

```bash
curl -X POST http://localhost:3001/auth/login -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"alice","password":"Str0ng!Pass"}'
```

#### `POST /auth/logout`

Reads the `refreshToken` cookie directly (deliberately not behind `authenticate`). Revokes
that refresh-token row.

**`200`** `{ "message": "Logged out successfully", "code": "LOGOUT_SUCCESS" }`, clears the
`refreshToken` cookie.

| Status | Code                    | When                                        |
| ------ | ----------------------- | ------------------------------------------- |
| 401    | `INVALID_REFRESH_TOKEN` | Missing, unknown, or already-revoked cookie |

#### `POST /auth/refresh`

Reads the `refreshToken` cookie, locks the user row then the token row (in that order),
re-checks revoked/expired/suspended on the locked rows.

**`200`** `{ "accessToken": "<jwt>", "sessionTimeLeftSeconds": 900 }` — role/claims come from
the freshly-locked user row, so a role change takes effect on the caller's next refresh.

| Status | Code                    | When                        |
| ------ | ----------------------- | --------------------------- |
| 401    | `INVALID_REFRESH_TOKEN` | Missing, expired or revoked |
| 403    | `ACCOUNT_SUSPENDED`     | —                           |

#### `POST /auth/verify-otp`

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

| Status | Code                    | When                |
| ------ | ----------------------- | ------------------- |
| 400    | `INVALID_OTP`           | Wrong code          |
| 400    | `OTP_EXPIRED`           | —                   |
| 429    | `OTP_ATTEMPTS_EXCEEDED` | `Retry-After` set   |
| 403    | `EMAIL_MISMATCH`        | `registration` only |

#### `POST /auth/resend-otp`

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

| Status | Code                      | When                                                           |
| ------ | ------------------------- | -------------------------------------------------------------- |
| 400    | `NO_PENDING_REGISTRATION` | `registration` only                                            |
| 429    | `OTP_RESEND_LIMIT`        | `registration`: fixed resend cap. `forgot_password`: see below |
| 403    | `EMAIL_MISMATCH`          | `registration` only                                            |
| 429    | `OTP_RESEND_COOLDOWN`     | `forgot_password` only, `Retry-After` set                      |

#### `POST /auth/forgot-password`

```json
{ "email": "alice@example.com" }
```

Uses an escalating send-block (instructions.md Stage 18c): hitting the rolling resend cap
raises an escalation level (1→2→3+, delays taken from `LOCK_ESCALATION_HOURS`, e.g.
`"1,4,24"`, capped at the last entry) and blocks sends until `send_blocked_until`; the block
clears after `LOCK_ESCALATION_RESET_HOURS` of quiet.

**`200`** `{ "message": "A reset code has been sent to your email", "code": "OTP_SENT" }`

| Status | Code                   | When                                                  |
| ------ | ---------------------- | ----------------------------------------------------- |
| 404    | `EMAIL_NOT_FOUND`      | —                                                     |
| 403    | `ACCOUNT_NOT_VERIFIED` | Still pending                                         |
| 429    | `OTP_RESEND_COOLDOWN`  | `Retry-After` set                                     |
| 429    | `OTP_RESEND_LIMIT`     | `Retry-After` set; message names the escalation delay |

#### `POST /auth/reset-password`

```json
{
  "email": "alice@example.com",
  "otp": "123456",
  "newPassword": "NewStr0ng!Pass"
}
```

Consumes the `forgot_password` OTP, updates the password hash, and **revokes every refresh
token for the user** in the same transaction.

**`200`** `{ "message": "Password reset successful. Please log in with your new password.",
"code": "PASSWORD_RESET_SUCCESS" }`

| Status | Code                          | When |
| ------ | ----------------------------- | ---- |
| 404    | `EMAIL_NOT_FOUND`             | —    |
| 403    | `ACCOUNT_NOT_VERIFIED`        | —    |
| 400    | `INVALID_OTP` / `OTP_EXPIRED` | —    |
| 429    | `OTP_ATTEMPTS_EXCEEDED`       | —    |

#### `POST /auth/unlock`

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

| Status | Code                   | When                                                               |
| ------ | ---------------------- | ------------------------------------------------------------------ |
| 401    | `INVALID_UNLOCK_TOKEN` | Structurally invalid, wrong `typ`, bad signature, or expired token |

#### `GET /auth/.well-known/jwks.json`

Public. The contract every other service (order-service, credit-service, ...) verifies bearer
tokens against, per `docs/user-service-instructions.md` Part 2 (instructions.md Stage 13).

**`200`**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "<key id>",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
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

### My profile (`/users/me/*`)

Every route below needs only `authenticate` (any role) — the target is always the caller's
own `user_id` from the token, never a body/path id.

#### `GET /users/me`

**`200`** `{ "username": "alice", "email": "alice@example.com", "activeView": "requester",
"preferredLang": "en" }`

| Status | Code             | When                             |
| ------ | ---------------- | -------------------------------- |
| 404    | `USER_NOT_FOUND` | Token's user id no longer exists |

#### `PUT /users/me/active-view`

```json
{ "activeView": "courier" }
```

`activeView` is `requester` or `courier`. Plain update, no transition rule.

**`200`** the full [user object](#the-user-object).

| Status | Code             | When |
| ------ | ---------------- | ---- |
| 404    | `USER_NOT_FOUND` | —    |

#### `PUT /users/me/preferred-lang`

```json
{ "preferredLang": "zh" }
```

`preferredLang` is one of `en`, `zh`, `hi`, `ta`, `ms`, `es`, `ar`.

**`200`** the full [user object](#the-user-object).

| Status | Code             | When |
| ------ | ---------------- | ---- |
| 404    | `USER_NOT_FOUND` | —    |

> **INVENTED** — no instructions.md stage number was found for this endpoint. A code comment
> attributes it to "the team" without a citation; ratify or point at the real decision record.

#### `PUT /users/me/username`

```json
{ "newUsername": "alice2" }
```

Same format as registration's `username`. Locks the caller's row first.

**`200`** `{ "username": "alice2", "email": "alice@example.com" }`

| Status | Code                 | When                               |
| ------ | -------------------- | ---------------------------------- |
| 409    | `USERNAME_UNCHANGED` | Same as current                    |
| 409    | `USERNAME_TAKEN`     | Including a unique-constraint race |

#### `PUT /users/me/email`

```json
{ "currentPassword": "Str0ng!Pass", "newEmail": "alice.new@example.com" }
```

Two phases in one flow: re-verifies `currentPassword` under the same login-lockout counter as
`/auth/login`, then validates and OTP-codes the **new** email.

**`200`** `{ "message": "Verification code sent to your new email", "code": "OTP_SENT" }`

| Status | Code               | When                                                   |
| ------ | ------------------ | ------------------------------------------------------ |
| 401    | `INVALID_PASSWORD` | —                                                      |
| 429    | `ACCOUNT_LOCKED`   | Same lockout mechanism as login; fires an unlock email |
| 409    | `EMAIL_UNCHANGED`  | —                                                      |
| 409    | `EMAIL_TAKEN`      | —                                                      |
| 404    | `USER_NOT_FOUND`   | —                                                      |

#### `POST /users/me/verify-otp`

```json
{ "otp": "123456", "purpose": "change_email" }
```

`purpose` must be `change_email` (a dedicated schema from `/auth/verify-otp`). Consumes the
OTP and applies the pending new email; a `409 EMAIL_TAKEN` race rolls back while keeping the
OTP usable for a retry.

**`200`** `{ "message": "Email updated successfully", "code": "EMAIL_CHANGE_SUCCESS" }`

| Status | Code                    | When                                                |
| ------ | ----------------------- | --------------------------------------------------- |
| 400    | `INVALID_OTP`           | No pending change_email row, wrong code, or expired |
| 429    | `OTP_ATTEMPTS_EXCEEDED` | —                                                   |
| 409    | `EMAIL_TAKEN`           | —                                                   |

#### `POST /users/me/resend-otp`

```json
{ "purpose": "change_password" }
```

`purpose` is `change_email` or `change_password`; requires an existing, unconsumed pending row
for that purpose.

**`200`** `{ "message": "A new verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code                                                     | When                            |
| ------ | -------------------------------------------------------- | ------------------------------- |
| 400    | `NO_PENDING_EMAIL_CHANGE` / `NO_PENDING_PASSWORD_CHANGE` | No pending row for that purpose |
| 429    | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT`               | —                               |

#### `PUT /users/me/password`

```json
{ "currentPassword": "Str0ng!Pass", "newPassword": "Even$tronger1" }
```

Same two-phase, lockout-sharing pattern as email change. `newPassword` is validated here but
not written yet — it is re-supplied and re-validated at confirm.

**`200`** `{ "message": "Verification code sent to your email", "code": "OTP_SENT" }`

| Status | Code                 | When                         |
| ------ | -------------------- | ---------------------------- |
| 401    | `INVALID_PASSWORD`   | —                            |
| 429    | `ACCOUNT_LOCKED`     | Fires an unlock email        |
| 400    | `PASSWORD_UNCHANGED` | `newPassword` equals current |
| 404    | `USER_NOT_FOUND`     | —                            |

#### `POST /users/me/confirm-password-change`

```json
{ "otp": "123456", "newPassword": "Even$tronger1" }
```

`newPassword` is re-validated and re-checked against "unchanged" here, to cover drift between
initiate and confirm. On success, updates the hash and revokes every refresh token for the
user.

**`200`** `{ "message": "Password changed successfully. Please log in again on other
devices.", "code": "PASSWORD_CHANGE_SUCCESS" }`

| Status | Code                          | When |
| ------ | ----------------------------- | ---- |
| 400    | `PASSWORD_UNCHANGED`          | —    |
| 400    | `INVALID_OTP` / `OTP_EXPIRED` | —    |
| 429    | `OTP_ATTEMPTS_EXCEEDED`       | —    |
| 404    | `USER_NOT_FOUND`              | —    |

#### `GET /users/me/last-request`

**`200`** `{ "last_req_del_loc_id": 3, "last_req_del_loc_details": "Level 2 study room" }` —
`null`/`null` only if the per-user row is somehow absent (one is always inserted when the
account is created).

> Cited to an external "precise delivery location spec," not an instructions.md stage.

#### `PUT /users/me/last-request`

```json
{ "last_req_del_loc_id": 3, "last_req_del_loc_details": "Level 2 study room" }
```

`last_req_del_loc_id`: positive integer up to 2147483647. `last_req_del_loc_details`:
non-empty after trimming, at most 250 characters. Upserts the row.

**`200`** `{ "message": "Last request saved", "code": "LAST_REQUEST_SAVED" }`

#### `GET /users/me/bookmarks`

**`200`** `{ "supplier_ids": [12, 47] }`

> Cited to `docs/superpowers/specs/2026-11-05-supplier-bookmarking-design.md`, not an
> instructions.md stage.

#### `PUT /users/me/bookmarks/:supplierId`

`:supplierId` is a positive integer string, ≤ 2147483647. Idempotent add; a cap of 20
(`MAX_BOOKMARKS`) is enforced, but re-bookmarking an already-bookmarked supplier succeeds even
at the cap.

**`200`** `{ "message": "Supplier bookmarked", "code": "BOOKMARK_ADDED" }`

| Status | Code                     | When                                                         |
| ------ | ------------------------ | ------------------------------------------------------------ |
| 422    | `BOOKMARK_LIMIT_REACHED` | At 20 distinct bookmarks and this supplier isn't one of them |

#### `DELETE /users/me/bookmarks/:supplierId`

Always `200`, even for a malformed `:supplierId` — a malformed id can never have been
bookmarked, and the frontend uses this to drop records supplier-service rejected (spec clause
B23). A well-formed id is removed unconditionally; there is no error if it wasn't bookmarked.

**`200`** `{ "message": "Bookmark removed", "code": "BOOKMARK_REMOVED" }`

---

### Users (admin, and one service) (`/users/*`)

#### `GET /users/public?ids=<uuid,uuid,...>`

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

#### `GET /users/public/:id`

Same auth as above. **`200`** `{ "id": "<uuid>", "username": "alice" }`

| Status | Code             | When |
| ------ | ---------------- | ---- |
| 404    | `USER_NOT_FOUND` | —    |

#### `GET /users/worker/:id`

**Auth:** `authenticateServiceKey` only (no login token — this is order-service's scheduler).

**`200`** `{ "status": "active", "lockedUntil": null }` — deliberately minimal, "just enough
for order-service's scheduler to decide whether to fire an occurrence" (instructions.md Stage
28b).

| Status | Code             | When |
| ------ | ---------------- | ---- |
| 404    | `USER_NOT_FOUND` | —    |

#### `GET /users` — admin list

**Auth:** `authenticate` + `authorize('admin')`.

**Query** (all optional, unknown parameters rejected with `400`):

| Parameter  | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `page`     | Positive integer, default 1                                  |
| `username` | Substring match, lowercased                                  |
| `email`    | Exact match, lowercased/trimmed                              |
| `status`   | `pending`, `active` or `suspended`                           |
| `role`     | `user`, `admin` or `super admin`                             |
| `locked`   | `true` or `false`                                            |
| `sortBy`   | `username`, `email` or `createdAt` (default)                 |
| `sortDir`  | `asc` or `desc` (default `desc` for `createdAt`, else `asc`) |

Fixed page size of 50, offset pagination.

**`200`**

```json
{
  "users": [{ "...": "user object" }],
  "page": 1,
  "pageSize": 50,
  "total": 23,
  "totalPages": 1
}
```

Each user's `email` is masked unless it is the requesting admin's own row. Governing decisions:
instructions.md Stage 15b (shape/filters/sort), Stage 18d (`locked` filter), Stage 20
(masking).

#### `POST /users/:id/full-email`

**Auth:** `authenticate` + `authorize('admin')`. Body: `{}` (no fields accepted).

Writes an `EMAIL_UNMASK` audit row with no reason (instructions.md Stage 26c; `EMAIL_UNMASK`
takes no reason code by the author's own direction in `auditReasons.ts`) **before** returning
the email — a failed audit insert means the email is never returned.

**`200`** `{ "email": "alice@example.com" }`

| Status | Code             | When                                                                    |
| ------ | ---------------- | ----------------------------------------------------------------------- |
| 404    | `USER_NOT_FOUND` | —                                                                       |
| 403    | `FORBIDDEN`      | Target is a super admin — "Cannot unmask a super administrator's email" |

#### `GET /users/:id`

**Auth:** `authenticate` + `authorize('admin')`.

**`200`** the full [user object](#the-user-object) — email masked unless `:id` is the caller.

| Status | Code             | When |
| ------ | ---------------- | ---- |
| 404    | `USER_NOT_FOUND` | —    |

#### `PUT /users/:id/status`

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

| Status | Code                                | When                                                                                  |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 403    | `SUPER_ADMIN_IMMUTABLE`             | Target is a super admin                                                               |
| 403    | `FORBIDDEN`                         | Target is an admin and caller is only `admin` (only super admin may suspend an admin) |
| 422    | `CANNOT_CHANGE_STATUS_PENDING_USER` | Target is `pending`                                                                   |
| 403    | `ELEVATION_REQUIRED`                | No/invalid elevation token, and the write is not a no-op                              |
| 404    | `USER_NOT_FOUND`                    | —                                                                                     |

Governing decisions: instructions.md Stage 9, Stage 26b (reason/audit), Stage 27b (where the
elevation check sits in this ordering).

#### `PUT /users/:id/role`

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

| Status | Code                                                                    | When                    |
| ------ | ----------------------------------------------------------------------- | ----------------------- |
| 403    | `SELF_ROLE_CHANGE`                                                      | `:id` is the caller     |
| 403    | `SUPER_ADMIN_IMMUTABLE`                                                 | Target is a super admin |
| 422    | `CANNOT_CHANGE_ROLE_PENDING_USER` / `CANNOT_CHANGE_ROLE_SUSPENDED_USER` | Target not `active`     |
| 403    | `ELEVATION_REQUIRED`                                                    | —                       |
| 404    | `USER_NOT_FOUND`                                                        | —                       |

Governing decisions: instructions.md Stage 10, Stage 26b, Stage 27b.

#### `POST /users/:id/unlock`

**Auth:** `authenticate` + `authorize('admin')`. Body: `{}`.

Same target-role restrictions as `PUT .../status`. Acts only if the target is **currently**
login-locked (computed from the database clock); otherwise it's a no-op — `200`, no audit row.
Clears the lock and any OTP send-blocks, and inserts a `USER_UNLOCK` audit row with no reason
(same shared logic `POST /auth/unlock` uses).

**`200`** the full [user object](#the-user-object).

| Status | Code                                  | When                          |
| ------ | ------------------------------------- | ----------------------------- |
| 404    | `USER_NOT_FOUND`                      | —                             |
| 403    | `SUPER_ADMIN_IMMUTABLE` / `FORBIDDEN` | Same restrictions as `status` |

Governing decisions: instructions.md Stage 18d, Stage 26b; later bug-fix notes recorded in file
headers as Fix F3/F4, not separate stage numbers.

---

### Audit log (admin) (`/admin/audit-logs`)

#### `GET /admin/audit-logs`

**Auth:** `authenticate` + `authorize('admin')`.

**Query** (all optional, unknown parameters rejected):

| Parameter    | Meaning                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `page`       | Positive integer, default 1                                                                                   |
| `actor`      | Actor username substring                                                                                      |
| `target`     | Target username substring                                                                                     |
| `action`     | One or more of `USER_PROMOTE`, `USER_DEMOTE`, `USER_SUSPEND`, `USER_UNSUSPEND`, `EMAIL_UNMASK`, `USER_UNLOCK` |
| `reasonCode` | Any code across all actions (not scoped to one `action`)                                                      |
| `from`, `to` | ISO date bounds on `createdAt`; `from` must not be after `to`                                                 |
| `sortDir`    | `asc` or `desc` (default `desc`)                                                                              |

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

### Admin elevation OTP (`/admin/*`)

All three routes need `authenticate` + `authorize('admin')`, and exist to issue the
[elevation token](#authentication) that `PUT /users/:id/status` and `PUT /users/:id/role`
require. Governing decision: instructions.md Stage 27a.

#### `POST /admin/send-otp`

```json
{ "purpose": "admin_action" }
```

Emails an OTP to the caller's own address.

**`200`** `{ "message": "A verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code                                       | When                                                          |
| ------ | ------------------------------------------ | ------------------------------------------------------------- |
| 409    | `ALREADY_ELEVATED`                         | Caller already holds a valid elevation token for this session |
| 429    | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` | —                                                             |

#### `POST /admin/verify-otp`

```json
{ "otp": "123456", "purpose": "admin_action" }
```

**`200`** `{ "elevationToken": "<jwt>" }`

| Status | Code                          | When |
| ------ | ----------------------------- | ---- |
| 409    | `ALREADY_ELEVATED`            | —    |
| 400    | `INVALID_OTP` / `OTP_EXPIRED` | —    |
| 429    | `OTP_ATTEMPTS_EXCEEDED`       | —    |

#### `POST /admin/resend-otp`

```json
{ "purpose": "admin_action" }
```

**`200`** `{ "message": "A new verification code has been sent to your email", "code":
"OTP_SENT" }`

| Status | Code                                       | When                                        |
| ------ | ------------------------------------------ | ------------------------------------------- |
| 409    | `ALREADY_ELEVATED`                         | —                                           |
| 400    | `NO_PENDING_OTP`                           | No unconsumed `admin_action` OTP row exists |
| 429    | `OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` | —                                           |

---

### Credit-allocation outbox relay

Not a request/response route, and not a BullMQ queue like order-service/credit-service use —
`src/services/creditOutbox.relay.ts` polls the `credit_allocation_outbox` table every second
(batch size 5) and `POST`s each due row to `${CREDIT_SERVICE_URL}/credits/allocate` with `{
"userId": "<uuid>" }` (3s timeout). A row is inserted, in the same transaction as the write
that creates the user, whenever registration OTP verification activates a new user, or the
super-admin/test-user bootstrap on startup creates one (instructions.md Stage 14/15/16).

Response handling:

| Credit Service response                                        | Outcome                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2xx or `409`                                                   | Marked sent                                                                |
| `400`, `401`, `403`, `404`, `500`                              | Marked dead, error stored                                                  |
| `408`, `425`, `429`, any other 5xx, or a network/timeout error | Retried with backoff (`MAX_ATTEMPTS = 10`, starting at 1s, capped at 300s) |

User Service has no inbound queue consumer; this relay is the only asynchronous mechanism, and
it only produces toward credit-service.

---

### What was invented, and what the team still owes

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

### Design decisions

<!-- Written by the author -->

---

## Supplier Service API

> Converted from the OpenAPI source, [`supplier-service/openapi.yaml`](supplier-service/openapi.yaml)
> (OpenAPI 3.0.3), which remains the canonical, machine-readable contract. This section restates
> it as prose/tables to match the other services' docs; refresh it here after editing the YAML.

Supplier directory for FoC: user-facing reads, administrator management, and reference data.
Source of truth for the contract is `SupplierServiceArchitecture.md` (§6.2, §7, §8). All paths are
under server `/api/v1` (same origin as the SPA — a single API gateway fronts all FoC services, so
there is no CORS). All endpoints are rate-limited per client IP, `PER_IP_RATE_LIMIT` (default 30)
requests per minute. `isOpen` is computed at read time in Singapore time (UTC+8), not stored.

### Contents

- [Authentication](#authentication-1)
- [Errors](#errors-1)
- [Rate limiting](#rate-limiting)
- [Common schemas](#common-schemas)
- [Suppliers](#suppliers-apisuppliers): `GET /suppliers`, `GET /suppliers/{id}`
- [Reference](#reference-apisuppliersreference): location and category options
- [Admin suppliers](#admin-suppliers-apiadminsuppliers): list, create, read, update, soft-delete
- [Admin reference](#admin-reference-apiadminreference): faculties, locations, categories CRUD

### Authentication

Every route requires a User Service bearer token (`Authorization: Bearer <token>`, RS256, 15
minute TTL). The service fetches User Service's JWKS from `/auth/.well-known/jwks.json` and
verifies the signature locally (same scheme as order-service and credit-service). Roles are
`user`, `admin` and `super admin`; "Admin suppliers" and "Admin reference" routes require `admin`
or `super admin`.

| Status | When                                             |
| ------ | ------------------------------------------------ |
| 401    | Bearer token missing or invalid                  |
| 403    | The caller's role may not perform this operation |

### Errors

```jsonc
{
  "status_code": 422,
  "error": "Unprocessable Entity",
  "message": "...",
  "timestamp": "2026-09-30T14:00:00+08:00",
  "details": [
    { "field": "location_id", "location": "query", "message": "..." },
  ],
}
```

`timestamp` is Singapore time (UTC+8). `details` is present only for field-level validation
failures (`field`, `location`: `query`/`path`/`body`, `message`).

| Status | When                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| 400    | Malformed request — e.g. missing/invalid `Idempotency-Key`, invalid JSON in a form field, malformed multipart body  |
| 404    | Unknown id (for suppliers, also an already soft-deleted one on the user-facing and `PUT`/`DELETE` routes)           |
| 409    | A request with the same `Idempotency-Key` is still running, or the submitted `version` is stale                     |
| 422    | A value failed validation, including a duplicate name/type/location, or a reference delete blocked by a foreign key |
| 500    | Storage, database or queue failure                                                                                  |

### Rate limiting

More than 30 requests per minute from one IP returns `429`, with a `Retry-After` header
(seconds until the window resets) and the error envelope above.

### Common schemas

**Photo**: `{ photoId, photoLocation (signed URL, 24h), displayOrder (0-based, 0 = cover) }`

**Category**: `{ category, category_id }`

**OpeningHour**: `{ day (1 = Monday .. 7 = Sunday, 8 = open 24/7), open, close }` — `open`/`close`
are `HH:MM` 24-hour strings. A 24/7 Store uses a single day-8 entry `00:00`–`23:59`.

**Supplier (user-facing)** — `SupplierSummary`, returned in list pages:

```json
{
  "id": 12,
  "name": "Deck Cafe",
  "type": "Store",
  "location_id": 3,
  "location": "Deck",
  "faculty_id": 1,
  "faculty": "FASS",
  "level": 2,
  "categories": [{ "category": "Food", "category_id": 1 }],
  "photos": [
    { "photoId": 5, "photoLocation": "https://...", "displayOrder": 0 }
  ],
  "isOpen": true
}
```

`SupplierDetail` (single-supplier reads) adds `desc` (nullable) and `openingHours` (array of
`OpeningHour`).

**Supplier (admin)** — `AdminSupplierSummary`/`AdminSupplierDetail` add `isActive`, `isDeleted`
and, on the detail shape, `createdOn`, `createdBy`, `updatedOn`, `version` (echo on every `PUT`;
a stale value is rejected with `409`).

**Page metadata**, on every paginated list: `{ totalRecords, currPage, limit (fixed 50),
totalPages }`.

---

### Suppliers (`/api/v1/suppliers`)

Roles: `user`, `admin`, `super admin`.

#### `GET /suppliers` — list visible suppliers

Excludes suppliers where `is_deleted` is true or `is_active` is false. Always 50 per page
(fixed); a page beyond the last returns `200` with an empty `data` array. Sorted by supplier
name.

**Query parameters** (all optional)

| Parameter     | Rules                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`        | Integer ≥ 1, default 1                                                                                                                                                                                                                                                                                                                                                                                               |
| `limit`       | Fixed at `50`; any other value is `422`                                                                                                                                                                                                                                                                                                                                                                              |
| `search`      | Case-insensitive match against supplier name, location or category (not the description)                                                                                                                                                                                                                                                                                                                             |
| `location_id` | An id from `GET /suppliers/reference/location`                                                                                                                                                                                                                                                                                                                                                                       |
| `category_id` | An id from `GET /suppliers/reference/categories`                                                                                                                                                                                                                                                                                                                                                                     |
| `isOpen`      | `true`/`false`; omitted means no filter                                                                                                                                                                                                                                                                                                                                                                              |
| `sortOrder`   | `A-Z` (default) or `Z-A`, alphabetical by supplier name                                                                                                                                                                                                                                                                                                                                                              |
| `ids`         | Comma-separated supplier ids, at most 20 (e.g. `3,7,12`); duplicates/empty items ignored. Restricts `data` to those ids (other filters still apply) and adds an `unavailable` array — every requested id that is hidden, deleted, or malformed (malformed entries reported as `invalid` without blocking the rest). An empty value returns an empty page; more than 20 values, or the parameter sent twice, is `422` |

**`200`** — `{ metadata, data: [SupplierSummary, ...], unavailable?: [...] }`. `unavailable` is
present only when `ids` was sent; its entries are `{ id, status: "hidden" | "deleted" |
"invalid" }`, well-formed ids first in the order sent, then malformed ones.

| Status | When                                                   |
| ------ | ------------------------------------------------------ |
| 422    | Invalid filter/parameter combination (see `ids` above) |
| 429    | Rate limit exceeded                                    |

#### `GET /suppliers/{id}` — get one visible supplier

**`200`** — `SupplierDetail` (summary fields plus `desc`, `openingHours`).

| Status | When                                             |
| ------ | ------------------------------------------------ |
| 404    | No such supplier, or it is inactive/soft-deleted |
| 422    | —                                                |
| 429    | —                                                |

---

### Reference (`/api/v1/suppliers/reference/*`)

Roles: `user`, `admin`, `super admin`. Location and category options for filters and forms.

#### `GET /suppliers/reference/location`

**`200`** — `{ "locations": [ { "location_id", "location", "faculty_id", "faculty" } ] }`

#### `GET /suppliers/reference/categories`

**`200`** — `{ "categories": [ { "category", "category_id" } ] }`

---

### Admin suppliers (`/api/v1/admin/suppliers`)

Roles: `admin`, `super admin`.

#### `GET /admin/suppliers` — list all suppliers, including inactive and soft-deleted

Same query parameters as `GET /suppliers` except `ids`.

**`200`** — `{ metadata, data: [AdminSupplierSummary, ...] }`.

#### `POST /admin/suppliers` — create a supplier

`multipart/form-data`. Header `Idempotency-Key` (client-generated UUID) is **mandatory**: a retry
while the first request is still running is `409`; after it completes, the cached response is
replayed.

If `name`, `type` and `location_id` match a soft-deleted supplier, the delete is reversed instead
(`200` rather than `201`): the submitted details and photos are applied through the edit cycle,
`is_deleted = false` and `is_active = true` are restored in one transaction. Submitted photos
replace the existing ones; none submitted leaves them; `version` is bumped once.

**Body fields** (`CreateSupplierForm`)

| Field          | Type               | Required | Rules                                                                                      |
| -------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `name`         | string             | yes      | 1-255 characters                                                                           |
| `type`         | string             | yes      | `Store` or `Facility`                                                                      |
| `location_id`  | integer            | yes      | ≥ 1                                                                                        |
| `category_id`  | string             | no       | JSON array of category ids, e.g. `"[2, 3]"`                                                |
| `desc`         | string             | no       | —                                                                                          |
| `openingHours` | string             | depends  | JSON array of `{day, open, close}`, day 1-7. Required for a Store unless `is24h` is `true` |
| `is24h`        | `"true"`/`"false"` | no       | A Store open 24/7; then `openingHours` is the single day-8 entry                           |
| `photos`       | file[]             | no       | Up to 10 JPEG/PNG, 5 MB each; order is display order starting at 0                         |

A Facility's hours are set by the server (day 8, `00:00`-`23:59`), not sent by the caller. An
`openingHours` entry with `open` equal to `close` is rejected.

| Status | When                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| 201    | Created. Body is `AdminSupplierDetail`                                                      |
| 200    | A matching soft-deleted supplier was reactivated and updated. Body is `AdminSupplierDetail` |
| 400    | Malformed request                                                                           |
| 409    | `Idempotency-Key` collision                                                                 |
| 422    | Validation failure                                                                          |
| 500    | Storage/database/queue failure                                                              |

#### `GET /admin/suppliers/{id}` — get one supplier, regardless of active/deleted state

**`200`** — `AdminSupplierDetail` (includes audit fields and `version`).

| Status | When             |
| ------ | ---------------- |
| 404    | No such supplier |

#### `PUT /admin/suppliers/{id}` — update a supplier

`multipart/form-data`. `version` must be the value last read; a stale value is `409`. Only the
fields sent are changed; `category_id` replaces the whole set. Sending only `version` with no
photo change is `422`; files sent without `isPhotoDirty=true` is `422`.

**Photos**: when `isPhotoDirty` is `true`, `photo_ids` is the full ordered list — numbers are
existing photo ids to keep, strings are placeholders for newly uploaded files, and
`placeholder_ids` lists those placeholders in the same order as the uploaded `photos` files.
Photos left out of `photo_ids` are removed and their cleanup is queued.

**Body fields** (`UpdateSupplierForm`, all optional except `version`): `version` (required),
`name`, `type`, `desc` (empty string clears it), `location_id`, `category_id`, `openingHours`,
`is24h`, `isActive`, `isPhotoDirty`, `photo_ids`, `placeholder_ids`, `photos`.

**`200`** — the updated `AdminSupplierDetail`.

| Status | When                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 400    | Malformed request                                                                                       |
| 404    | No such supplier                                                                                        |
| 409    | Stale `version`                                                                                         |
| 422    | Validation failure (including the "only `version` sent" and "photo without `isPhotoDirty`" cases above) |
| 500    | Storage/database/queue failure                                                                          |

#### `DELETE /admin/suppliers/{id}` — soft-delete a supplier

Sets `is_deleted = true` (`is_active` unchanged), bumps `updated_on` and `version`. Writes a
downstream task (cancel uncollected requests, notify their posters) to the `outbox` table in the
same transaction, processed by the background worker — the response does not wait for it. A
repeat delete is `404`.

**`200`** — `{ "id": <integer>, "isDeleted": true }`.

| Status | When                                      |
| ------ | ----------------------------------------- |
| 404    | No such supplier, or already soft-deleted |
| 422    | —                                         |

---

### Admin reference (`/api/v1/admin/reference/*`)

Roles: `admin`, `super admin`. Faculty, location and category management.

#### Faculties (`/admin/reference/faculties`)

| Route                                    | Body                             | Success                                      | Notes                                                                  |
| ---------------------------------------- | -------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /admin/reference/faculties`        | `{ "faculty": "<1-255 chars>" }` | `201` `Faculty` (`{faculty_id, faculty}`)    | Create                                                                 |
| `PUT /admin/reference/faculties/{id}`    | `{ "faculty": "<1-255 chars>" }` | `200` `Faculty`                              | Rename. `404` unknown id                                               |
| `DELETE /admin/reference/faculties/{id}` | —                                | `200` `{ "deleted": true, "id": <integer> }` | Hard delete; `422` if still referenced by a location, `404` unknown id |

#### Locations (`/admin/reference/locations`)

| Route                                    | Body                                                                               | Success                                                               | Notes                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /admin/reference/locations`        | `LocationWrite`: `{ location (1-255 chars), faculty_id (≥1), level (integer) }`    | `201` `LocationRecord` (`{location_id, location, faculty_id, level}`) | Create                                                                 |
| `PUT /admin/reference/locations/{id}`    | Any one or more of `location`, `faculty_id`, `level` (at least one field required) | `200` `LocationRecord`                                                | Update. `404` unknown id                                               |
| `DELETE /admin/reference/locations/{id}` | —                                                                                  | `200` `{ "deleted": true, "id": <integer> }`                          | Hard delete; `422` if still referenced by a supplier, `404` unknown id |

#### Categories (`/admin/reference/categories`)

The request/response field is `category_type` (the stored column name); the user-facing read
endpoint (`GET /suppliers/reference/categories`) names the same value `category`.

| Route                                     | Body                                   | Success                                                 | Notes                                                                  |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /admin/reference/categories`        | `{ "category_type": "<1-100 chars>" }` | `201` `CategoryRecord` (`{category_id, category_type}`) | Create                                                                 |
| `PUT /admin/reference/categories/{id}`    | `{ "category_type": "<1-100 chars>" }` | `200` `CategoryRecord`                                  | Rename. `404` unknown id                                               |
| `DELETE /admin/reference/categories/{id}` | —                                      | `200` `{ "deleted": true, "id": <integer> }`            | Hard delete; `422` if still referenced by a supplier, `404` unknown id |

All six routes above also return `401`/`403` per [Authentication](#authentication-1) and `429`
per [Rate limiting](#rate-limiting).

---

## Order Service API

Base URL in Compose: `http://order-service:3000`, published on the host at
`http://localhost:${ORDER_SERVICE_PORT:-3002}`. On AWS, the ALB sends `/orders`,
`/orders/*`, `/socket.io` and `/socket.io/*` to this service.

All ids of orders, series and users are **UUIDs**. `supplierId` and
`deliveryLocationId` are supplier-service **integer** ids. Times are ISO 8601 strings.
Request bodies are JSON (`Content-Type: application/json`).

### Contents

- [Authentication](#authentication)
- [Errors](#errors)
- [The order object](#the-order-object)
- [Health](#health): `GET /health`
- [Orders](#orders): create, list, read, edit
- [Status changes](#status-changes): accept, pickup, deliver, complete, cancel
- [Admin](#admin): `GET /orders/admin/users/:userId`
- [Series (recurring errands)](#series-recurring-errands)
- [Real-time (Socket.IO)](#real-time-socketio)

### Authentication

Every route except `GET /health` needs a User Service access token:

```
Authorization: Bearer <access token>
```

The token is verified locally as RS256 against User Service's JWKS
(`{USER_SERVICE_URL}/auth/.well-known/jwks.json`, cached). The service reads two claims:
`sub` (the caller's user id) and `role`.

A missing, malformed, expired or unverifiable token returns:

```json
HTTP 401
{ "message": "Unauthorized", "code": "UNAUTHORIZED" }
```

"Admin" below means `role` is `admin` or `super admin`.

### Errors

Most errors use one envelope. When there are several validation problems, `message` holds
one message per line:

```json
{
  "message": "Request is missing a supplier.\nInvalid number of credits offered."
}
```

The **status-change routes are the exception**: they return `{ "ok": false, "error": "<CODE>" }`
(see [Status changes](#status-changes)).

How error codes map to HTTP status for the order routes:

| HTTP | Codes                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | Any validation code (`MISSING_*`, `INVALID_*`, `COMPLETE_BY_IN_PAST`, `UNKNOWN_QUERY_PARAMETER`, `INVALID_CURSOR`, `DEADLINE_NOT_REACHED`, ...) |
| 401  | `UNAUTHENTICATED`                                                                                                                               |
| 403  | `FORBIDDEN`                                                                                                                                     |
| 404  | `ORDER_NOT_FOUND`                                                                                                                               |
| 409  | `ORDER_PENDING_EXISTS`, `INVALID_TRANSITION`, `ORDER_CONFLICT`, `ORDER_EXPIRED`, `ORDER_NOT_EDITABLE`                                           |
| 422  | `SUPPLIER_NOT_FOUND`, `DELIVERY_LOCATION_NOT_FOUND`, `INSUFFICIENT_CREDITS`, `CREDIT_RESERVE_REJECTED`                                          |
| 503  | `CREDIT_SERVICE_UNAVAILABLE`, `SUPPLIER_SERVICE_UNAVAILABLE`                                                                                    |

The full list of codes and their message text is in
[`src/constants/errors.ts`](order-service/src/constants/errors.ts). An unknown path returns 404.

### The order object

Every route that returns an order returns the full stored row:

```json
{
  "id": "0193a2b4-...",
  "requesterId": "5f0c...",
  "supplierId": 12,
  "description": "2x chicken rice",
  "deliveryLocationId": 3,
  "deliveryDetails": "Level 2 study room",
  "credits": 5,
  "completeBy": "2026-11-10T09:00:00.000Z",
  "additionalDetails": null,
  "courierId": null,
  "status": "open",
  "seriesId": null,
  "failureReason": null,
  "createdAt": "2026-11-10T08:00:00.000Z",
  "updatedAt": "2026-11-10T08:00:00.000Z",
  "acceptedAt": null,
  "deliveredAt": null,
  "creditReleasedAt": null,
  "version": 1
}
```

| Field           | Notes                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `status`        | `pending`, `open`, `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired` or `failed` |
| `completeBy`    | Deadline. Defaults to one hour after creation when not given                                             |
| `courierId`     | Set when the order is accepted                                                                           |
| `seriesId`      | The series that posted it, or `null`                                                                     |
| `failureReason` | Set only for series occurrences that failed or were skipped                                              |
| `version`       | Goes up by one on every change                                                                           |

---

### Health

#### `GET /health`

No authentication. Checks the database.

| HTTP | Body                                        |
| ---- | ------------------------------------------- |
| 200  | `{ "status": "ok", "database": "up" }`      |
| 503  | `{ "status": "error", "database": "down" }` |

---

### Orders

#### `POST /orders` — create an order

The caller becomes the requester. The service checks the supplier and delivery location
with supplier-service (forwarding the caller's token), then reserves `credits` with
credit-service before returning.

**Body**

| Field                | Type             | Required | Rules                                                             |
| -------------------- | ---------------- | -------- | ----------------------------------------------------------------- |
| `supplierId`         | integer          | yes      | Positive, must exist in supplier-service                          |
| `description`        | string           | yes      | Non-empty                                                         |
| `deliveryLocationId` | integer          | yes      | Positive, must exist in supplier-service                          |
| `deliveryDetails`    | string           | yes      | Non-empty after trimming, at most 250 characters (stored trimmed) |
| `credits`            | integer          | yes      | Greater than 0                                                    |
| `completeBy`         | string or `null` | no       | ISO date later than now. Omitted or `null`: one hour from now     |
| `additionalDetails`  | string or `null` | no       | Any text                                                          |

```json
{
  "supplierId": 12,
  "description": "2x chicken rice",
  "deliveryLocationId": 3,
  "deliveryDetails": "Level 2 study room",
  "credits": 5,
  "completeBy": "2026-11-10T09:00:00.000Z"
}
```

**Responses**

| HTTP | When                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 201  | Created. Body is the [order](#the-order-object), status `open`                                           |
| 400  | A field is missing or invalid                                                                            |
| 409  | `ORDER_PENDING_EXISTS`: another of the caller's orders is still being created                            |
| 422  | `SUPPLIER_NOT_FOUND`, `DELIVERY_LOCATION_NOT_FOUND`, `INSUFFICIENT_CREDITS` or `CREDIT_RESERVE_REJECTED` |
| 503  | supplier-service or credit-service could not be reached                                                  |

#### `GET /orders` — list orders

Without `status`, lists **open** orders, the marketplace. With any other `status`, lists only
orders where the caller is the requester or courier. `pending` and `failed` cannot be listed.

**Query parameters** (all optional; unknown or repeated parameters return 400)

| Parameter       | Type        | Meaning                                                                                     |
| --------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `status`        | string      | `open` (default), `accepted`, `picked_up`, `delivered`, `completed`, `cancelled`, `expired` |
| `location`      | integer     | Only this `deliveryLocationId`                                                              |
| `minCredits`    | integer ≥ 0 | `credits` at least this                                                                     |
| `maxCredits`    | integer ≥ 0 | `credits` at most this. Must not be below `minCredits`                                      |
| `expiresBefore` | ISO date    | `completeBy` before this                                                                    |
| `expiresAfter`  | ISO date    | `completeBy` after this, or no `completeBy`                                                 |
| `sort`          | string      | `completeBy` (default), `credits` or `createdAt`                                            |
| `order`         | string      | `asc` (default) or `desc`                                                                   |
| `cursor`        | string      | `nextCursor` from the previous page. Only valid with the same `sort` and `order`            |

Pages hold 50 orders.

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ], "nextCursor": "eyJzIjoi..." }
```

`nextCursor` is `null` on the last page. Invalid parameters return 400, naming the parameter
in brackets, e.g. `"Unknown query parameter. (foo)"`.

#### `GET /orders/active` — my active deliveries

The orders the caller has accepted as courier that are `accepted`, `picked_up` or `delivered`.
Soonest-expiring first. No parameters.

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ] }
```

#### `GET /orders/mine` — my orders

The caller's own orders in every status, newest first. A `failed` order is included only
when it has a `failureReason` (a series occurrence).

| Parameter | Type   | Meaning                                                                                |
| --------- | ------ | -------------------------------------------------------------------------------------- |
| `as`      | string | `requester` (default): orders the caller posted. `courier`: orders the caller accepted |

```json
HTTP 200
{ "ok": true, "orders": [ { "...": "order" } ] }
```

Any other parameter, or another `as` value, returns 400.

#### `GET /orders/:id` — one order

| Parameter | In   | Rules      |
| --------- | ---- | ---------- |
| `id`      | path | Order UUID |

Readable by the order's requester, its courier, and admins. Anyone else can read it only while
it is `open`.

| HTTP | When                                                                               |
| ---- | ---------------------------------------------------------------------------------- |
| 200  | Body is the [order](#the-order-object)                                             |
| 404  | `ORDER_NOT_FOUND`: no such order, `id` is not a UUID, or the caller may not see it |

#### `PATCH /orders/:id/edit` — edit an open order

Only the requester can edit, and only while the order is `open`. `credits` cannot be changed.

**Body**: any of these fields. **`deliveryDetails` is required on every edit.**

| Field                | Type             | Rules                                                      |
| -------------------- | ---------------- | ---------------------------------------------------------- |
| `deliveryDetails`    | string           | Required. Non-empty after trimming, at most 250 characters |
| `supplierId`         | integer          | Positive, must exist in supplier-service                   |
| `description`        | string           | Non-empty                                                  |
| `deliveryLocationId` | integer          | Positive, must exist in supplier-service                   |
| `completeBy`         | string or `null` | ISO date later than now. `null` keeps the current deadline |
| `additionalDetails`  | string or `null` | Any text                                                   |

Any other field returns 400 `INVALID_FIELD`.

| HTTP | When                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------- |
| 200  | Body is the updated [order](#the-order-object)                                                     |
| 400  | Invalid or unsupported field                                                                       |
| 403  | The caller is not the requester                                                                    |
| 404  | No such order                                                                                      |
| 409  | `ORDER_NOT_EDITABLE` (not open) or `ORDER_CONFLICT` (changed at the same time, e.g. just accepted) |
| 422  | Supplier or delivery location not found                                                            |
| 503  | supplier-service could not be reached                                                              |

---

### Status changes

| Route                       | Change                                          | Who may call it                                                                          |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /orders/:id/accept`   | `open` → `accepted`                             | Anyone except the requester. The caller becomes the courier                              |
| `POST /orders/:id/pickup`   | `accepted` → `picked_up`                        | The courier                                                                              |
| `POST /orders/:id/deliver`  | `picked_up` → `delivered`                       | The courier                                                                              |
| `POST /orders/:id/complete` | `delivered` → `completed`                       | The requester                                                                            |
| `POST /orders/:id/cancel`   | `open`, `accepted` or `picked_up` → `cancelled` | The requester. An `accepted` or `picked_up` order only after its `completeBy` has passed |

No body. `id` is the order UUID; a non-UUID returns 404 `{ "message": "Order not found." }`.

**Success**

```json
HTTP 200
{ "ok": true, "order": { "...": "order" } }
```

**Failure**: `{ "ok": false, "error": "<CODE>" }`

| HTTP | `error`                | When                                                             |
| ---- | ---------------------- | ---------------------------------------------------------------- |
| 400  | `DEADLINE_NOT_REACHED` | Cancelling an accepted or picked-up order before `completeBy`    |
| 403  | `FORBIDDEN`            | The caller's role may not make this change                       |
| 404  | `ORDER_NOT_FOUND`      | No such order                                                    |
| 409  | `INVALID_TRANSITION`   | Not allowed from the order's current status                      |
| 409  | `ORDER_EXPIRED`        | Accepting after `completeBy`, before the sweep marked it expired |
| 409  | `ORDER_CONFLICT`       | The order changed at the same time                               |

What else each change does (in the background, after the response):

- **accept**: adds the courier to the order's chat; posts "The order has been accepted by
  &lt;username&gt;".
- **pickup / deliver**: posts a status message to the chat.
- **complete**: queues the credit transfer to the courier; posts a message and archives the chat.
- **cancel**: queues a credit release; posts a message and archives the chat.

The system also expires open orders past `completeBy` and auto-completes delivered orders.
These go through the same rules but have no route.

---

### Admin

#### `GET /orders/admin/users/:userId` — a user's order history

Admins only. Every order where `:userId` is requester or courier, in every status, newest
first.

| Parameter | In    | Rules                                                                   |
| --------- | ----- | ----------------------------------------------------------------------- |
| `userId`  | path  | User UUID. Must exist in user-service (checked with the caller's token) |
| `page`    | query | Positive integer, default `1`. No other query parameters are allowed    |

Pages hold 10 orders.

```json
HTTP 200
{
  "totalCount": 23,
  "currentPage": 1,
  "pageSize": 10,
  "totalPages": 3,
  "orders": [ { "order": { "...": "order" }, "role": "requester" } ]
}
```

`role` is `requester` or `courier` relative to `:userId`. A page past the end returns
`orders: []`.

| HTTP | `message` from                                       | When                                         |
| ---- | ---------------------------------------------------- | -------------------------------------------- |
| 400  | `MALFORMED_USER_ID`                                  | `userId` is not a UUID                       |
| 400  | `INVALID_QUERY_PARAMETER`, `UNKNOWN_QUERY_PARAMETER` | Bad `page`, or another parameter             |
| 401  | `UNAUTHENTICATED`                                    | No usable token, or user-service rejected it |
| 403  | `FORBIDDEN`                                          | Not an admin, or user-service refused access |
| 404  | `INVALID_USER_ID`                                    | user-service has no such user                |
| 503  | `USER_SERVICE_UNAVAILABLE`                           | user-service could not be reached or failed  |

---

### Series (recurring errands)

A series posts a new order on each occurrence of an RFC 5545 recurrence rule (times in
Singapore time). Only the series' requester can read, edit or delete it.

Series routes use the same `{ "message": "..." }` envelope, with these statuses: 404
`SERIES_NOT_FOUND` (also for a non-UUID `seriesId`), 409 `SERIES_CONFLICT`, 403 `FORBIDDEN`,
400 for everything else.

**The public series object** (returned by GET and PATCH):

```json
{
  "id": "0193a2c0-...",
  "requesterId": "5f0c...",
  "supplierId": 12,
  "description": "Morning coffee",
  "deliveryLocationId": 3,
  "deliveryDetails": "Lab 4",
  "credits": 3,
  "durationMinutes": 60,
  "additionalDetails": null,
  "rrule": "FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=9;BYMINUTE=0",
  "startAt": "2026-11-10T01:00:00.000Z",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "...",
  "version": 0,
  "upcomingDates": ["2026-11-11T01:00:00.000Z", "..."],
  "activeOrderCount": 1
}
```

`upcomingDates` holds the next three occurrences. `activeOrderCount` counts this series'
orders that are `pending` or `open`.

#### `POST /orders/series` — create a series

| Field                | Type             | Required         | Rules                                                                                                      |
| -------------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `supplierId`         | integer          | yes              | Positive                                                                                                   |
| `description`        | string           | yes              | Non-empty                                                                                                  |
| `deliveryLocationId` | integer          | yes              | Positive                                                                                                   |
| `deliveryDetails`    | string           | yes              | Non-empty after trimming, at most 250 characters                                                           |
| `credits`            | integer          | yes              | Greater than 0                                                                                             |
| `rrule`              | string           | yes              | RRULE text without `DTSTART`, with a `FREQ`, e.g. `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`. `UNTIL`/`COUNT` end it |
| `startNow`           | boolean          | one of these two | `true`: start now                                                                                          |
| `startAt`            | string           | one of these two | ISO date to start from. Ignored when `startNow` is `true`                                                  |
| `durationMinutes`    | integer          | no               | 1 to 1440. Each posted order's `completeBy` is its scheduled time plus this. Default 60                    |
| `additionalDetails`  | string or `null` | no               | Any text                                                                                                   |

Supplier and location are checked when each occurrence is posted, not at creation.

| HTTP | When                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201  | Created. Body is the stored series row: the fields above without `upcomingDates`/`activeOrderCount`, plus `nextFireAt` and the retry fields (`currentOccurrenceAt`, `retryType`, `attemptCount`, `nextRetryAt`) |
| 400  | Missing/invalid field, `MISSING_START_TIME`, `INVALID_RULE` (does not parse, or has no future occurrence)                                                                                                       |

#### `GET /orders/series/mine` — my series

The caller's series, newest first.

```json
HTTP 200
{ "ok": true, "series": [ { "...": "public series" } ] }
```

#### `GET /orders/series/:seriesId` — one series

| HTTP | When                      |
| ---- | ------------------------- |
| 200  | Body is the public series |
| 403  | Not the caller's series   |
| 404  | No such series            |

#### `PATCH /orders/series/:seriesId/edit` — edit a series

**Body**: any of `supplierId`, `description`, `deliveryLocationId`, `deliveryDetails`,
`credits`, `durationMinutes`, `additionalDetails`, `rrule` (same rules as create), and
`status` (`active` or `inactive`, to pause or resume). Any other field returns 400
`INVALID_FIELD`.

- Changing `rrule` restarts the rule from now.
- Setting `status` to `active` on a paused series recalculates its next occurrence.
- Orders it already posted are not changed.
- If an occurrence was waiting to be retried, that occurrence is recorded as failed and the
  requester is notified.

| HTTP | When                                            |
| ---- | ----------------------------------------------- |
| 200  | Body is the updated public series               |
| 400  | Invalid field, `INVALID_STATUS`, `INVALID_RULE` |
| 403  | Not the caller's series                         |
| 404  | No such series                                  |
| 409  | `SERIES_CONFLICT`: changed at the same time     |

#### `DELETE /orders/series/:seriesId` — delete a series

Orders it already posted stay and lose their `seriesId`. A pending retry is recorded as
failed and the requester is notified.

| HTTP | When                    |
| ---- | ----------------------- |
| 200  | `{ "ok": true }`        |
| 403  | Not the caller's series |
| 404  | No such series          |

---

### Real-time (Socket.IO)

Connect to the service's origin with the Socket.IO client (path `/socket.io`), passing the
same access token in the handshake `auth`:

```js
io(origin, { transports: ["websocket"], auth: { token: accessToken } });
```

The server accepts the WebSocket transport only (no long-polling).

A bad token fails the connection with `connect_error` `"unauthorized"`. The server
disconnects the socket when the token expires; reconnect with a fresh token.

On connect the server joins the socket to the caller's user room and to every order room it
is part of, then emits `ready`.

| Client → server       | Effect                   |
| --------------------- | ------------------------ |
| `listing:subscribe`   | Join the open-order feed |
| `listing:unsubscribe` | Leave it                 |

| Server → client                                                          | Sent when                         |
| ------------------------------------------------------------------------ | --------------------------------- |
| `order:created`                                                          | An order becomes open             |
| `order:accepted`, `order:pickedUp`, `order:delivered`, `order:completed` | The matching status change        |
| `order:cancelled`, `order:expired`, `order:failed`                       | The order ends without completing |
| `order:edited`                                                           | An open order is edited           |

Payloads are small (`orderId`, `status`, `version`, `occurredAt`, plus listing-card fields
on the open-order feed, or a reason on failures). Treat them as a hint to refetch over REST.

---

## Credit Service API

Base URL in compose: `http://credit-service:3003`. Published on the host at
`${CREDIT_SERVICE_PORT:-3003}`.

All ids are **UUID**. `requestId` is sent on every credit call, and Credit Service keys
everything on it — there is no reservation handle (team decision 2026-10-16).

### Authentication

Read endpoints require a User Service access token:

```
Authorization: Bearer <token>
```

Tokens are verified **locally** against User Service's JWKS at
`{USER_SERVICE_URL}/auth/.well-known/jwks.json`, per
`user-service/docs/user-service-instructions.md` (Part 2). The key set is cached and refetched once
on an unknown `kid`; **RS256 is pinned** and the token's own `alg` header is never
trusted. The two claims used are `sub` (the user id) and `role`.

| Status | Code                            | When                                                                        |
| ------ | ------------------------------- | --------------------------------------------------------------------------- |
| 401    | `UNAUTHORIZED`                  | Missing or non-`Bearer` header, bad signature, unknown `kid`, expired token |
| 403    | `FORBIDDEN`                     | Authenticated, but not permitted to read this                               |
| 503    | `IDENTITY_PROVIDER_UNAVAILABLE` | The JWKS endpoint could not be reached                                      |

**503 is deliberately not 401.** A User Service outage has to be distinguishable from a
bad credential, or every caller is told to log in again during an incident they cannot
fix. Only transport failures map to 503; anything else about the token is a 401.

**"Administrator" means rank >= `admin`**, using the same `ROLE_RANK`
(`user` 0, `admin` 1, `super admin` 2) as `user-service/src/middleware/authorize.ts`, so
super admin is included.

> ### ⚠️ The four write endpoints are unauthenticated
>
> `POST /credits/allocate`, `/reserve`, `/transfer` and `/release` take no token. They are
> called by other services, not browsers, and **service-to-service authentication is not
> specified anywhere in the backlog**. This was not a team decision — see
> "What was invented". Do not expose them outside the compose network.

### Conventions

Success responses carry a `balance` envelope, and the write endpoints also return the
log row that was written in the same transaction:

```jsonc
{
  "balance": {
    "userId": "<uuid>",
    "totalBalance": 20,
    "reservedBalance": 4,
    "unreservedBalance": 16,
  },
  "transaction": {
    "transaction_id": "<uuid>",
    "transaction_type": "reservation",
    "originating_user_id": "<uuid>|null",
    "destination_user_id": "<uuid>|null",
    "amount": 4,
    "created_at": "2026-10-16T14:00:00.000Z",
    "request_id": "<uuid>|null",
  },
}
```

Errors are always:

```jsonc
{ "error": { "code": "MACHINE_READABLE_CODE", "message": "Human sentence." } }
```

Every endpoint can return `400 INVALID_REQUEST_BODY` (validation), `500
BALANCE_INVARIANT_VIOLATION` (a balance CHECK constraint fired and the write rolled
back) and `500 INTERNAL_ERROR`. These are omitted from the per-endpoint tables below.

---

### `POST /credits/allocate` — F19.1.1

Grants a new user their starting 20 credits. The amount is fixed by F19.1.1.

```jsonc
// request
{ "userId": "<uuid>" }
```

**`201`** — balance envelope, `transaction_type: "allocation"`, `request_id: null`.

| Status | Code                | When                                                                    |
| ------ | ------------------- | ----------------------------------------------------------------------- |
| 409    | `ALREADY_ALLOCATED` | This user already has a balance. No credits granted, no log row written |

**Auth:** none. Service-to-service only — see the banner above.

```bash
curl -X POST http://localhost:3003/credits/allocate \
  -H 'Content-Type: application/json' \
  -d '{"userId":"3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"}'
```

---

### `POST /credits/reserve` — F19.2.1, F19.2.3

Holds the offered credits against a request. Total is unchanged; reserved rises.

```jsonc
// request
{ "userId": "<uuid>", "requestId": "<uuid>", "amount": 4 }
```

`amount` must be a positive integer.

**`201`** — balance envelope, `transaction_type: "reservation"`.

| Status | Code                              | When                                                                      |
| ------ | --------------------------------- | ------------------------------------------------------------------------- |
| 404    | `BALANCE_NOT_FOUND`               | The user has no balance row                                               |
| 409    | `RESERVATION_ALREADY_EXISTS`      | This `requestId` is already reserved. Idempotent: no second hold is taken |
| 422    | `INSUFFICIENT_UNRESERVED_CREDITS` | F19.2.3 — the offer exceeds `totalBalance − reservedBalance`              |

**Auth:** none. Service-to-service only.

```bash
curl -X POST http://localhost:3003/credits/reserve \
  -H 'Content-Type: application/json' \
  -d '{"userId":"3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
       "requestId":"8df55417-cff4-4764-9abe-823993a9c980",
       "amount":4}'
```

---

### `POST /credits/transfer` — F19.3.1, F19.3.2

Moves the reserved credits to the courier on completion. Requester's total **and**
reserved both fall; courier's total rises (context §5).

```jsonc
// request
{ "requestId": "<uuid>", "courierId": "<uuid>" }
```

**The amount and the requester are not sent.** They are read back from the reservation
row for that `requestId`, so a transfer can only ever move exactly what was held.

Credit Service does not look couriers up and stores no courier reference of its own
(team decision 2026-10-16).

**`201`** — balance envelope showing **the requester's** balance after the debit, and
`transaction_type: "transfer"` with both party ids set.

| Status | Code                    | When                                                                                                                                    |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 404    | `RESERVATION_NOT_FOUND` | No reservation exists for this `requestId`                                                                                              |
| 404    | `COURIER_NOT_FOUND`     | The courier has no balance row. **A balance is not created here** — credits may only enter the economy via F19.1.1                      |
| 404    | `BALANCE_NOT_FOUND`     | The requester's balance row is missing (should not occur if a reservation exists)                                                       |
| 409    | `ALREADY_TRANSFERRED`   | F19.3.2 — already transferred. Idempotent, safe to retry                                                                                |
| 409    | `ALREADY_RELEASED`      | **INVENTED** — the credits were already returned to the requester, so there is nothing to transfer. No requirement covers this ordering |

**Retry safety.** A failure before commit leaves no trace, so the same call can simply be
sent again.

**Auth:** none. Service-to-service only. This endpoint is also driven asynchronously —
see [Async interface](#async-interface).

```bash
curl -X POST http://localhost:3003/credits/transfer \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"8df55417-cff4-4764-9abe-823993a9c980",
       "courierId":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}'
```

---

### `POST /credits/release` — F19.4.1

Returns reserved credits to the requester on cancellation **or** expiry. Reserved falls;
total is untouched (context §5).

```jsonc
// request
{ "requestId": "<uuid>" }
```

Takes only a `requestId`. Credit Service has no clock and performs no expiry detection —
the caller decides why the credits are coming back, and both reasons arrive identically
(team decision 2026-10-16).

**`201`** — balance envelope, `transaction_type: "release"`, `destination_user_id: null`.

| Status | Code                    | When                                                                                                                         |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 404    | `RESERVATION_NOT_FOUND` | No reservation exists for this `requestId`                                                                                   |
| 404    | `BALANCE_NOT_FOUND`     | The requester's balance row is missing                                                                                       |
| 409    | `ALREADY_RELEASED`      | Already released. Idempotent, safe to retry                                                                                  |
| 409    | `ALREADY_TRANSFERRED`   | **INVENTED** — the credits are the courier's now and are not the requester's to reclaim. No requirement covers this ordering |

**Auth:** none. Service-to-service only.

```bash
curl -X POST http://localhost:3003/credits/release \
  -H 'Content-Type: application/json' \
  -d '{"requestId":"8df55417-cff4-4764-9abe-823993a9c980"}'
```

---

### `GET /credits/balance/:userId` — F19.5.1

```jsonc
// 200
{
  "balance": {
    "userId": "<uuid>",
    "totalBalance": 20,
    "reservedBalance": 4,
    "unreservedBalance": 16,
  },
}
```

`unreservedBalance` is always `totalBalance − reservedBalance`, computed on read and
never stored.

| Status | Code                | When                         |
| ------ | ------------------- | ---------------------------- |
| 404    | `BALANCE_NOT_FOUND` | No balance row for this user |

**Auth: token required.** A user may read only their own balance unless they hold a role
ranked at or above `admin`. Adds `401`, `403` and `503` from the Authentication table.
Enforced by `requireBalanceAccess` = `requireAuth` + `requireSelfOrElevated`.

```bash
curl http://localhost:3003/credits/balance/3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d \
  -H "Authorization: Bearer $TOKEN"
```

---

### `GET /health`

`200 { "status": "ok" }`. Used by the compose healthcheck and the ECS target group.
**INVENTED** — not in §8, but required by the healthcheck pattern the sibling services
use.

**Auth:** none. Static response; it does not touch the database.

```bash
curl http://localhost:3003/health
```

---

### `GET /credits/transactions` — F19.5.2

The caller's own records: every row where they are the originating **or** the
destination user. Scoped to `sub` from the token — there is no user parameter, so one
user cannot ask for another's history.

```
GET /credits/transactions
GET /credits/transactions?cursor=<opaque>
```

**`200`**

```jsonc
{
  "transactions": [
    {
      "transaction_id": "<uuid>",
      "transaction_type": "allocation | reservation | transfer | release",
      "originating_user_id": "<uuid>|null",
      "destination_user_id": "<uuid>|null",
      "amount": 4,
      "created_at": "2026-10-19T14:00:00.000Z",
      "request_id": "<uuid>|null",
    },
  ],
  "nextCursor": "<opaque string>|null",
}
```

| Status | Code             | When                    |
| ------ | ---------------- | ----------------------- |
| 400    | `INVALID_CURSOR` | The cursor is malformed |

**Auth: token required**, any role. The rows returned are scoped to `sub`; adds `401`
and `503` from the Authentication table.

```bash
curl http://localhost:3003/credits/transactions \
  -H "Authorization: Bearer $TOKEN"

curl 'http://localhost:3003/credits/transactions?cursor=MjAyNi0xMS0wNFQxNTowNjoxOC4zMjZafDhl' \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /credits/transactions/all` — F20.2, F20.2.1

Every user's records. **Identical response shape and field set** to the endpoint above;
the only difference is row scope (team decision 2026-10-19). Requires rank >= `admin`.

Same query parameters, same `400 INVALID_CURSOR`, plus `403 FORBIDDEN` for a caller
below `admin`.

#### Optional filters

```
GET /credits/transactions/all
GET /credits/transactions/all?userId=<uuid>
GET /credits/transactions/all?requestId=<uuid>
GET /credits/transactions/all?userId=<uuid>&requestId=<uuid>
GET /credits/transactions/all?userId=<uuid>&cursor=<opaque>
```

| Parameter   | Matches                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `userId`    | rows where that user is the **originating OR the destination** party — the same predicate the own-history endpoint uses for its scope |
| `requestId` | rows for that order. Allocations carry no `request_id`, so they never match                                                           |

Both are optional and **combinable: supplying both ANDs them.** With neither, the
response is exactly what it was before — every row, unchanged.

These are filters on this endpoint, not a new route, so they inherit its authentication,
its administrator gate, its page size, its ordering and its row shape. **No new response
fields.**

**An unmatched filter is `200` with an empty array, never `404`.** Credit Service holds
no list of users or orders (context §3), so it cannot tell "no such order" from "an order
with no credit activity yet", and the second is an ordinary state. A requester who has
been allocated credits but has spent none likewise returns their allocation row only.

**Filters are re-sent with the cursor, not carried inside it.** The cursor stays an
opaque position token — base64url of `created_at|transaction_id` — with no filter baked
in, so paging a filtered set means sending `?userId=…&cursor=…` on each request. The
trade-off is that dropping the filter on a later page silently widens the result instead
of erroring; the caller owns the filter. Encoding filters into the cursor would have made
it impossible to mismatch, at the cost of a cursor that is no longer a pure position and
cannot be reused across queries.

| Status | Code                   | When                                                                       |
| ------ | ---------------------- | -------------------------------------------------------------------------- |
| 400    | `INVALID_REQUEST_BODY` | `userId` or `requestId` is not a UUID. Validated before any query runs     |
| 400    | `INVALID_CURSOR`       | The cursor is malformed                                                    |
| 401    | `UNAUTHORIZED`         | Missing or invalid token                                                   |
| 403    | `FORBIDDEN`            | Authenticated but ranked below `admin` — enforced with or without a filter |

> **INVENTED — no requirement covers this surface.** F19.5.2 covers a user's own
> transactions and F20.2 covers all of them; filtering the administrator view by user or
> order is neither. It exists to serve user-service's F5.3.2. See
> `credit-service-context.md` §10 item 10.

**Auth: token required, rank >= `admin`.** Enforced by `requireAuth` then
`requireElevated`, so a `user` token is `403 FORBIDDEN` with or without a filter.

```bash
# every user's rows
curl http://localhost:3003/credits/transactions/all \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# one user, one order, and both together
curl 'http://localhost:3003/credits/transactions/all?userId=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:3003/credits/transactions/all?requestId=8df55417-cff4-4764-9abe-823993a9c980' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
curl 'http://localhost:3003/credits/transactions/all?userId=3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d&requestId=8df55417-cff4-4764-9abe-823993a9c980&cursor=<opaque>' \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Pagination

**20 records per page, `created_at DESC`**, tie-broken by `transaction_id`.

**Keyset, not offset.** The cursor names the last row of the page you just read, and the
next page starts strictly after it. The log is append-only and grows at the head, so with
`OFFSET` a row inserted between two requests shifts everything down and the reader sees a
duplicate; keyset is stable under concurrent writes. It also lets Postgres seek on the
existing `(user, created_at DESC)` indexes rather than counting rows it then discards.

The cursor is **opaque** — base64url of `created_at|transaction_id`. Treat it as a token;
do not construct one. `nextCursor` is `null` on the last page, which is how you know to
stop.

The trade-off: there is no page count and no jumping to page N. Neither is needed for an
infinite-scroll history, and both would require a `COUNT(*)` over the whole log.

#### Counterparty names are not resolved here

Rows carry `originating_user_id` and `destination_user_id` as UUIDs only. Credit Service
stores no user display data and does not call User Service. Resolve names client-side
(team decision 2026-10-19).

---

### Async interface

Besides the HTTP surface, Credit Service consumes a BullMQ queue. Order Service publishes
a job when an order completes; the worker calls the same `transferCredits` the HTTP
endpoint calls. `src/queue/transferQueue.ts` holds the whole wire contract.

#### Queue and task names

|                    | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Redis key          | `queue:credit:transfer`                                                |
| BullMQ prefix      | `queue:credit`                                                         |
| BullMQ queue name  | `transfer`                                                             |
| Job (task) name    | `credit_transfer`                                                      |
| Broker             | `order-redis` — `REDIS_HOST` / `REDIS_PORT`, TLS when `REDIS_TLS=true` |
| Worker concurrency | 1                                                                      |

The prefix and name are separate because BullMQ composes the Redis key as
`<prefix>:<name>`. A producer using the default prefix (`bull`) would write to
`bull:transfer` and the worker would never see the job.

#### Job payload

```jsonc
{
  "requestId": "8df55417-cff4-4764-9abe-823993a9c980",
  "courierId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
}
```

Both fields must be present and must match a UUID pattern (`isTransferPayload`). The
amount and the requester are **not** sent — they are read from the reservation row for
that `requestId`, as on the HTTP endpoint.

#### Retry and backoff

`attempts` is 5 (`MAX_ATTEMPTS`). The delays come from the **consumer**: the producer
sets `backoff: { type: 'custom' }` and the worker supplies
`settings.backoffStrategy`, which is

```
delay(attemptsMade) = 5000ms × 5^(attemptsMade − 1)
```

| Attempt | Delay before it |
| ------- | --------------- |
| 1       | —               |
| 2       | 5s              |
| 3       | 25s             |
| 4       | 125s (2m 5s)    |
| 5       | 625s (10m 25s)  |

So a job that never succeeds is abandoned about 13 minutes after it was first picked up.

#### Classification

Each failure is sorted by `classifyTransferError`:

| Error code                           | Disposition | Effect                                           |
| ------------------------------------ | ----------- | ------------------------------------------------ |
| `ALREADY_TRANSFERRED`                | **success** | The transfer already happened; the job completes |
| `RESERVATION_NOT_FOUND`              | permanent   | Dead-lettered immediately, no retry              |
| `COURIER_NOT_FOUND`                  | permanent   | ditto                                            |
| `BALANCE_NOT_FOUND`                  | permanent   | ditto                                            |
| `ALREADY_RELEASED`                   | permanent   | ditto                                            |
| `INVALID_REQUEST_BODY`               | permanent   | ditto                                            |
| any other `AppError` with status 4xx | permanent   | ditto                                            |
| anything else (5xx, non-`AppError`)  | retry       | Retried on the schedule above                    |

A wrong job name, or a payload that fails the UUID guard, is also permanent.

#### Idempotency

Replaying a job is safe. A duplicate lands on
`transaction_log_one_transfer_per_request`, the partial unique index that allows one
`transfer` row per `request_id`; the service turns that into `ALREADY_TRANSFERRED`, which
the worker classifies as **success**. The job completes and no second transfer occurs.
Order Service uses the job id `outbox-<id>`, so a redelivery of the same outbox row is
the same BullMQ job.

#### `dead_letter_jobs`

A job is written to this table when it is classified permanent, or when its last retry
fails:

| Column        |                                                   |
| ------------- | ------------------------------------------------- |
| `id`          | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `job_id`      | BullMQ job id, or `unknown`                       |
| `task_name`   | the job name as received                          |
| `payload`     | `JSONB`, the job data verbatim                    |
| `error_trace` | `[CODE] ` plus the stack, for an `AppError`       |
| `failed_at`   | `TIMESTAMPTZ`                                     |
| `status`      | `TEXT NOT NULL DEFAULT 'UNRESOLVED'`, indexed     |

`credit_app` holds `SELECT, INSERT, UPDATE` and no `DELETE` or `TRUNCATE`, so rows can be
marked resolved but never removed by the service.

**If the dead-letter write itself fails**, the worker logs `DEAD-LETTER WRITE FAILED`
with the payload, the original error and the write error, and the job stays in BullMQ's
failed set for manual replay. `removeOnComplete` is true and `removeOnFail` is unset, so
failed jobs are retained in Redis.

---

### What was invented, and what the team still owes

Everything below was written to make the service usable and is **not** backed by a
requirement or a recorded team decision. Listed so it can be ratified or replaced.

1. **All request and response body shapes.** §8 fixes only method and path.
2. **All HTTP status codes**, and the `{ error: { code, message } }` envelope.
3. **`ALREADY_RELEASED` on transfer and `ALREADY_TRANSFERRED` on release.** No
   requirement states what happens when the two orderings collide.
4. **`GET /health`.**
   4a. **The `?userId=` and `?requestId=` filters on `GET /credits/transactions/all`**,
   their parameter names, that an unmatched filter is an empty `200`, and that filters
   travel beside the cursor rather than inside it. No FR covers this endpoint surface —
   see context §10 item 10.
   4b. **The four write endpoints take no token.** Service-to-service authentication is
   unspecified in the backlog; leaving them open was the agent's call, not the team's.
   4c. **`INVALID_CURSOR` (400)** and the opaque cursor format. Decision 5 left the cursor
   shape to the implementer.
   4d. **`IDENTITY_PROVIDER_UNAVAILABLE`** as the 503 code name. Decision 3 required a
   distinct code but did not name it.
5. **Self-transfer is not rejected.** If `courierId` equals the requester, the arithmetic
   nets out to a release. No requirement forbids it, and Order Service's F3.2.1 prevents
   it upstream, so Credit Service does not second-guess the caller.
6. **The role name `credit_app`** for the least-privilege database role (NFR8.2.3). The
   team specified "a named least-privilege role" without naming it.
7. **`ELEVATED_ROLE = 'admin'`** as the rank threshold for reading another user's
   balance. The team said to mirror user-service's rank comparison; the threshold itself
   was not stated.

#### Order Service integration (was a mismatch, now aligned)

`order-service/src/clients/credits.client.ts` previously declared a different contract —
`reserve({ requesterId, amount }) → { reservationId }` and `release(reservationId)`, with
no `requestId`, wired to `createStubCreditsClient()`. As of 2026-11-10 it matches this
document:

- `reserve({ userId, requestId, amount })` → `POST /credits/reserve`
- `release({ requestId })` → `POST /credits/release`
- it treats `409 RESERVATION_ALREADY_EXISTS` on reserve, and `404 RESERVATION_NOT_FOUND`
  or `409 ALREADY_RELEASED` on release, as success
- it has **no** `transfer` method: transfer is driven over the queue instead — see
  [Async interface](#async-interface)

### Design decisions

<!-- Written by the author -->

---

## Chat service API reference

Use this reference to see what each endpoint does, where it is called, and what to send or expect.

- Base URL in local Compose: `http://localhost:3005`.
- JSON requests: `Content-Type: application/json`.
- Snapshot date: 2026-11-10.

Implementation sources: [router mounts](chat-service/src/app.ts), [routes](chat-service/src/routes/conversations.routes.ts), [validation/controllers](chat-service/src/controllers/conversations.controller.ts), [operations](chat-service/src/services/conversations.service.ts). See [architecture and integrations](chat-service/docs/architecture.md).

### All HTTP endpoints

| Method | Path                                              | Authentication           | Success   |
| ------ | ------------------------------------------------- | ------------------------ | --------- |
| GET    | `/health`                                         | None                     | 200       |
| POST   | `/chat/conversations`                             | Order service key + name | 201 / 200 |
| GET    | `/chat/conversations`                             | Bearer                   | 200       |
| GET    | `/chat/conversations/:conversationID`             | Bearer                   | 200       |
| GET    | `/chat/conversations/:conversationID/messages`    | Bearer                   | 200       |
| POST   | `/chat/conversations/:conversationID/messages`    | Bearer or service key    | 201       |
| POST   | `/chat/conversations/:conversationID/read`        | Bearer                   | 200       |
| POST   | `/chat/conversations/:conversationID/translation` | Bearer                   | 200       |
| POST   | `/chat/orders/:orderId/participants`              | Service key              | 200       |
| POST   | `/chat/send-system-notification`                  | Service key              | 201 / 200 |
| POST   | `/chat/orders/:orderId/archive`                   | Bearer or service key    | 200       |

### Authentication, validation and response conventions

- **Bearer:** `Authorization: Bearer <access-token>`. RS256 signature and nonempty `sub`/unexpired numeric `exp` are checked against User Service JWKS. Reserved subject `SYSTEM` is rejected. Missing/invalid credentials and verifier failures produce 401 `{"message":"Unauthorized","code":"UNAUTHORIZED"}`.
- **Service key:** `X-Service-Key: <configured shared key>`. Except creation, a supplied key takes precedence over Bearer: an invalid key returns the same 401 JSON even when a valid Bearer token is supplied. `X-Service-Name` is not checked on these endpoints. On service-only endpoints, a valid Bearer token without the key produces plain-text 403.
- **Creation:** requires both the correct key and exactly `X-Service-Name: order-service`. Its errors use the separate envelope documented below.
- IDs described as UUIDs are validated with Zod `z.uuid()`. Body objects strip unknown fields; list/history query objects reject unknown query keys. Strings checked for nonblank content are stored unchanged; no explicit maximum length is imposed by those validators.
- Most domain/validation failures use `sendStatus`: plain-text `Bad Request` (400), `Forbidden` (403), `Not Found` (404), `Conflict` (409), or `Unprocessable Entity` (422). These do **not** include a JSON machine code. Controller-caught unexpected errors return 500 `{"message":"Internal server error."}`.
- Creation has no controller-level catch; unexpected creation errors use Express's default error handler. JSON-parser errors (including malformed JSON) and unmatched routes also use Express defaults; do not assume the application JSON error shapes for them.
- All serialized dates below are ISO timestamps. `uuid` and `iso-time` in compact examples denote actual UUID strings and ISO timestamps, not accepted literal values.

#### Shared message response

Send and notification responses return this object directly:

```json
{
  "messageId": "0192f0c4-0000-7000-8000-000000000001",
  "conversationId": "0192f0c4-0000-7000-8000-000000000002",
  "senderId": null,
  "type": "SYSTEM",
  "content": "The order has been created",
  "triggeredByUserId": null,
  "createdAt": "2026-11-10T00:00:00.000Z"
}
```

`senderId`, `content`, `triggeredByUserId` may be null in stored messages. Types are TEXT/SYSTEM. History adds `translatedContent` (string or null); send/notification responses and `message:sent` omit that field.

### GET /health

#### Current usage

Checks whether chat can query its database. It is available for operational health checks; it does not test Redis, User Service or Gemini.

#### Request and response

No body, parameters or authentication. Executes `SELECT 1`.

- 200: `{"status":"ok","database":"up"}`.
- 503: `{"status":"error","database":"down"}` when the query fails.

### POST /chat/conversations

#### Current usage

The [Order Service chat client](order-service/src/clients/chat.client.ts) calls this during its worker’s chat-creation job. After success, that client separately sends “The order has been created” through the notification endpoint.

#### Request and response

Order-service credentials required. Body fields are required:

```json
{
  "orderId": "0192f0c4-0000-7000-8000-000000000001",
  "requesterId": "0192f0c4-0000-7000-8000-00000000000a",
  "orderDescription": "Coffee from Deck"
}
```

Both IDs must be UUIDs; description must be a nonblank string. Creates ACTIVE conversation and REQUESTER atomically, using description as title. No initial message is created.

201 for new creation, 200 for matching order/requester/title replay:

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "orderId": "uuid",
    "title": "Coffee from Deck",
    "status": "ACTIVE",
    "createdAt": "iso-time"
  }
}
```

| Status | JSON error envelope                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Invalid conversation creation request","details":[{"field":"orderId","message":"orderId is required"}]}}` (details vary by invalid field) |
| 401    | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid service credentials"}}`                                                                                                               |
| 403    | `{"success":false,"error":{"code":"FORBIDDEN","message":"Service is not permitted to perform this operation"}}`                                                                                           |
| 409    | `{"success":false,"error":{"code":"ORDER_ID_CONFLICT","message":"A conversation already exists for this order with different creation details"}}`                                                         |

The requester’s `lastReadMessageId` and `revokedAt` start null. Creation timestamps use millisecond precision. The unique order ID resolves concurrent creation requests: a request that loses the insert race reads the existing row and applies the same requester/title match check. Retry comparison uses the stored title and requester. No student Bearer token is stored, and status is not accepted as a creation input.

### GET /chat/conversations

#### Current usage

The frontend uses `listChats` to load chat lists and Active/Archived tabs, calculate unread badges, and locate an order’s conversation through `findOrderChat`. See [chat client](frontend/src/api/chat.js), [Chat page](frontend/src/pages/Chat.jsx) and [ChatBubble](frontend/src/components/ChatBubble.jsx).

#### Request and response

Bearer required. No body.

| Query    | Validation / meaning                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| `limit`  | Optional decimal-digit string, integer 1–50; default 20                                                              |
| `status` | Optional lowercase `active` or `archived`                                                                            |
| `role`   | Optional lowercase `courier` or `requester`; user's participation role, not token role                               |
| `cursor` | Optional nonempty standard base64 of UTF-8 JSON `{"updatedAt":"<ISO timestamp>","id":"<UUID>"}`; exact keys required |

URL-encode base64 in query strings. Sort is `updatedAt DESC, conversationId DESC`, exclusive cursor boundary. Revoked memberships remain visible. Personal system chats match either role filter; status filtering still applies. Unread messages exclude own messages and include null senders; null read position counts all eligible messages.

200:

```json
{
  "conversations": [
    {
      "id": "uuid",
      "orderId": null,
      "lastMessage": {
        "content": "Notice",
        "type": "SYSTEM",
        "createdAt": "iso-time"
      },
      "unreadCount": 1,
      "updatedAt": "iso-time"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

`lastMessage` is null for empty conversations; its content can be null. Nonfinal `nextCursor` is an **object** `{updatedAt,id}` that callers must encode, not an already encoded string.

The query fetches one extra row to determine `hasMore`. Latest-message selection and unread comparisons use creation timestamp, then message ID. The frontend pins the FoC chat and displays it in the Active tab; the API still applies its normal timestamp sorting and status filter.

#### Errors

- 400 `{"message":"Invalid conversation query parameters","code":"VALIDATION_ERROR"}`.
- 401 common auth JSON.
- 500 common JSON.

### GET /chat/conversations/:conversationID

#### Current usage

The frontend uses `getChat` when opening a conversation and when loading chat-list details. `ChatBubble` also fetches it for the title of an incoming notification. See [Chat page](frontend/src/pages/Chat.jsx) and [ChatBubble](frontend/src/components/ChatBubble.jsx).

#### Request and response

Bearer required; UUID path; no body or query contract. Any participant, including revoked, can read.

200:

```json
{
  "conversationId": "uuid",
  "orderId": "uuid",
  "status": "ACTIVE",
  "title": "Coffee from Deck",
  "participants": [
    {
      "userId": "uuid",
      "role": "REQUESTER",
      "joinedAt": "iso-time"
    }
  ],
  "createdAt": "iso-time",
  "updatedAt": "iso-time"
}
```

System conversations have null `orderId` and null participant role. Status is ACTIVE/ARCHIVED.

#### Errors

- 400 invalid UUID.
- 401 auth.
- 404 missing conversation.
- 403 non-participant.
- 500 unexpected failure. Domain errors are plain text as above.

### GET /chat/conversations/:conversationID/messages

#### Current usage

The [Chat page](frontend/src/pages/Chat.jsx) calls `listMessages` on opening a conversation and when loading older history. The returned participants provide read positions and translation preferences; messages provide original and prepared translated text.

#### Request and response

Bearer required; UUID path. Query accepts only optional `limit` (same 1–50/default 20 rules) and `cursor` (standard base64 JSON with exact keys `{"createdAt":"<ISO timestamp>","id":"<UUID>"}`). Invalid UUID/query returns plain-text 400.

200:

```json
{
  "participants": [
    {
      "userId": "uuid",
      "role": "REQUESTER",
      "joinedAt": "iso-time",
      "lastReadMessageId": null,
      "translateTo": null
    }
  ],
  "data": [],
  "pagination": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

`data` contains shared message objects plus `translatedContent`, the requesting user's stored translation or null (including possible `SAME` sentinel). Participant role/read position/target language may be null. Pages sort `createdAt DESC, id DESC`; nonfinal cursor is object `{createdAt,id}` for the last returned message. All participants appear on each page. Revoked users retain history access.

The frontend combines persisted participant read positions with live receipts to restore read ticks after reopening or loading older history. It merges HTTP and socket messages by messageId; on reconnect it rejoins open rooms and reloads history.

#### Errors

- 400 invalid path/query.
- 401 auth.
- 404 missing conversation.
- 403 non-participant.
- 500 unexpected failure.

### POST /chat/conversations/:conversationID/messages

#### Current usage

The [Chat page](frontend/src/pages/Chat.jsx) calls `sendMessage` when a user submits text in the message composer. Other clients receive the committed message through Socket.IO. Service-key TEXT sending is supported by this endpoint; the Order Service client uses the dedicated SYSTEM notification endpoint instead.

#### Request and response

Bearer or service key; UUID path. Body:

```json
{
  "type": "TEXT",
  "content": "Hello"
}
```

Only TEXT and nonblank string content are accepted. User-supplied sender/actor fields are ignored. Verified user is sender; service-key sender is null. Service keys bypass membership checks but still require ACTIVE conversation. A participant user cannot send into a personal system conversation.

201: shared message object (type TEXT, triggering-user ID null). After commit emits `message:sent` and queues enabled recipient translations. Publication/enqueue failure does not change successful persistence.

Content is stored unchanged, including leading or trailing whitespace around nonblank text. Message insertion and the conversation timestamp update share a transaction and timestamp. Socket delivery follows commit and targets each socket once across the union of rooms. Success confirms persistence, without acknowledging delivery to every frontend. This endpoint has no caller-supplied idempotency key.

#### Errors

- 400 invalid path/body or unsupported type.
- 401 auth.
- 404 absent conversation.
- 403 non-participant or user sending into system chat.
- 422 a user's SYSTEM type attempt.
- 409 archived conversation or revoked sender.
- 500 unexpected failure.

Service-key SYSTEM attempts get 400. Lookup/membership checks precede body validation; archive/revocation checks follow valid-body validation.

### POST /chat/conversations/:conversationID/read

#### Current usage

The [Chat page](frontend/src/pages/Chat.jsx) calls `markMessagesRead` for displayed messages. The [frontend client](frontend/src/api/chat.js) then dispatches `chat-read-updated` to refresh unread counts; the server publishes the read receipt to other chat-room users.

#### Request and response

Bearer required; UUID path and required UUID body field:

```json
{
  "lastReadMessageId": "0192f0c4-0000-7000-8000-000000000001"
}
```

200: `{"conversationId":"uuid","userId":"uuid","lastReadMessageId":"uuid"}`. Returns the retained position if the requested message is older; ordering uses creation timestamp then ID. Archived conversations are allowed. Emits `messsage:read` (three s characters) to other users in the conversation room.

The authenticated subject supplies the reader identity. Neither the response nor event includes `readAt`. Concurrent updates retry against the latest stored position. The server emits `messsage:read` even when the position stays unchanged, excluding every socket in the reader’s user room. Other users must have joined the conversation room to receive it. Broadcast failure is logged without changing the successful response.

#### Errors

- 400 invalid path/body or target message belongs to another conversation.
- 401 auth.
- 403 non-participant.
- 404 conversation or target message missing.
- 409 revoked membership.
- 500 unexpected failure.

### POST /chat/conversations/:conversationID/translation

#### Current usage

The [Chat page](frontend/src/pages/Chat.jsx) calls `setTranslation` when the user changes auto-translation. Enabling queues history translation, and subsequent messages can be translated for that participant. Results arrive through `message:translated` or later history requests.

#### Request and response

Bearer required; UUID path. Body is either:

```json
{
  "enabled": true,
  "language": "zh"
}
```

or `{"enabled":false}`. Enabled must be boolean literal; enabling requires one of `en`, `zh`, `hi`, `ta`, `ms`, `es`, `ar`. Disabling does not require language (extra fields are stripped).

200: `{"conversationId":"uuid","userId":"uuid","translateTo":"zh"}`; disabling returns null target. Enabling queues untranslated received history; this response confirms the stored preference, not completed translation. Changing enabled language deletes old translations; disabling preserves them. Archived conversations are allowed.

The client sends its User Service preferred language when enabling; changing the user setting does not update existing `translate_to` values automatically. Stored translations are per message/user. Eligible messages are received TEXT or SYSTEM messages with content; own messages are excluded. Jobs check current membership and target language before processing.

Disabling, changing preferred language, then re-enabling can retain old-language translations: stored translation rows have no language column, and enabling from null does not delete them.

Gemini receives and returns JSON keyed by message ID. Literal `SAME` is stored when text already matches the target language. Missing or invalid values remain untranslated for a later applicable job; those missing values alone do not trigger an immediate retry. The UI’s Show original / Translate controls switch between original and stored text without invoking the model. Null and SAME do not offer that switch.

#### Errors

- 400 invalid path/body/language.
- 401 auth.
- 403 non-participant.
- 404 absent conversation.
- 409 revoked membership.
- 500 unexpected failure. Enqueue failures are logged without failing the response.

### POST /chat/orders/:orderId/participants

#### Current usage

The [Order Service chat client](order-service/src/clients/chat.client.ts) uses this in its participant-delivery job to add the courier by order ID. It does not need to retrieve the conversation ID first. Order acceptance queues courier addition alongside the status change. The worker retries network/5xx failures; 409 is permanent and is dead-lettered.

#### Request and response

Service key required; UUID path is the order ID. It resolves the associated conversation inside the membership transaction. Required body:

```json
{
  "userId": "0192f0c4-0000-7000-8000-00000000000a",
  "role": "COURIER"
}
```

User ID must be UUID and role exactly REQUESTER or COURIER. Creates membership only; does not look up user existence in User Service.

200:

```json
{
  "conversationParticipantId": "uuid",
  "conversationId": "uuid",
  "userId": "uuid",
  "joinedAt": "iso-time",
  "role": "COURIER"
}
```

The transaction locks the ACTIVE conversation before checking membership and inserting. New rows use the schema defaults. A revoked courier permits adding a different courier; revoked requester membership still occupies the requester role. Existing memberships are not updated or reactivated. No participant-added socket event is emitted.

#### Errors

- 400 invalid path/body.
- 401 auth.
- 403 Bearer-only caller.
- 404 no conversation for that order.
- 409 archived, same user already present (even revoked), another requester already present, or another active courier present.
- 500 unexpected failure. Repeated additions conflict rather than return idempotent success.

### POST /chat/send-system-notification

#### Current usage

The [Order Service chat client](order-service/src/clients/chat.client.ts) sends creation and lifecycle notifications here. Its stable message ID allows delivery retries. The endpoint also supports personal notifications as described in the [caller guide](chat-service/SYSTEM-NOTIFICATIONS.md); this describes supported usage, not a verified personal-notification caller in every service.

#### Request and response

Service key required. Order notification body:

```json
{
  "orderId": "0192f0c4-0000-7000-8000-000000000001",
  "messageId": "0192f0c4-0000-7000-8000-000000000002",
  "message": "The order has been created",
  "triggeredByUserId": "0192f0c4-0000-7000-8000-00000000000a"
}
```

Personal notification body:

```json
{
  "orderId": null,
  "recipient": "0192f0c4-0000-7000-8000-00000000000a",
  "messageId": "0192f0c4-0000-7000-8000-000000000002",
  "message": "Account notice"
}
```

`orderId` is required UUID or null; `messageId` required UUID; `message` required nonblank string. `recipient` optional UUID, required when orderId=null; when orderId is non-null it is not used to restrict recipients. `triggeredByUserId` optional UUID, permitted only for non-null orderId; no participant/user-existence check is performed for this actor.

201: shared message object with type SYSTEM and senderId=null; emits only on initial creation. Personal chat is created lazily. 200: identical message-ID replay, returning existing message with no rebroadcast/enqueue. Deduplication checks order, personal recipient when applicable, content, type, sender and actor; it runs before ACTIVE checks, so identical replay after archive succeeds.

The caller generates the UUID once per notification before delivery and reuses it on every retry. A fresh UUID creates a distinct message. Identical replay leaves `updatedAt` unchanged; concurrent duplicate insertion is resolved after rollback of the losing transaction.

An explicit order ID uses only its order conversation. Personal delivery requires explicit `orderId: null` and recipient. The first personal notification creates an ACTIVE FoC conversation with null orderId and one null-role participant. A unique per-user mapping resolves concurrent creation. Conversation creation commits separately before message insertion, so a failed insert can leave an empty conversation that retries reuse. The first saved message uses `message:sent`; no conversation-created event is emitted.

The triggering-user field records the actor without removing recipients or messages. The frontend suppresses that actor’s toast.

#### Errors

- 400 invalid body or invalid conditional fields.
- 401 auth.
- 403 Bearer-only caller.
- 404 order conversation missing.
- 409 archived conversation for a new message or message-ID reuse with different checked fields.
- 500 unexpected failure. See [caller guide](chat-service/SYSTEM-NOTIFICATIONS.md).

#### Order notification wording

The [Order Service implementation](order-service/src/services/orders.service.ts) currently supplies these messages. Chat stores the caller's text; it does not derive order status or fetch courier names.

| Trigger                         | Notification text                           |
| ------------------------------- | ------------------------------------------- |
| Creation                        | `The order has been created`                |
| Cancelled                       | `The order has been cancelled`              |
| Expired                         | `The order has expired`                     |
| Accepted, username available    | `The order has been accepted by <username>` |
| Accepted, lookup fails/unusable | `The order has been accepted`               |
| Picked up                       | `The order has been picked up`              |
| Delivered                       | `The order has been delivered`              |
| Completed                       | `The order has been marked as completed`    |

The acceptance flow obtains the courier username in Order Service using the request Bearer token with User Service; that token is not placed in the notification job. Notification jobs retain their message UUID across retries. See the [Order Service README](order-service/README.md).

### POST /chat/orders/:orderId/archive

#### Current usage

The [Order Service chat client](order-service/src/clients/chat.client.ts) calls this after a successful final notification when `archiveAfter` is set. On retry it resends the same notification ID before attempting archive again. Bearer access is supported, but the inspected frontend chat client does not expose an archive action.

#### Request and response

Bearer or service key; UUID order path. No body fields are consumed. Service-key caller may archive any existing order conversation. Bearer caller must be a participant; membership revocation is not checked here.

200 plain-text `OK`, including already archived conversations. Sets ARCHIVED only, without updating conversation `updatedAt`, deleting data or emitting an archive event.

Order Service sets `archiveAfter` for completed/cancelled transitions. It sends the final status message first and archives only after successful notification. This internal job flag is not sent in the notification body. Temporary failures retry through the outbox/worker flow using the same notification UUID; identical notification replay remains successful after archive.

#### Errors

- 400 invalid order UUID.
- 401 auth.
- 403 user not a participant.
- 404 no conversation for order.
- 500 unexpected failure.

### Socket.IO interface

Uses the same HTTP server at `/chat-socket.io`, WebSocket transport only. Connect with `auth: {token: "<access-token>"}`. Invalid token produces `connect_error` with message `unauthorized`; socket disconnects at token expiry. It automatically joins `user:<verifiedUserId>` before receiving `ready`.

| Event                | Direction       | Payload / behavior                                                                                                                         |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ready`              | Server → client | No payload; user room joined                                                                                                               |
| `chat:join`          | Client → server | Conversation UUID string and optional ack callback; verifies conversation and non-revoked membership, joins `chat:<id>`                    |
| `chat:leave`         | Client → server | Conversation UUID string and optional ack; leaves room without membership lookup, allowing cleanup after revocation                        |
| `message:sent`       | Server → client | Shared message object; union of chat room and non-revoked participant user rooms, once per targeted socket                                 |
| `messsage:read`      | Server → client | `{conversationId,userId,lastReadMessageId}`; chat room excluding reader's user room; spelling is intentional documentation of current code |
| `message:translated` | Server → client | `{messageId,conversationId,translatedContent}`; target user's room only, userId omitted                                                    |

Join/leave operations execute in received order. Success ack: `{"success":true,"conversationId":"uuid"}`. Failure: `{"success":false,"error":{"code":400,"message":"Bad Request"}}`. Join codes: 400 invalid UUID, 404 missing conversation, 403 non-participant, 409 revoked, 500 unexpected error (`Internal server error.`). Leave validates UUID (400) and can fail unexpectedly (500); it does not reject nonexistent conversations. Joining does not reject archive status alone. Message sending uses HTTP, not a client socket send event.
