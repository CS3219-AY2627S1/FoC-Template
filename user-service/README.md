<!-- Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing implementation and verification notes. Author review: Reviewed and approved by @phuc. -->
<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented the User Service endpoints and error responses.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Documented the database roles, migrations and the reset script.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
Scope: Documented /health, database-outage behaviour and the deployment note.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
Scope: Documented suspend/restore, the audit log and its limits.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
Scope: "Rules for changing this service" section and the endpoint template pointer.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
Scope: Documented the login events (N2H1a): endpoint, table, retention and known limits.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-08
Scope: Login-events known limitations and the speed-limit numbers, from tests on the Compose stack;
2026-11-10: removed the AWS limitation after the team stopped the AWS deployment.
Author review of additional changes: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
Scope: Documented the admin accounts endpoints and the audit viewer's previousHash.
Author review of additional changes: Reviewed and approved by @t-leongchuan
-->

# User Service

Accounts, login, profiles and roles for FoC. Express + TypeScript + PostgreSQL.

## Account-status publishing

Registration and first-admin bootstrap atomically insert an initial `ACTIVE` notification into
`outbox`. Suspend/restore append a notification only when status changes, in the same transaction
as the account update and audit entry. Administrators receive credit accounts too. Passwords are
validated and hashed before registration acquires its database connection.

The background publisher sends up to 100 events per Kafka call to `user.account-status`, keyed
by account ID, then marks them published after acknowledgment. It uses a shared advisory lock
across replicas, a 200 ms fallback poll, wake-on-commit, outage back-off, and hourly cleanup of
rows published more than seven days ago. Logs include publish count/duration, failures/recovery,
and backlog count/oldest age once per minute. HTTP startup and `/health` do not wait for Kafka.

`KAFKA_BROKERS` is required for the service (comma-separated); `KAFKA_CLIENT_ID` defaults to
`user-service`. Compose supplies both. Provision topics separately with `kafka-init`; for a fresh
local stack run `docker compose up -d kafka-init` as well as the usual service startup.
Deploy Credit Service migration `0003_account_status_dedup.sql` and its handler before enabling
this producer. Existing users are not automatically backfilled. Activation is asynchronous, so
an immediate order may still encounter `ACCOUNT_NOT_FOUND` until Credit processes the activation.
See [the implementation notes](docs/account-status-publishing.md) for the contract and rollout limits.

From `user-service/`, run `npm run build` and `npm run typecheck`. Run database tests with
`TEST_DATABASE_URL` set to a **disposable PostgreSQL superuser URL** and `npm test`; integration
cases are skipped when it is unset. Tests create and drop isolated databases.

For `npm run test:e2e`, first build both User and Credit services and install both services'
dependencies. Set `TEST_DATABASE_URL` and `KAFKA_BROKERS` to isolated test infrastructure with
the five topics from `kafka/create-topics.sh` provisioned. Never point this test at a shared
broker: it starts a real Credit Service with the `credit-service` consumer group. It checks
HTTP registration while Kafka is unreachable, outbox recovery after restart, the initial credit
grant, suspend/restore, reservation results, and replay protection. The broker's advertised
listener must be reachable from the host running the tests.

## Rules for changing this service

Teammates (and their AI tools) are welcome to send PRs here. The User Service owner reviews
everything under `user-service/`. These rules aren't obvious from any single file:

1. **Start from the template:** `src/examples/exampleRoute.ts` shows the house pattern and lists
   every step (mounting the router, both gateways, migrations, README).
2. **Migrations:** never edit or delete a merged file in `migrations/`. Add the next numbered
   file, and grant `user_app` only the access the code needs (it gets nothing by default).
3. **Configuration:** environment variables are read only in `src/config.ts`.
4. **Roles and account status** change only through `runAdminAction()` (`src/roles.ts`). It holds
   the shared admin-actions lock, re-checks the acting admin, and writes the audit entry in the
   same transaction (`appendAudit()`). Never `UPDATE users SET role/status` directly.
5. **Audit log:** append-only. Never change the hash recipe (`"v1"` in `src/audit.ts`) or the
   table's grants. Don't store names or emails in it, only ids.
6. **Errors:** always `{ error, message, details? }`. Don't catch database errors in routes: the
   handler in `src/index.ts` turns outages into **503, never 401** (a 401 logs users out).
7. **`GET /auth/verify` is a contract** with every other service: `{ id, role }` for a valid
   login, 401 only for a missing, invalid or expired login, 503 during outages. Changing it
   affects Supplier, Order and Credit.
8. **Privacy and secrets:** never return email addresses to other users, never log passwords,
   keys, tokens or the database URL.
9. **Before opening a PR:** run `docker compose up -d --build`, then
   `./supplier-service/scripts/api-demo/run-all.sh` (needs `jq`) and
   `docker compose exec user-service npm run audit:verify`.
10. **AI use:** put **your** name in the file headers you write and add your own entry to
    `ai/usage-log.md`.

## Endpoints

Paths below are the **public** paths through the gateway (`http://localhost:8080`).
The gateway strips `/api/v1` before forwarding.

| Method and path | Who | What |
| --- | --- | --- |
| `POST /api/v1/auth/register` | anyone | `{ username, email, password }` → new MEMBER account |
| `POST /api/v1/auth/login` | anyone | `{ identifier, password }` (username or email) → `{ accessToken, tokenType, expiresIn }` |
| `GET /api/v1/whoami` | logged in | → `{ username, displayName, role }` of the caller |
| `PATCH /api/v1/whoami` | logged in | `{ displayName }` (1–50 chars). Other fields are ignored. Missing displayName → no change |
| `PUT /api/v1/users/{id}/role` | ADMINISTRATOR | `{ role: "MEMBER" \| "ADMINISTRATOR", reason? }`. Same role → no change. Promotion only for ACTIVE accounts; demotion for ACTIVE or SUSPENDED |
| `POST /api/v1/users/{id}/suspend` | ADMINISTRATOR | `{ reason }` (required). ACTIVE → SUSPENDED; their existing logins stop working at once |
| `POST /api/v1/users/{id}/restore` | ADMINISTRATOR | `{ reason }` (required). SUSPENDED → ACTIVE |
| `GET /api/v1/admin/accounts` | ADMINISTRATOR | Accounts, newest first: `{ id, username, displayName, email, role, status, createdAt, lastLoginAt }`. `search` (part of username, email or display name, any case, max 100 chars), filters `status`, `role`; paging `?before=<nextCursor>`, `limit` (default 50, max 100). `lastLoginAt` is the newest SUCCESS in the login log (so at most 90 days back), else null |
| `GET /api/v1/admin/accounts/{id}` | ADMINISTRATOR | One account, same fields; 404 `USER_NOT_FOUND` |
| `GET /api/v1/admin/audit` | ADMINISTRATOR | Audit entries, newest first, each with its `hash` and `previousHash` (the link to the entry before). Filters `targetId`, `actorId`, `action`; paging `?before=<nextCursor>`, `limit` (default 50, max 200) |
| `GET /api/v1/admin/audit/verify` | ADMINISTRATOR | Checks the hash chain → `{ valid, checkedEntries, firstInvalidId, latestHash }` |
| `GET /api/v1/admin/login-events` | ADMINISTRATOR | Login attempts, newest first. Filters `accountId`, `outcome`, `reason`; paging `?before=<nextCursor>`, `limit` (default 50, max 100). Without `accountId`, attempts on unknown usernames are included |
| `GET /auth/verify` | **other services only** (not exposed by the gateway) | → `{ id, role }` for the bearer token |
| `GET /health` | Docker healthcheck, other services (not exposed by the gateway) | Readiness: 200 `{ "status": "ok" }` if the database answers within 1 s, else 503 `{ "status": "not_ready" }` |

"Logged in" = `Authorization: Bearer <accessToken>`. Roles are re-read from the database on
every request, so role changes apply immediately. Concurrent role changes are serialised
with a database lock (`src/roles.ts`).

### Error responses

All errors look like `{ "error": "CODE", "message": "...", "details"?: { field: reason } }`.

| Status | When |
| --- | --- |
| 400 `VALIDATION_FAILED` | Bad input; `details` says which field |
| 401 `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | No or invalid or expired token, account not active, wrong login |
| 403 `FORBIDDEN` | Logged in but not allowed (e.g. a member calling an admin route) |
| 403 `CANNOT_CHANGE_OWN_ROLE` | An admin tried to change their own role |
| 403 `ACCOUNT_SUSPENDED` / `ACCOUNT_PENDING_VERIFICATION` | Correct password but the account can't log in |
| 404 `USER_NOT_FOUND` | No account with that id |
| 409 `USERNAME_TAKEN` / `EMAIL_TAKEN` | Registration clashes with an existing account |
| 409 `LAST_ADMINISTRATOR` | The change would leave no ACTIVE administrator |
| 403 `CANNOT_SUSPEND_SELF` | An admin tried to suspend their own account |
| 409 `INVALID_STATUS_TRANSITION` | The action isn't possible for the account's status (e.g. suspending a CLOSED account, promoting a SUSPENDED one) |
| 503 `SERVICE_UNAVAILABLE` | The database is temporarily unreachable; try again later. Never 401, so callers don't log users out |

## Configuration

See the repository `.env.example`. The first administrator is created at startup from
`BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, and only
if no administrator exists yet.
All settings are read in one place, `src/config.ts`.

## Database

PostgreSQL in the `user-db` container, data in the `user-db-data` volume (kept across
`docker compose down`/`up`; deleted only by the reset script or `down -v`).

| Role | Used by | Can do |
| --- | --- | --- |
| `user_bootstrap` | the init script (`docker/postgres/init-roles.sh`), once, on a new volume | Superuser. No service connects as it |
| `user_migrator` | `user-migrate` (`src/migrate.ts`) | Owns the database and tables; creates and changes them |
| `user_app` | `user-service` | Only the row access each migration grants it |

The passwords come from `.env` (`USER_DB_ADMIN_PASSWORD`, `USER_DB_MIGRATION_PASSWORD`,
`USER_DB_APP_PASSWORD`).

### Migrations

`docker compose up` runs `user-migrate` first. It applies the new files in `migrations/`
in number order, each in its own transaction, then exits. `user-service` starts only if
it succeeded.

To change the schema, **add a new file**, e.g. `migrations/0002_add_audit_log.sql`:
- Number it one higher than the last file; lowercase name with underscores.
- Grant `user_app` exactly the access it needs on any table you create (it gets nothing by default).
- **Never edit or delete a file after it is merged.** The runner stores each applied
  file's checksum and refuses to run if one changes. Fix mistakes with a new migration.

### Resetting your local database

```bash
bash user-service/scripts/reset-db.sh        # asks first; --yes to skip the question
```

Deletes only the User Service's data and starts it again. Use this, **not**
`docker compose down -v`, which also deletes every other service's data.
You need it once after pulling the change that introduced migrations: the service will
refuse to start on an older database and tell you to run it.

### When the database is unavailable

Timings are in `src/config.ts` (`DB_RESILIENCE`).

- **At startup**, `user-service` and `user-migrate` retry the connection (0.5 s, 1 s, 2 s, 4 s,
  then every 5 s) for up to 60 s. `user-migrate` never re-runs a migration that failed.
- **While running**, requests get `503 SERVICE_UNAVAILABLE` (within 0.5 s) instead of
  crashing the service; it recovers on its own when the database is back. The log shows one
  line when the database goes away and one when it is back.
- **On `docker compose stop`**, in-flight requests finish and connections close (8 s limit).

**Deployment note:** `restart: unless-stopped` plus the 60 s startup retries means the
service retries **forever** while the database stays unreachable, with each failure
visible in `docker compose ps` and the logs. That's intended for local Compose; revisit it
(e.g. alerting on repeated restarts) before any cloud deployment.

## Login events (admin evidence log)

Every call to `POST /auth/login` that has an `identifier` and `password` writes one row to
`login_events` (migration `0004`). Each row has two labels:

| What happened (`outcome`) | Why (`reason`) |
| --- | --- |
| `SUCCESS` | none |
| `FAILED` | `WRONG_PASSWORD`, or `NO_SUCH_ACCOUNT` (no account is attached to the row) |
| `BLOCKED` (password was right, account may not log in) | `SUSPENDED`, `CLOSED`, `NOT_VERIFIED` |

- **Also stored:** time, account (when there is one), IP address, user agent (cut to 500
  characters). **Never stored:** what the user typed in the username or password field.
- **Users see the same answers as before.** A correct password on a CLOSED account still gets the
  generic 401; only the log says `BLOCKED / CLOSED`.
- **If the record cannot be saved:** a `SUCCESS` is refused with 503 (nobody gets in without a
  record); a `FAILED` or `BLOCKED` attempt is rejected as usual and the error goes to the
  service log. An IP that does not parse is saved as empty and never stops a login.
- **Append-only for the service:** `user_app` has INSERT and SELECT only. Old rows are removed by
  the stored function `purge_old_login_events()` (owned by the migration role, `user_app` may
  only execute it), which deletes rows older than 90 days.
- **Cleanup schedule:** a timer inside the service runs it once at startup, then once a day.
  Several copies of the service may all run it; the repeat runs find nothing to delete.
- **Speed limit:** the gateway (`frontend/nginx.conf`) allows 30 login attempts per minute per
  client IP (one every 2 s) plus a burst of 30 at once (about 61 in the first minute), then
  answers 429 with `{ "error": "TOO_MANY_REQUESTS", "message": "..." }`, which the login page
  shows. Sized so the team's demo scripts fit when run back to back (tested 2026-11-08 through
  the gateway: Supplier `api-demo/run-all.sh` 19 logins, `order-service/scripts/demo.sh` 4, the
  User Service D3 demo 9; all passed, no 429). To show the limit, send 40+ attempts quickly.

Known limitations (measured on the local Compose stack, 2026-11-08):

- The speed limit only applies to calls through the gateway. Port 3001 is also published, so a
  caller who goes to the service directly skips it.
- Attempts refused with 429 never reach the service, so they are not in the log.
- **Locally, everyone shares one speed-limit bucket.** Docker Desktop delivers all host traffic
  to nginx from one address (the Docker network gateway, e.g. `172.19.0.1`). Browser logins and
  scripts on the same machine count together: 80 rapid attempts gave 44 accepted, 36 refused.
- **Client IP is not settled yet.** Express's "trust proxy" is not set, so behind nginx the IP
  stored is nginx's own address (e.g. `::ffff:172.19.0.10`), not the user's. Direct calls to
  3001 store the caller's address; a forged `X-Forwarded-For` header is ignored. Needs a team decision.
- **Login bursts:** a successful login now needs a second database call (the record) after the
  password check. Under a burst this call can hit the existing 500 ms connection limit, and the
  login is refused with 503 (by design: no record, no login). Compared with the code before this
  change, the total number of 503s in a burst did not measurably change (5 rounds each of 8 and
  16 simultaneous logins), but some 503s now come from this call.
- Not built yet: checkpoints of this table in the audit chain, and users seeing their own history.

## Suspension and the audit log

**Suspend/restore** (repeating an action is a harmless success with no new audit entry):

| Current status | suspend | restore |
| --- | --- | --- |
| ACTIVE | → SUSPENDED | 200, no change |
| SUSPENDED | 200, no change | → ACTIVE |
| PENDING_VERIFICATION, CLOSED | 409 | 409 |

Role changes, suspend and restore all queue on one database lock, and the acting admin is
re-checked after waiting, so two admins can't, for example, suspend each other at the same moment.

**Reasons** are required for suspend/restore and optional for role changes (1–500 characters).
Audit entries are permanent, so **describe the evidence (e.g. order or report IDs), not
personal details**. Other audit columns hold only ids; usernames are looked up when read.

**The audit log** (`audit_log`, migration `0002`) records role changes, suspensions,
restorations and first-admin creation, each in the same transaction as the change (if the
entry can't be saved, nothing changes). Rejected attempts are not audit entries; they appear
in the application log as `admin.action.rejected` lines.

- **Append-only:** the service's database role can only INSERT and SELECT on it.
- **Hash chain:** each entry stores `HMAC-SHA256(AUDIT_HMAC_KEY, prev_hash + "\n" + JSON of its
  fields)`, starting from 64 zeros (recipe in `src/audit.ts` and the migration). Editing,
  inserting or deleting an entry in the middle breaks the chain from that entry on.
- **Checking:** `GET /api/v1/admin/audit/verify`, or
  `docker compose exec user-service npm run audit:verify` (exit code 1 if broken). It re-reads
  the whole log each time, which is fine at this project's scale.
- **Anchoring:** every append also writes `audit.appended {"id":…,"hash":…}` to the
  application log. Comparing these with `latestHash` reveals deleted newest entries.

**Limits (by design, documented):**
- Deleting the newest entries is only detectable against the `audit.appended` log lines, and
  container logs aren't durable storage: a checkpoint, not a guarantee.
- Someone with both the key and database superuser access can rewrite everything.
- The application log (including rejected attempts) is not tamper-evident.
- The key must not change: there is no key rotation (the `"v1"` tag in the recipe is where it
  would be added). `AUDIT_HMAC_KEY` is required, and the service refuses to start without a
  valid one.
- Databases created before migration `0002` have no entry for their first administrator.

### Known limitations

**Login bursts slow everything else down** (measured 2026-10-09, cold connection pool,
3 parallel `/auth/verify` callers during the burst):

| Burst | Before the 500 ms pool timeout | With it (current) |
| --- | --- | --- |
| 8 simultaneous logins | all 200; median 2.8–3.3 s | 1–3 of 8 get 503; median 1.4–1.7 s |
| `/auth/verify` during those 8 | 3–4 per burst over 1 s | 3–5 per burst over 1 s; 1–2 get 503 |
| 16 simultaneous logins | all 200; median 5.6–7.6 s | 1–4 of 16 get 503; median 3.0–3.9 s |

- **Cause:** `bcryptjs` (cost 12, about 0.3 s per hash) runs on Node's single main thread. The
  code already uses the async `compare`/`hash`, but bcryptjs's async versions only yield
  between chunks; the work stays on the main thread. Everything else in the process,
  including `/auth/verify` and opening database connections, waits its turn.
- **Effect on Supplier:** it gives up on `/auth/verify` after 1 s, so during a login burst
  some Supplier requests get 503, before and after the timeout change alike.
- **Effect of the 500 ms timeout:** some logins fail fast with 503 instead of waiting; the log
  then says "No database connection within 500 ms (database down, or this service busy…)".
- **Not done (options for later):** a password library that hashes off the main thread (e.g.
  native `bcrypt`, which also reads existing bcryptjs hashes), Node worker threads, or
  keeping more pool connections open. Raising the 500 ms timeout is ruled out: it must stay
  under Supplier's 1 s so callers see our 503.

### Troubleshooting

`docker compose up` only says that a step failed. The reason is in that step's log:

```bash
docker compose logs user-migrate
```

| You see (in `docker compose up` or the log) | Cause | Fix |
| --- | --- | --- |
| `service "user-migrate" didn't complete successfully: exit 1` | The migration step failed; `user-service` is not started | Read `docker compose logs user-migrate` and match the line below |
| `Could not log in as the migration role` / `This database was created before migrations were introduced` | Your local user database is from before migrations (the D2 setup) | `bash user-service/scripts/reset-db.sh` (deletes local User Service accounts only) |
| `required variable USER_DB_..._PASSWORD is missing a value` | `.env` lacks the User Service database passwords | Add the three `USER_DB_*_PASSWORD` lines from `.env.example` with random values (`openssl rand -hex 16`) |
| `Applied migration ... has been edited` | A merged migration file was changed | Undo the edit (`git checkout -- user-service/migrations/`) and put the change in a new numbered file |
| `Applied migration ... is missing` / `Two migrations share the number` / `Unexpected file in migrations/` | A migration was deleted, two branches used the same number, or a non-migration file is in `migrations/` | Restore the deleted file, renumber your new file, or move the extra file out |
| `<file> failed and was rolled back: ...` | The SQL in a new migration has an error; nothing from that file was applied | Fix the SQL in that (not yet merged) file and run `docker compose up -d` again |
| `permission denied for table ...` in `docker compose logs user-service` | A migration created a table without granting `user_app` access | Add a new migration with the needed `GRANT ... TO user_app` |
| `AUDIT_HMAC_KEY must be at least 32 random bytes` or `required variable AUDIT_HMAC_KEY is missing a value` | `.env` lacks the audit key, or it's too short | Add `AUDIT_HMAC_KEY=` with the output of `openssl rand -hex 32`. Never change it afterwards |
| `error mounting ... 010-user-roles.sh ... no such file or directory` when starting `user-db` (Docker Desktop on WSL) | The `user-db` container was created before git replaced `docker/postgres/init-roles.sh` (e.g. after switching branches); the container still points at the old file | `docker compose up -d --force-recreate user-db` (keeps your data; the volume is untouched) |
