<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
Scope: Rewrote this file as a full service-level README (overview, tech stack, folder
       structure, env vars, API surface, data model, JWT/elevation/lockout details,
       background outbox worker, tests, Docker, deployment), describing the code as it
       stands on this branch. The prior content (database-migration instructions) is kept,
       merged in under "Database migrations". No requirements, architecture, schema, or API
       decisions were made by the AI tool; this restates decisions already recorded in
       instructions.md, src/config.ts, src/db/init.sql and the implemented routes/services.
Author review:
-->

# User Service

Owns accounts, authentication, and admin user-management for FoC. Other services verify its
access tokens themselves against its published JWKS, rather than calling it per request.

- Registration, login/logout/refresh and password/email changes, all OTP-gated by email.
- An escalating login-lockout and OTP-send-escalation system, with an emailed self-service
  unlock link.
- Role/status administration (promote/demote, suspend/unsuspend, unlock) with an append-only
  audit log, gated behind a second-factor "admin elevation" OTP for high-risk writes.
- A JWKS endpoint (`GET /auth/.well-known/jwks.json`) other services use to verify RS256
  access tokens locally, with signing-key rotation support.
- A transactional outbox that allocates each new active user's starting credits through
  credit-service.
- Supplier bookmarking and a "last request delivery location" convenience store for the
  frontend.
- A service-key-gated lookup (`GET /users/worker/:id`) for order-service's scheduler.

## Tech stack

| | |
|---|---|
| Runtime | Node.js, ES modules, TypeScript |
| HTTP | Express 4 |
| Database | PostgreSQL, accessed with `pg` (raw SQL, no ORM) |
| Migrations | Prisma (migration runner only — `prisma/schema.prisma` has no models) |
| Validation | zod |
| Auth | RS256 JWTs signed/verified in-process (`jsonwebtoken`); bcrypt for passwords |
| Email | Nodemailer (logged instead of sent when `NODE_ENV=development`) |
| Tests | Vitest with Supertest, against a real disposable Postgres database |
| Deployment | Docker, ECS Fargate |

## Folder structure

```
src/
  app.ts                      Express app: middleware, router mounting, error handler (not listening)
  server.ts                   entrypoint: bootstrap super admin/test user, start outbox relay, listen
  config.ts                   zod-validated environment schema → typed config object
  constants/auditReasons.ts   AuditAction type and preset reason codes for the audit log
  db/
    init.sql                  schema (tables, enums, triggers); applied on an empty Postgres volume
    pool.ts                   pg Pool
    transaction.ts            withTransaction helper
    queries/                  one file per aggregate: users, otp, tokens, creditOutbox, auditLog, bookmarks, lastRequest
  routes/                     router factories: auth, me, users, auditLog, adminOtp
  controllers/                zod request validation + response shaping, calling into services
  services/
    auth.service.ts           register/login/logout/refresh, OTP verify flows, lockout core, unlock-by-token
    users.service.ts          admin list/get/status/role/unlock/full-email, audit writes
    me.service.ts             self-service profile/username/email/password changes
    otp.service.ts            OTP issue/request/check and send-escalation
    adminOtp.service.ts       admin-elevation OTP (send/verify/resend) and elevation token issuance
    auditLog.service.ts       paginated audit log listing
    bootstrap.service.ts      super-admin and optional local test-user seeding on startup
    creditOutbox.relay.ts     background poller delivering credit allocations to credit-service
    lockEscalation.ts         shared escalation-level/duration/reset math (lockout + OTP sends)
    email.service.ts          nodemailer wrapper, OTP/unlock-email templates, retry with backoff
    userResponse.ts           DB row → API response shape, email masking
    bookmarks.service.ts       supplier bookmarking (20-item cap)
    lastRequest.service.ts    last delivery-location convenience store
  middleware/                 authenticate (bearer JWT), authenticateServiceKey, authorize (role rank)
  utils/                       jwt.ts (sign/verify every token type + JWKS), elevation.ts, cookies.ts,
                               hash.ts, otp.ts, AppError.ts, asyncHandler.ts, maskEmail.ts, passwordPolicy.ts
  scripts/                     setupLocalDev.ts, replayCreditOutbox.ts
  types/express.d.ts           Request.user augmentation
tests/                         Vitest suites: concurrency, controllers, db, middleware, scripts, services, utils
prisma/
  schema.prisma                 datasource only, no models
  migrations/                   versioned SQL migrations (commit these)
keys/                          RS256 keypair, generated by `npm run setup` (gitignored)
docs/user-service-instructions.md   local setup guide and the JWKS verification contract for other services
```

## Environment variables

Validated by `src/config.ts` at startup; the process exits with the failing variable name if
anything is missing or malformed. See [.env.example](./.env.example) for the full list and
defaults.

| Name | Required | Purpose |
|---|---|---|
| `PORT` / `NODE_ENV` | yes | listen port; `development` relaxes the SMTP requirement below |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | yes | PostgreSQL connection |
| `DB_SSL` | no, default `false` | `true` requires TLS with a verified server certificate |
| `JWT_KEY_ID` / `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | yes | current RS256 signing key |
| `JWT_PREVIOUS_KEY_ID` / `JWT_PREVIOUS_PUBLIC_KEY_PATH` | no | set together, only during a key-rotation overlap window |
| `ACCESS_TOKEN_TTL_MINUTES` | yes, 1–15 | access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | yes, 1–30 | refresh token / cookie lifetime |
| `ELEVATION_TOKEN_TTL_MINUTES` | yes, 1–15 | admin-elevation token lifetime |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | required outside `development` | Nodemailer; blank in dev logs emails instead of sending |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | yes | seeded once on startup if no super admin exists yet |
| `TEST_USER_USERNAME` / `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | no | seeds one normal-role test user only if all three are set |
| `OTP_TTL_MINUTES` / `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_RESENDS` / `OTP_RESEND_WINDOW_MINUTES` | yes | OTP lifetime and resend limits |
| `CREDIT_SERVICE_URL` | yes | credit-service origin, for the outbox relay's `POST /credits/allocate` |
| `LOGIN_MAX_FAILURES` / `LOGIN_FAILURE_WINDOW_MINUTES` | yes | failed-login threshold and rolling window before locking |
| `LOCK_ESCALATION_HOURS` | yes | comma-separated hours for the 1st/2nd/3rd+ lock, e.g. `1,4,24`; shared by login lock and OTP send-block |
| `LOCK_ESCALATION_RESET_HOURS` | yes | hours of inactivity before an escalation level decays back to 0 |
| `USER_ORDER_SERVICE_API_KEY` | yes | shared secret order-service sends as `User-Order-Service-Key` to `GET /users/worker/:id` |
| `FRONTEND_BASE_URL` | yes, must be a URL | frontend origin; the lockout-unlock email links to `{FRONTEND_BASE_URL}/unlock-account?token=...` |
| `DATABASE_URL` | yes, for `db:deploy` only | read by Prisma to apply migrations; not read by the app itself |

## Local setup

```bash
cd user-service
npm install
npm run setup     # copies .env.example → .env, generates SUPER_ADMIN_PASSWORD and the RS256 keypair
```

`npm run setup` is safe to re-run — it leaves an existing `.env`, password or keypair alone.
Pass `-- --force` to regenerate the RS256 keypair and `JWT_KEY_ID` (e.g. after a suspected key
leak); this does not touch `SUPER_ADMIN_PASSWORD` or any other `.env` value, and any other
locally running service that caches this service's JWKS needs restarting afterwards. Full
details, and the JWKS verification contract other services implement against, are in
[docs/user-service-instructions.md](./docs/user-service-instructions.md).

From the repo root:

```bash
docker compose up --build user-service
```

- API: http://localhost:3001 (fixed; compose does not parameterise this port)
- DB from host: `localhost:5434` — published **temporarily**, for host-run Vitest; remove
  before deploying

To run on the host against the containerised database:

```bash
docker compose up -d user-db        # from the repo root
cd user-service
npm run dev                         # nodemon + tsx, restarts on changes in src/
```

## API

All error responses use `{ "message": "...", "code": "..." }`; a `Retry-After` header
accompanies throttling responses. Bodies are validated with zod; a failing body returns
`400 VALIDATION_ERROR`.

### `/auth` — public, no bearer token required

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{username,email,password}`; sends a registration OTP and sets a `pendingToken` cookie. `409 USERNAME_TAKEN`/`EMAIL_TAKEN`. |
| POST | `/auth/login` | `{identifier,password}`; sets the `refreshToken` cookie and returns an access token. `403 ACCOUNT_NOT_VERIFIED`/`ACCOUNT_SUSPENDED`, `429 ACCOUNT_LOCKED`. |
| POST | `/auth/logout` | Revokes the session behind the `refreshToken` cookie. |
| POST | `/auth/refresh` | Issues a new access token from the `refreshToken` cookie. |
| POST | `/auth/verify-otp` | `{email,otp,purpose}`, `purpose` is `registration` or `forgot_password`. |
| POST | `/auth/resend-otp` | `{email,purpose}`; subject to the resend cooldown/limit/escalation. |
| POST | `/auth/forgot-password` | `{email}`; sends a password-reset OTP. |
| POST | `/auth/reset-password` | `{email,otp,newPassword}`; revokes all of the account's refresh tokens on success. |
| POST | `/auth/unlock` | `{token}` from the emailed unlock link; `200 UNLOCKED` or `ALREADY_UNLOCKED`. |
| GET | `/auth/.well-known/jwks.json` | Public signing key(s), for other services to verify access tokens. |

### `/users/me` — bearer access token required

| Method | Path | Notes |
|---|---|---|
| GET / PUT | `/users/me/last-request` | The caller's last delivery location. |
| GET | `/users/me` | `{username,email,activeView,preferredLang}`. |
| PUT | `/users/me/active-view` | `{activeView:"requester"\|"courier"}`. |
| PUT | `/users/me/preferred-lang` | `{preferredLang}`, one of `en,zh,hi,ta,ms,es,ar`. |
| PUT | `/users/me/username` | `{newUsername}`; `409 USERNAME_UNCHANGED`/`USERNAME_TAKEN`. |
| PUT | `/users/me/email` | `{currentPassword,newEmail}`; sends an OTP to the new address. A wrong password counts toward the login-lockout counter. |
| POST | `/users/me/verify-otp` | `{otp,purpose:"change_email"}`; completes the email change. |
| POST | `/users/me/resend-otp` | `{purpose:"change_email"\|"change_password"}`. |
| PUT | `/users/me/password` | `{currentPassword,newPassword}`; sends a confirmation OTP. |
| POST | `/users/me/confirm-password-change` | `{otp,newPassword}`; revokes all of the account's refresh tokens on success. |
| GET | `/users/me/bookmarks` | `{supplier_ids:number[]}`. |
| PUT / DELETE | `/users/me/bookmarks/:supplierId` | Add (capped at 20, `422 BOOKMARK_LIMIT_REACHED`) or remove a bookmark; both are idempotent. |

### `/users`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/users/public?ids=` | bearer | Up to 50 UUIDs; `{users:[{id,username}]}`, unknown ids silently omitted. |
| GET | `/users/public/:id` | bearer | `{id,username}`. |
| GET | `/users` | admin+ | Paginated listing (50/page) with filters: `username`, `email`, `status`, `role`, `locked`, `sortBy`, `sortDir`. |
| GET | `/users/worker/:id` | service key (`User-Order-Service-Key`) | `{status,lockedUntil}`, for order-service's scheduler. |
| POST | `/users/:id/full-email` | admin+ | Unmasks the target's email; writes an `EMAIL_UNMASK` audit row. `403` on a super-admin target. |
| GET | `/users/:id` | admin+ | Full user, email masked unless it's the caller's own. |
| PUT | `/users/:id/status` | admin+ | `{status:"active"\|"suspended",reason,otherReason?}` + `Elevated-Token` header. Audited `USER_SUSPEND`/`USER_UNSUSPEND`. |
| PUT | `/users/:id/role` | super admin | `{role:"admin"\|"user",reason,otherReason?}` + `Elevated-Token` header. Audited `USER_PROMOTE`/`USER_DEMOTE`; `403 SELF_ROLE_CHANGE`. |
| POST | `/users/:id/unlock` | admin+ | Clears an active lockout; audited `USER_UNLOCK` only if the target was actually locked. |

A super-admin target returns `403 SUPER_ADMIN_IMMUTABLE` for status/role/unlock changes.
`/public`, `/worker/:id` and `/:id/full-email` are registered before `/:id` so they are not
swallowed by it.

### `/admin/audit-logs`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/audit-logs` | admin+ | Paginated (50/page); filters `actor`, `target`, `action[]`, `reasonCode`, `from`, `to`, `sortDir`. |

### `/admin` — admin elevation

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/admin/send-otp` | admin+ | `{purpose:"admin_action"}`; `409 ALREADY_ELEVATED` if a valid elevation token already exists for this session. |
| POST | `/admin/verify-otp` | admin+ | `{otp,purpose}` → `{elevationToken}`. |
| POST | `/admin/resend-otp` | admin+ | `{purpose}`. |

### Health

`GET /health` — no auth.

## JWTs, JWKS and key rotation

All tokens are RS256, signed with the key at `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`
under `kid: JWT_KEY_ID`. Five token types, each carrying its own `typ` header so one type can
never be accepted in place of another:

| Token | `typ` | Carried as | TTL | Claims |
|---|---|---|---|---|
| Access | `at+JWT` | `Authorization: Bearer` | `ACCESS_TOKEN_TTL_MINUTES` | `sub`, `role`, `sid` |
| Refresh | — (opaque, not a JWT) | `refreshToken` httpOnly cookie | `REFRESH_TOKEN_TTL_DAYS` | stored only as a SHA-256 hash in `refresh_tokens` |
| Elevation | `ep+JWT` | `Elevated-Token` header | `ELEVATION_TOKEN_TTL_MINUTES` | `sub`, `role`, `sid` |
| Unlock | `ul+JWT` | query param in the emailed link | fixed 1 hour | `sub`, `lck` (the `login_locked_until` value at issue time) |
| Pending-verification | `pv+JWT` | `pendingToken` cookie | `OTP_TTL_MINUTES` | `sub` |

`GET /auth/.well-known/jwks.json` publishes the current key, and the previous key during a
rotation overlap window (`JWT_PREVIOUS_KEY_ID`/`JWT_PREVIOUS_PUBLIC_KEY_PATH` set together).
Other services cache this by `kid`, verify `RS256` only (never trusting a token's own `alg`),
and refetch once on an unknown `kid` before rejecting. See
[docs/user-service-instructions.md](./docs/user-service-instructions.md) Part 2 for the full
contract other services implement against.

## Admin elevation

High-risk admin writes (`PUT /users/:id/status`, `PUT /users/:id/role`) require an
`Elevated-Token` header in addition to the normal bearer token. The admin requests an OTP to
their own email (`POST /admin/send-otp`), verifies it (`POST /admin/verify-otp`) to receive a
short-lived elevation token bound to their user id and session (`sid`), and attaches it to the
write call. The elevation check runs last, after existence/role-restriction/no-op checks, so a
no-op change needs no elevation. `unlockUser` and the email-unmask endpoint do not require it.

## Login lockout and OTP send escalation

After `LOGIN_MAX_FAILURES` failed attempts within `LOGIN_FAILURE_WINDOW_MINUTES`, the account
locks for an escalating duration drawn from `LOCK_ESCALATION_HOURS` (1st/2nd/3rd+ lock), capped
at the list's last value; a level decays back to 0 after `LOCK_ESCALATION_RESET_HOURS` without
another lock. The same counter is shared by login and by a wrong current-password on the
email/password-change endpoints. Locking the account fires a background email with a
self-service unlock link (`POST /auth/unlock`) built from `FRONTEND_BASE_URL`; the link is
valid only while the account's `login_locked_until` still matches the value at send time, so a
repeat click, a manual admin unlock, or a later lock all answer `ALREADY_UNLOCKED`. Pending or
suspended accounts never lock. OTP sends use the same escalation math independently, per
(user, purpose), gated additionally by a flat `OTP_RESEND_COOLDOWN_SECONDS` between sends and
`OTP_MAX_RESENDS` within `OTP_RESEND_WINDOW_MINUTES`. Each OTP code allows 5 guesses before
`429 OTP_ATTEMPTS_EXCEEDED`.

## Data

`src/db/init.sql`, PostgreSQL. There are no Prisma models; Prisma only runs migrations against
this schema.

| Table | Holds |
|---|---|
| `users` | Account row: credentials, `status` (pending/active/suspended), `role` (user/admin/super admin), `active_view`, `preferred_lang`, and the login-lockout counters |
| `users_otps` | One row per outstanding OTP: hash, purpose, attempt count, expiry, and the send-escalation counters |
| `refresh_tokens` | Hashed refresh tokens; `id` doubles as the access token's `sid` claim |
| `credit_allocation_outbox` | Pending/sent/dead credit-allocation jobs for the relay below |
| `user_bookmarks` | `(user_id, supplier_id)` — supplier ids are supplier-service's, with no cross-database foreign key |
| `admin_audit_log` | Append-only (triggers block `UPDATE`/`DELETE`/`TRUNCATE`): actor, action, target, before/after JSON, reason |
| `last_request` | The user's last delivery-location id/details |

There is no elevation-token table — elevation tokens are stateless signed JWTs, never
persisted.

## Background work — credit allocation outbox

`creditOutbox.relay.ts`, started from `server.ts`, polls every second for up to 5 due rows and
`POST`s each to `${CREDIT_SERVICE_URL}/credits/allocate`. A `2xx` or `409` (already allocated)
marks the row sent; `400/401/403/404/500` mark it permanently dead; other `4xx`/`5xx`/timeouts
retry with exponential backoff (1 s, doubling, capped at 300 s) up to 10 attempts before going
dead. A row is created in the same transaction as the account's activation (registration OTP
verification, super-admin bootstrap, test-user bootstrap), so every active user has exactly one
outbox row.

```bash
npm run outbox:replay -- <outbox-id> [<outbox-id> ...]
npm run outbox:replay -- --all-dead
```

resets matching dead rows back to pending so the relay retries them.

## Super admin / test user bootstrap

On every startup, `bootstrapSuperAdmin()` creates the `SUPER_ADMIN_*` account (plus its outbox
row) if no super admin exists yet; it never modifies an existing one, and throws at startup if
the configured username/email collides with an existing non-super-admin account.
`bootstrapTestUser()` additionally seeds one normal-role account from `TEST_USER_*` only when
all three of those variables are set — a local-dev convenience, skipped if the username/email
already exists.

## Scripts

| Script | Does |
|---|---|
| `npm start` | API via `tsx` |
| `npm run dev` | API under `nodemon`, restarts on changes in `src/` |
| `npm run build` | `tsc` to `dist/` |
| `npm test` | Vitest, single run |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run setup [-- --force]` | Local `.env`/keypair/super-admin-password bootstrap (see Local setup) |
| `npm run outbox:replay` | Re-queue dead credit-allocation jobs (see above) |
| `npm run db:deploy` | `prisma migrate deploy` — applies pending migrations |

## Tests

```bash
npm test
```

Needs a live Postgres reachable via `.env.test` (compose publishes `user-db` on host port 5434
for this). `tests/setup/globalSetup.ts` refuses to run unless `DB_NAME` ends in `_test`, then
drops and recreates that database from the real `src/db/init.sql` on every run, so the test
schema can never drift from what ships. Tests run with `fileParallelism: false` since suites
share one database.

Suites: `tests/concurrency/` (interleaved-transaction correctness — lockout, races),
`tests/controllers/` (HTTP-level, via Supertest against the real app), `tests/db/` (direct
SQL-layer tests per query file), `tests/middleware/`, `tests/scripts/`, `tests/services/`,
`tests/utils/`, `tests/config.test.ts`.

## Docker

```bash
docker build --target prod -t user-service:prod .
```

Targets: `base` (dependencies and source), `dev` (`npm run dev`), `prod` (`npm run build`, then
`node dist/server.js`, plus the RDS CA bundle at
`/etc/ssl/rds-ap-southeast-1-bundle.pem`, trusted via `NODE_EXTRA_CA_CERTS` in the ECS task
definition). The image exposes 3001. `keepAliveTimeout`/`headersTimeout` are tuned above an
ALB's 60 s idle timeout.

## Deployment

ECS Fargate, cluster `foc`, region `ap-southeast-1`, ECR repository `foc/user-service`,
deployed on every merge to `main` by
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Start, stop and teardown
steps are in [`docs/ecs-fargate-run-checklist.md`](../docs/ecs-fargate-run-checklist.md).

## Database migrations

Schema changes are versioned SQL files in `prisma/migrations`, applied with Prisma (the service
itself still queries with `pg`; `prisma/schema.prisma` has no models on purpose).

```sh
# DATABASE_URL points at the user database (see .env.example)
npm run db:deploy
```

- **Fresh database:** `npm run db:deploy` creates everything.
- **Database already built from `src/db/init.sql`** (an existing Compose volume): mark the
  baseline once, then deploy.
  ```sh
  npx prisma migrate resolve --applied 20261109000000_baseline
  npm run db:deploy
  ```
- The baseline is `init.sql` as it stood before `preferred_lang`;
  `20261109010000_add_preferred_lang` adds `users.preferred_lang`.
- Do not run `prisma migrate dev` or `db push`: with no models Prisma would try to drop the
  tables.
- `src/db/init.sql` is still what the test database, CI and a fresh Compose volume use, so it
  must also contain every column a migration adds.
