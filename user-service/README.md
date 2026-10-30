# User Service — Friend on Campus (FoC)

Accounts, login/logout, profile management, role-based access control, and
OTP email verification (FR F1–F4).

- **Agent rules & conventions:** [`AGENTS.md`](./AGENTS.md)

## Stack

Node.js + TypeScript · Express (REST) · `@grpc/grpc-js` (internal RPC) ·
Prisma + PostgreSQL · zod · bcrypt.

## Prerequisites

- **Node.js 20+** and npm
- **Docker Desktop** (for PostgreSQL) — must be running

This service owns its **own database** — it does not share Postgres with the
other services. Everything below runs against a Postgres container defined in
this folder's `compose.yaml`.

---

## Setup — pick one path

There are two ways to run this service. Choose based on what you're doing.

> **First-time only — generate the JWT signing keys** (both paths need them; they
> are git-ignored and never committed):
>
> ```bash
> npm run keys:generate
> ```
>
> This creates `keys/private.pem` (this service signs tokens with it — keep it
> secret) and `keys/public.pem` (other services verify tokens with it — safe to
> share). The service refuses to boot if the keys are missing. See
> [Integrating with this service](#integrating-with-this-service-other-services).

### Path A — Quick run ("just start it") 🚀

Use this when you just want the service **up and running** (e.g. to try it, demo
it, or work on another service that calls it). Everything runs in Docker; Node
is only needed once, to generate the JWT keys.

```bash
cp .env.example .env    # first time only; compose reads the POSTGRES_* values
docker compose up --build
```

That starts Postgres and waits until it's healthy, then runs the one-off
`user-migrate` job, which **applies database migrations**. The service starts
only after that job succeeds. When it's ready you'll have:

- REST API on <http://localhost:3001>
- gRPC on `localhost:50051`

Stop it with `Ctrl+C`, or wipe everything (including the database) with
`docker compose down -v`.

This runs User Service on its own. To run the whole FoC stack, see the
[root README](../README.md#run-the-whole-stack-docker).

On a fresh database, create the first admin next — see
[Administrator accounts](#administrator-accounts).

> **Note:** the JWT keys are not baked into the image — compose mounts your local
> `keys/` folder into the container (read-only). Run `npm run keys:generate`
> first (see above), otherwise the container exits at boot with
> "Cannot read JWT_PRIVATE_KEY_PATH".

> **Note:** this path applies migrations that are already committed in
> `prisma/migrations/`. It does **not** create new ones — that's a dev task
> (Path B, step 4).

### Path B — Dev setup (hot reload, for writing code) 🛠️

Use this when you're **developing** the service. Only Postgres runs in Docker;
the app runs on your machine so it **hot-reloads on every save** and is easy to
debug.

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file (edit values if needed)
cp .env.example .env

# 3. Generate the JWT signing keys (first time only; required to boot)
npm run keys:generate

# 4. Start ONLY the database
docker compose up -d user-db

# 5. Create + apply the database schema
#    (first time, Prisma asks for a migration name — use "init")
npm run prisma:migrate

# 6. Build the shared messaging package (first time, and after it changes)
npm run build --prefix ../shared/messaging

# 7. Run the service with hot reload (starts REST + gRPC)
npm run dev
```

Leave `npm run dev` running; edit files and it restarts automatically. Stop with
`Ctrl+C`. The Postgres container keeps running in the background — stop it with
`docker compose stop user-db` when you're done for the day.

On a fresh database, create the first admin next — see
[Administrator accounts](#administrator-accounts).

---

## Verify it works

With the service running (either path), in another terminal:

```bash
curl -i http://localhost:3001/health
```

- **`200 { "status": "ok", "db": "up" }`** → all good: server is up and the
  database is reachable.
- **`503 { "status": "degraded", "db": "down" }`** → the server is running but
  can't reach Postgres (see Troubleshooting).

The health check deliberately pings the database, so a `200` means the DB
connection genuinely works — not just that the web server started.

---

## Authentication & Authorization

Login issues two tokens:

- **Access token** — a short-lived (15m) **stateless RS256 JWT** carrying the
  user's id (`sub`) and `roles`. Returned in the response body; sent as
  `Authorization: Bearer <token>` on every API call, to any service.
- **Refresh token** — a long-lived (7d) opaque random string, set as an
  **httpOnly cookie** (`refreshToken`, path `/users`). Only user-service ever
  sees it; it is used solely to get a new access token or to log out.

Protected routes run two middlewares: `authenticate` (verifies the access token →
`401` if missing/invalid) then `requireRole(...)` (checks role claims → `403` if
not allowed). Roles: `USER` (default) and `ADMINISTRATOR`.

| Method | Route              | Access                | Purpose                                         |
| ------ | ------------------ | --------------------- | ----------------------------------------------- |
| POST   | `/users/register`  | public                | Create an account (F1)                          |
| POST   | `/users/login`     | public                | Verify credentials → access token + refresh cookie |
| POST   | `/users/refresh`   | refresh cookie        | Rotate refresh cookie → new access token        |
| POST   | `/users/logout`    | refresh cookie        | End this browser's session (F2.2) → `204`       |
| GET    | `/users/me`        | any authenticated     | Own profile (F2.3)                              |
| PATCH  | `/users/me`        | any authenticated     | Update own first/last name, username (F2.4)     |
| GET    | `/users`           | `ADMINISTRATOR`       | List all users                                  |
| GET    | `/users/:id`       | `ADMINISTRATOR`       | View a specific user                            |
| POST   | `/users/:id/admin` | `ADMINISTRATOR`       | Grant the Administrator role (F3.3)             |
| DELETE | `/users/:id/admin` | `ADMINISTRATOR`       | Revoke the Administrator role (F3.3, F3.2)      |

Quick demo (service running on `:3001`):

```bash
# log in → capture the token (run as ONE line)
TOKEN=$(curl -sX POST localhost:3001/users/login -H 'Content-Type: application/json' -d '{"email":"you@u.nus.edu","password":"YourPassw0rd!"}' | sed 's/.*"token":"//;s/".*//')

curl -i localhost:3001/users/me                              # no token   → 401
curl -i localhost:3001/users/me -H "Authorization: Bearer $TOKEN"   # valid   → 200
curl -i localhost:3001/users    -H "Authorization: Bearer $TOKEN"   # USER    → 403 (admin only)
```

Responses only ever include public fields — `passwordHash` is never returned.
To get an admin account, see [Administrator accounts](#administrator-accounts).

### Administrator accounts

> **Upgrading from before F3?** Admins used to be created by setting `roles` in
> Prisma Studio. Don't do this anymore, because it skips the last-admin check and the
> audit record, and can leave accounts without the `USER` role. Reset your local database once
> (see [Reset the database completely](#reset-the-database-completely)), then
> create your admin with the command below.

**Creating the first admin.** Run once per **database** (not per container or
pod — they all share the same DB), from an interactive terminal:

```bash
npm run admin:create:dev                                        # Path B (local)
docker compose exec user-service npm run admin:create           # Path A (container)
kubectl exec -it deploy/user-service -- npm run admin:create    # Kubernetes
```

It prompts for email, username, name and password (hidden, typed twice), applies
the same validation as `/users/register`, and creates an account with both
`USER` and `ADMINISTRATOR`. Once that succeeds the system is **initialized**:
re-running changes nothing, even if that admin is later revoked. The password is
never accepted as an argument or env var. (The container must be built from a
version that includes the script — rebuild with `docker compose up --build`.)

**Granting and revoking.** Only an active admin can call these; both take the
target user's id and no body, and both are idempotent (repeat → `200`, no change):

| Request                   | Result                                                                   |
| ------------------------- | ------------------------------------------------------------------------ |
| `POST /users/:id/admin`   | `200` + profile — adds `ADMINISTRATOR`; `USER` is kept                   |
| `DELETE /users/:id/admin` | `200` + profile — removes `ADMINISTRATOR`; `USER` is kept                |
| caller isn't an admin     | `403` — nothing changes                                                  |
| unknown or deleted user   | `404`                                                                    |
| would remove the last admin | `409` `Cannot revoke the last remaining active administrator.`         |

```bash
curl -i -X POST   localhost:3001/users/<userId>/admin -H "Authorization: Bearer $TOKEN"
curl -i -X DELETE localhost:3001/users/<userId>/admin -H "Authorization: Bearer $TOKEN"
```

Rules worth knowing:

- **There is always at least one active admin.** Admin changes run one at a
  time (a database lock), so two admins revoking each other at once can't leave
  zero. Admins may revoke themselves unless they are the last one.
- **The caller is re-checked in the database**, not just from their token — a
  just-demoted admin's token still says admin for up to 15m, but is refused here.
- **The target's token updates on their next login or refresh** (≤15m).
- **Every change is recorded** in the `AdminRoleChange` table (who, whom,
  grant/revoke, when); the first admin's row has no actor.
- **Never edit roles directly in the database / Prisma Studio** — that skips the
  lock, the last-admin check and the audit record.

### Sessions: refresh & logout

Each login creates **one session row** (`RefreshToken` table, one per
browser/device) that lives for the whole session. Only the SHA-256 **hash** of
the refresh token is stored, so a database leak exposes no usable sessions.

- **Refresh** (`POST /users/refresh`) — **rotates** the token: a new one is
  issued on the same session row and the old one stops working, so each refresh
  token works only once. The new access token carries the user's **current**
  roles from the database. Each refresh extends the session by another 7 days
  (sliding expiry). Fails with `401` if the token is missing, expired or revoked
  (and clears the cookie) — or if another tab rotated it a moment ago (cookie
  left alone, since the browser already holds the newer one).
- **Logout** (`POST /users/logout`) — ends this browser's session and clears
  the cookie. Always returns `204` (safe to call twice). Other devices stay
  logged in. It also works with the token that was *just* rotated away, so a
  logout racing a background refresh still ends the session.
- **Cleanup:** each login first deletes that user's ended sessions (logged out
  or expired), so the table doesn't grow without bound.
- **Why one row per session:** refresh, logout and re-login all update that
  single row, so Postgres's row lock makes concurrent requests on one session
  run one after another — none can leave a live token behind.
- **Logging in again** on a browser that still has a session revokes the old
  session first.

**Revocation trade-off:** an access token can't be revoked — other services
verify it locally, with no call to user-service. After logout (or a role
change), an existing access token stays valid until it expires (≤15m). Logout
still ends the session immediately, since no new access tokens can be minted.
Every access token carries a `jti` claim, so a denylist can be added later
(e.g. behind an API gateway or shared Redis) without changing the token format.

Try it with curl (`-c` saves cookies to a file, `-b` sends them, like a browser):

```bash
curl -i -c cookies.txt -X POST localhost:3001/users/login -H 'Content-Type: application/json' -d '{"email":"you@u.nus.edu","password":"YourPassw0rd!"}'
curl -i -b cookies.txt -c cookies.txt -X POST localhost:3001/users/refresh   # 200, new token + rotated cookie
curl -i -b cookies.txt -c cookies.txt -X POST localhost:3001/users/logout    # 204, cookie cleared
curl -i -b cookies.txt -X POST localhost:3001/users/refresh                  # 401, session ended
```

(`cookies.txt` holds a live session — it's git-ignored; delete it when done.)

### Frontend integration

- Keep the access token **in memory** (not `localStorage`). The refresh cookie is
  httpOnly — the browser stores and sends it automatically; JS never touches it.
- Send `credentials: 'include'` (fetch) / `withCredentials: true` (axios) on
  `/users/login`, `/users/refresh` and `/users/logout`, or the cookie won't be
  stored/sent.
- **On app start / page reload:** call `POST /users/refresh`. `200` → logged in
  (store the new access token). `401` → show the login page.
- **On any `401` from an API call:** call `/users/refresh` once, then retry the
  original request with the new token. If refresh also fails → login page.
- **If `/users/refresh` returns `401`, retry it once** before giving up. Two tabs
  refreshing at the same moment race on the same token; the loser gets `401`,
  but the browser already holds the winner's new cookie (the server deliberately
  doesn't clear it in that case).
- **Recommended:** share one in-flight refresh per tab ("single-flight") — if
  several requests hit `401` at once, they all await the same `/users/refresh`
  call instead of each starting their own.
- **On logout:** call `POST /users/logout`, then drop the in-memory access token.
- If the UI is served from a different origin than this API, user-service will
  need CORS with `credentials: true` and an explicit allowed origin (not `*`).
  Not configured yet — coordinate before deploying.

---

## Integrating with this service (other services)

Other FoC services (e.g. Supplier) authorize requests by **verifying the JWT this
service issues** — locally, with no network call back to user-service. That works
because the token is signed with our private key and anyone can verify it with our
public key.

**What you need from us:**

1. **The public key** — `keys/public.pem`. We sign with the private key (never
   shared); you verify with the public key (safe to share). Ask the user-service
   team for the current `public.pem`. *(Future: fetch it from a JWKS endpoint.)*
2. **The token contract:**
   - Algorithm: **RS256** (always pin it on verify)
   - Header: `Authorization: Bearer <token>`
   - Claims: `sub` = user id (string), `roles` = array of `"USER" | "ADMINISTRATOR"`
   - Lifetime: 15 minutes. Refresh tokens are user-service-only — your service
     never sees or handles them.

**Verify snippet (Express + `jsonwebtoken`):**

```ts
import jwt from 'jsonwebtoken';
import fs from 'node:fs';

const PUBLIC_KEY = fs.readFileSync(process.env.USER_SERVICE_PUBLIC_KEY_PATH!, 'utf8');

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), PUBLIC_KEY, { algorithms: ['RS256'] }); // pin RS256
    req.user = { id: payload.sub, roles: payload.roles };                                // same contract
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export const requireRole = (...allowed: string[]) => (req, res, next) =>
  req.user?.roles?.some((r: string) => allowed.includes(r))
    ? next()
    : res.status(403).json({ error: 'Forbidden' });
```

Apply it where a route needs protection:

```ts
router.post('/supplier', authenticate, requireRole('ADMINISTRATOR'), createSupplier);
```

**Test end to end** (user-service on `:3001`, your service on e.g. `:3002`):

```bash
TOKEN=$(curl -sX POST localhost:3001/users/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}' | sed 's/.*"token":"//;s/".*//')
curl -i -X POST localhost:3002/supplier -H "Authorization: Bearer $TOKEN"   # 401 none / 403 USER / 200 ADMIN
```

> **End-state:** once a second service consumes this, the verify logic + contract
> types should move into a shared `@foc/auth` workspace package (single source of
> truth, no drift). For now, copy the snippet above.

### Fetching a user's public profile (gRPC)

To show a user's name (e.g. on an errand), call `GetPublicProfile` instead of
reading our database (F2.6). It returns **public fields only** — never email,
roles or auth data.

- **Address:** `localhost:50051` (plaintext for now — internal traffic only)
- **Contract:** [`proto/user.proto`](./proto/user.proto) — copy it into your service
- **RPC:** `user.UserService/GetPublicProfile`
  - Request: `{ user_id }`
  - Response: `{ user_id, username, first_name, last_name }`
  - Errors: `INVALID_ARGUMENT` (empty `user_id`), `NOT_FOUND` (unknown or
    deleted user), `INTERNAL` (unexpected failure)

No JWT is needed — this is service-to-service, not called by end users.

Try it with [`grpcurl`](https://github.com/fullstorydev/grpcurl) (`brew install grpcurl`):

```bash
grpcurl -plaintext -import-path proto -proto user.proto \
  -d '{"user_id":"<user id>"}' \
  localhost:50051 user.UserService/GetPublicProfile
```

---

## Troubleshooting

### `P1010: User was denied access` / health returns `db: down`

Almost always a **port 5432 conflict**: you already have a local Postgres (e.g.
Homebrew `postgresql@14`) running, so connections to `localhost:5432` hit *that*
instead of this service's container.

Check what's on the port:

```bash
lsof -nP -i :5432
```

If you see a non-Docker `postgres` process, either:

- **Stop your local Postgres** (keeps the standard port):
  ```bash
  brew services stop postgresql@14   # adjust the version to match yours
  ```
- **or** change the database's host port in `compose.override.yaml` to
  `"5435:5432"` and update `DATABASE_URL` in `.env` to use `:5435` (5433 and
  5434 are taken by Credit and Order).

### `docker compose` can't connect / "Cannot connect to the Docker daemon"

Docker Desktop isn't running. Start it and wait for it to finish booting.

### Reset the database completely

```bash
docker compose down -v   # removes the Postgres data volume
docker compose up -d user-db
npm run prisma:migrate
```

---

## Scripts

| Command                   | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `npm run dev`             | Start REST + gRPC with hot reload (`tsx`)     |
| `npm run keys:generate`   | Generate the RS256 JWT keypair into `keys/`   |
| `npm run build`           | `prisma generate` + compile TypeScript        |
| `npm start`               | Run the compiled build (`dist/`)              |
| `npm run prisma:migrate`  | Create & apply a migration (`migrate dev`)    |
| `npm run prisma:generate` | Regenerate the Prisma client                  |
| `npm run format`          | Format code with Prettier                     |
| `npm run admin:create`    | Create the first admin (compiled; in the container) |
| `npm run admin:create:dev`| Create the first admin (local, via `tsx`)     |

## Environment variables

Copy `.env.example` → `.env`. `.env` is gitignored — never commit real secrets.

| Variable       | Purpose                          | Default (local)     |
| -------------- | -------------------------------- | ------------------- |
| `DATABASE_URL`         | Postgres connection string           | see `.env.example`   |
| `PORT`                 | REST (Express) port                  | `3001`               |
| `GRPC_PORT`            | gRPC port (internal profile RPC)     | `50051`              |
| `JWT_PRIVATE_KEY_PATH` | RS256 private key (signs tokens)     | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH`  | RS256 public key (verifies tokens)   | `./keys/public.pem`  |
| `JWT_EXPIRES_IN`       | Access-token lifetime                | `15m`                |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token (session) lifetime, days | `7`                |
| `NODE_ENV`             | `production` marks the refresh cookie `Secure` (HTTPS-only) | `development` |
| `RABBITMQ_URL`         | Broker the outbox publishes `user.created` to | `amqp://guest:guest@localhost:5672` |
| `OUTBOX_POLL_INTERVAL_MS` | How often the outbox dispatcher checks for unsent events | `1000` |
| `OUTBOX_BATCH_SIZE`    | Max events the dispatcher sends per poll | `50` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Read by `compose.yaml` to create the database (not by the app) | see `.env.example` |

## Architecture

The HTTP API is layered so each file has one job. A request flows through the
layers top to bottom:

```text
Request → routes → middleware → controller → service → Prisma → Postgres
          (which    (validate    (HTTP glue:  (business  (data
           handler)   input,       call         logic)     access)
                      400 if bad)  service,
                                   shape reply)
```

- **routes** — map a URL to a handler. No logic.
- **middleware** — runs before the controller (e.g. validate the body against a
  DTO schema; reject with `400` if invalid).
- **dto** — zod schemas defining valid API input/output shapes (kept separate
  from the Prisma DB model, so internal fields like `passwordHash` never leak).
- **controller** — thin HTTP layer: read the validated request, call a service,
  translate the result into a response + status code.
- **service** — the business logic (uniqueness checks, hashing, create). It has
  no knowledge of HTTP, so it can be reused (e.g. by the gRPC handler later).

## Project layout

```text
user-service/
├── prisma/
│   ├── schema.prisma      # User, RefreshToken, SystemBootstrap, AdminRoleChange
│   └── migrations/        # versioned schema history — commit these
├── proto/user.proto       # internal gRPC contract (F2.6)
├── src/
│   ├── index.ts           # boots REST + gRPC
│   ├── env.ts             # zod-validated config
│   ├── db.ts              # Prisma client + DB ping
│   ├── services/          # business logic shared by REST + gRPC (DB via Prisma)
│   ├── events/            # user.created outbox: store + background dispatcher
│   ├── scripts/           # operator commands (createAdmin.ts)
│   ├── api/               # HTTP (REST) transport
│   │   ├── app.ts         #   Express app + /health, mounts routers
│   │   ├── routes/        #   path → handler wiring
│   │   ├── controllers/   #   HTTP glue (read request, call service, send response)
│   │   ├── middleware/    #   cross-cutting (e.g. zod validation)
│   │   └── dto/           #   zod schemas: API input/output shapes
│   └── grpc/server.ts     # gRPC transport
├── compose.yaml           # Postgres, migrate job and service (no published ports)
├── compose.override.yaml  # standalone only: publishes ports to localhost
└── Dockerfile
```
