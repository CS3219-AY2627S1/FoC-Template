# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| ----- | ----- |
| Chen Feng | User & Chat Service |
| Xie YingWen | Order & Cloud deployment and DevOps |
| Hwang Jihun | Supplier & Voice Assist Errand Creation Service |
| Fong Jing Xiang | Credit & Admin Service |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`, `chat-service/`, `admin-service/`, `voice-assist-service/`) lives in its own
top-level folder.

```text
.
├── .github/workflows/       # CI and cloud release workflows
├── ai/                      # Shared AI usage log
├── data/                    # Supplier seed data and images
├── deploy/aws/              # AWS deployment and monitoring configuration
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── chat-service/
├── admin-service/
├── voice-assist-service/
├── web-client/
├── compose.yaml             # Local application stack
├── system-architecture.md
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

---

## Local setup overview

The root [Compose file](compose.yaml) runs the website, User, Supplier, Order,
Credit and Chat APIs, their background workers, RabbitMQ and Mailpit. Each backend
owns a separate local Supabase PostgreSQL database. Start those five database
stacks with the Supabase CLI before starting the application containers.
No hosted Supabase project is required, and the browser never connects to
Supabase directly.

Choose [macOS](#local-setup-macos) or [Windows / PowerShell](#local-setup-windows).
Both use the same [local configuration](#shared-local-configuration).

### Prerequisites

- Git and a local checkout of this repository.
- Docker Desktop running Linux containers; `docker info` must connect.
- Node.js 22 or newer and npm, available in your terminal.
- Python 3.13, used locally for User's secret generator and Super Admin command.
  With Homebrew on macOS, `brew install python@3.13` provides `python3.13`.
  On Windows, check that `py -3.13 --version` works.
- On Windows, Docker Desktop's WSL2 backend must be available. If WSL is not
  installed, run `wsl --install` in an administrator PowerShell, restart if
  requested, then open Docker Desktop. Check `wsl --status` and `docker info`.

Docker Compose 2.24 or newer is required for optional Chat configuration files.
Each service installs its project-pinned Supabase CLI with `npm ci`. No global
Supabase CLI, `supabase init`, cloud login or project linking is needed. For
this Docker workflow, do not also start `npm run dev` or local Python APIs.

### Local database ports

| Service directory | PostgreSQL port | Studio URL | Application schema |
| --- | --- | --- | --- |
| `user-service` | `15422` | `http://localhost:15423` | `user_service` |
| `supplier-service` | `55322` | `http://localhost:55323` | `supplier_service` |
| `order-service` | `16422` | `http://localhost:16423` | `order_service` |
| `credit-service` | `16522` | `http://localhost:16523` | `credit_service` |
| `chat-service` | `17422` | Disabled | `chat_service` |
| `admin-service` (optional) | `17522` | `http://localhost:17523` | `admin_service` |

These are the ports in the committed `supabase/config.toml` files. PostgreSQL
ports are not webpages. Open Studio, select **Table Editor** and choose the
application schema; the `public` schema may be empty. Chat disables Studio,
Supabase Auth and the Data API; its database is accessed through PostgreSQL tools.

**Existing User setup on port `54322`:** before following the startup steps,
run `npx supabase stop` from `user-service/`. Change only the port in its ignored
`.env` values `DATABASE_URL` and `DATABASE_URL_DOCKER` to `15422`, retaining
their credentials and hosts. The next start reuses the saved database volume.
Do not reset the database or regenerate secrets for this port change.

## Local setup (macOS)

Use Terminal or VS Code's terminal. Start from the repository root. Wait for
each command to finish and resolve failures before continuing.

### 1. Start and migrate all five databases

```sh
docker info

cd user-service
npm ci
npx supabase start
npx supabase migration up --local

cd ../supplier-service
npm ci
npx supabase start
npx supabase migration up --local

cd ../order-service
npm ci
npx supabase start
npx supabase migration up --local

cd ../credit-service
npm ci
npx supabase start
npx supabase migration up --local

cd ../chat-service
npm ci
npx supabase start
npx supabase migration up --local
cd ..
```

The first start creates each local database and applies its committed
migrations; Supplier also loads its seed. `migration up --local` applies any
pending migrations to an existing database without resetting its data.

### 2. Generate User secrets and copy configuration templates

For a new checkout, create User's Python environment:

```sh
cd user-service
python3.13 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python scripts/generate_dev_secrets.py
cd ..
```

The generator creates the ignored `user-service/.env` and JWT keys, reading
the local database URL from Supabase. It refuses to overwrite existing files.
If your `.env` and keys are already configured, skip the generator and keep
them; do not use `--force` for an ordinary restart or pull. Reuse an existing
Python 3.13 virtual environment rather than recreating it.

Copy the other templates only when the destination does not exist:

```sh
if [ ! -f supplier-service/.env ]; then
  cp supplier-service/.env.example supplier-service/.env
fi
if [ ! -f order-service/.env.docker ]; then
  cp order-service/.env.docker.example order-service/.env.docker
fi
if [ ! -f credit-service/.env.docker ]; then
  cp credit-service/.env.docker.example credit-service/.env.docker
fi
if [ ! -f chat-service/.env ]; then
  cp chat-service/.env.example chat-service/.env
fi
```

Complete [Shared local configuration](#shared-local-configuration) before
starting Compose. The copied placeholders are not working credentials.

### 3. Bootstrap the first local Super Admin (if needed)

Set and save the three bootstrap fields described in the shared configuration,
then run from the repository root:

```sh
(cd user-service && .venv/bin/bootstrap-super-admin)
```

Skip this if your local User database already has a Super Admin. Migrations do
not automatically create one; the command refuses to create another while an
active Super Admin exists.

### 4. Start the real integrated application

If an older service-level Compose stack or local API already occupies ports
`3000`, `8000`–`8004`, `5672`, `15672` or `8025`, stop that specific stack or
process first.

```sh
docker compose --env-file user-service/.env --profile order --profile credit --profile chat up --build -d
docker compose --env-file user-service/.env --profile order --profile credit --profile chat ps
docker compose --env-file user-service/.env --profile order --profile credit --profile chat logs --tail 30 credit-consumer
```

Wait for the API health checks and the consumer's `consumer ready` log before
registering demo users. Continue with [Check the application](#check-the-application).

### Later starts and stops (macOS)

Keep the existing environments and secrets. From the repository root:

```sh
(cd user-service && npx supabase start && npx supabase migration up --local)
(cd supplier-service && npx supabase start && npx supabase migration up --local)
(cd order-service && npx supabase start && npx supabase migration up --local)
(cd credit-service && npx supabase start && npx supabase migration up --local)
(cd chat-service && npx supabase start && npx supabase migration up --local)
docker compose --env-file user-service/.env --profile order --profile credit --profile chat up --build -d
```

To stop, first finish any pending demo actions, then stop the application
containers before the databases:

```sh
docker compose --env-file user-service/.env --profile order --profile credit --profile chat stop
(cd user-service && npx supabase stop)
(cd supplier-service && npx supabase stop)
(cd order-service && npx supabase stop)
(cd credit-service && npx supabase stop)
(cd chat-service && npx supabase stop)
```

## Local setup (Windows)

Use **VS Code → Terminal → New Terminal → PowerShell** in the repository root.
These are native Windows commands, not WSL Bash commands. Do not share a
Windows `.venv` or `node_modules` with a WSL checkout. `npm.cmd` and `npx.cmd`
avoid PowerShell blocking the corresponding `.ps1` launchers; no execution-policy
change or virtual-environment activation is needed.

### 1. Start and migrate all five databases

```powershell
docker info

Set-Location user-service
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase migration up --local

Set-Location ..\supplier-service
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase migration up --local

Set-Location ..\order-service
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase migration up --local

Set-Location ..\credit-service
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase migration up --local

Set-Location ..\chat-service
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..
```

Wait for each command to finish successfully before continuing. These commands
start each service's own database; they do not start the website or APIs yet.
If the optional Vector log collector fails on your Windows installation, retry
that service's start with `npx.cmd supabase start --exclude vector`; do not
ignore a database health or migration error.

### 2. Generate User secrets and copy configuration templates

For a new checkout:

```powershell
Set-Location user-service
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e '.[dev]'
.\.venv\Scripts\python.exe scripts\generate_dev_secrets.py
Set-Location ..
```

As on macOS, skip the generator if the existing `.env` and JWT keys are already
configured. It refuses to overwrite them. Reuse a matching existing virtual
environment; do not regenerate credentials for routine startup.

Copy missing configuration files without overwriting existing ones:

```powershell
if (-not (Test-Path -LiteralPath supplier-service/.env)) {
    Copy-Item -LiteralPath supplier-service/.env.example -Destination supplier-service/.env
}
if (-not (Test-Path -LiteralPath order-service/.env.docker)) {
    Copy-Item -LiteralPath order-service/.env.docker.example -Destination order-service/.env.docker
}
if (-not (Test-Path -LiteralPath credit-service/.env.docker)) {
    Copy-Item -LiteralPath credit-service/.env.docker.example -Destination credit-service/.env.docker
}
if (-not (Test-Path -LiteralPath chat-service/.env)) {
    Copy-Item -LiteralPath chat-service/.env.example -Destination chat-service/.env
}
```

Complete [Shared local configuration](#shared-local-configuration) and **save
the files** in VS Code before continuing. Docker does not read unsaved edits.

### 3. Bootstrap the first local Super Admin (if needed)

After saving the three bootstrap fields, run from the repository root:

```powershell
Set-Location user-service
.\.venv\Scripts\bootstrap-super-admin.exe
Set-Location ..
```

Skip this if your local database already has a Super Admin. Bootstrap is an
explicit one-shot command, not a database-startup side effect.

### 4. Start the real integrated application

Stop any older service-level application stack or local process occupying the
application ports first; leave the five database stacks running.

```powershell
docker compose --env-file user-service/.env --profile order --profile credit --profile chat up --build -d
docker compose --env-file user-service/.env --profile order --profile credit --profile chat ps
docker compose --env-file user-service/.env --profile order --profile credit --profile chat logs --tail 30 credit-consumer
```

Wait for health checks and the `consumer ready` log, then use
[Check the application](#check-the-application).

### Later starts and stops (Windows)

After first-time setup, keep all existing secret files. From the repository root:

```powershell
Set-Location user-service
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..\supplier-service
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..\order-service
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..\credit-service
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..\chat-service
npx.cmd supabase start
npx.cmd supabase migration up --local
Set-Location ..
docker compose --env-file user-service/.env --profile order --profile credit --profile chat up --build -d
```

Stop application containers first, then the five databases:

```powershell
docker compose --env-file user-service/.env --profile order --profile credit --profile chat stop
Set-Location user-service
npx.cmd supabase stop
Set-Location ..\supplier-service
npx.cmd supabase stop
Set-Location ..\order-service
npx.cmd supabase stop
Set-Location ..\credit-service
npx.cmd supabase stop
Set-Location ..\chat-service
npx.cmd supabase stop
Set-Location ..
```

## Shared local configuration

This section applies to both operating systems. Edit files locally in VS Code;
never commit populated `.env` files, keys, database passwords or tokens. The root
Compose command explicitly uses `user-service/.env`, not the root `.env.example`.

| Local file | Values to configure |
| --- | --- |
| `user-service/.env` | Generated database URLs, JWT key paths, OTP secret and RabbitMQ credentials. Keep the generated values. Set bootstrap fields only when creating the first Super Admin. |
| `supplier-service/.env` | Copy `SUPPLIER_SERVICE_SHARED_SECRET` exactly from User's `.env`. The template uses Supplier's local DB; root Compose connects to it through `host.docker.internal:55322`. |
| `order-service/.env.docker` | Set its own `DATABASE_URL` and `CREDIT_SERVICE_SECRET`. Root Compose supplies User/Supplier/Credit origins and the outbox worker's RabbitMQ URL. |
| `credit-service/.env.docker` | Set its own `DATABASE_URL`, `ORDER_SERVICE_SECRET` and `INITIAL_CREDIT_ALLOCATION=20`. Root Compose supplies User's origin and the consumer's RabbitMQ URL. |
| `chat-service/.env` | Keep its own database URLs on `17422`; configure `RABBITMQ_URL`, `RABBITMQ_URL_DOCKER` and a dedicated `CHAT_SERVICE_SHARED_SECRET` matching User's `.env`. |
| `admin-service/.env.docker` | Optional Admin Dashboard profile only. Set its own `DATABASE_URL` on `17522`; root Compose supplies User's origin. See [Admin Service](#optional-admin-service). |
| `voice-assist-service/.env.docker` | Optional voice drafting profile only. Set `OPENAI_API_KEY`, or `VOICE_ASSIST_PROVIDER=fake` for a canned demo draft. No database. See [Voice Assist Service](#optional-voice-assist-service). |

The Supplier and Order-to-Credit secrets must be **different**. Generate one
random Order-to-Credit secret and copy that same value into Order's
`CREDIT_SERVICE_SECRET` and Credit's `ORDER_SERVICE_SECRET`. For example, generate
32 random bytes as hexadecimal locally with:

```sh
# macOS: keep this output private
user-service/.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))'
```

```powershell
# Windows: keep this output private
.\user-service\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Do not reuse this service secret as a database password. Do not send it to the
browser or put it in a `VITE_*` variable. The backend images install their own
Python dependencies; this Docker workflow does not require additional local
Python environments for Supplier, Order, Credit or Chat, or host `.env` files for
Order/Credit.

### Order and Credit database logins

The migrations create `order_service_app` and `credit_service_app` as **NOLOGIN**
roles with service-specific grants. Provision a separate local login inheriting
each role, once, using the **local** Studio SQL Editor as its database operator.
Generate a different random hexadecimal password for each login using the
command above; replace the placeholders before executing the SQL.

In Order Studio (`http://localhost:16423`), run:

```sql
CREATE ROLE foc_order_local LOGIN INHERIT PASSWORD 'replace-with-order-only-password';
GRANT order_service_app TO foc_order_local;
```

In Credit Studio (`http://localhost:16523`), run:

```sql
CREATE ROLE foc_credit_local LOGIN INHERIT PASSWORD 'replace-with-credit-only-password';
GRANT credit_service_app TO foc_credit_local;
```

If a working dedicated login already exists, keep its name and password; do
not recreate or rotate it. Set the corresponding ignored Docker environment
values, replacing `<password>` with that database's actual password:

```dotenv
# order-service/.env.docker
DATABASE_URL=postgresql://foc_order_local:<password>@host.docker.internal:16422/postgres

# credit-service/.env.docker (a different login/password/database)
DATABASE_URL=postgresql://foc_credit_local:<password>@host.docker.internal:16522/postgres
```

Inside Docker, `127.0.0.1` means the application container itself. Use
`host.docker.internal` to reach its separately started local database. If you
run an API directly on the host instead, its database URL uses `127.0.0.1`.
`npx supabase status` in each service directory reports that project's connection
information; keep its credential-bearing output private. Never point a service
at another service's database. Local administrative credentials used by the
User generator/Supplier template are development conveniences, not production
credential guidance.

### Chat database and service configuration

Chat's local template uses Supabase's default `postgres` username/password on
its isolated database; no extra login creation is required:

```dotenv
# chat-service/.env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:17422/postgres
DATABASE_URL_DOCKER=postgresql+asyncpg://postgres:postgres@host.docker.internal:17422/postgres
RABBITMQ_URL_DOCKER=amqp://REPLACE_WITH_RABBITMQ_USER:REPLACE_WITH_RABBITMQ_PASSWORD@rabbitmq:5672/
```

Keep an already working configuration. Copy User's existing `RABBITMQ_URL` to
Chat's native `RABBITMQ_URL`, and use the same broker username/password in the
Docker URL above. The shared broker uses port `5672`; `17425` belongs only to
the separate automated-test broker. No additional broker is needed for Chat.

Reuse User's existing `CHAT_SERVICE_SHARED_SECRET` in Chat. If neither file
has it, generate a dedicated random secret using the command above and add the
same key/value to both files. User's generator does not create this key. Keep it
different from Supplier's and Order-to-Credit's secrets.

Root Compose loads Chat's `.env` directly and selects its Docker URLs inside
the API and publisher containers. Keep User's `.env` as the single global
`--env-file` so the services' overlapping database variable names cannot mix.
Production uses a restricted Chat login inheriting `chat_runtime`; the local
`postgres/postgres` defaults are development conveniences.

### Optional Admin Service

The Admin Dashboard nice-to-have adds `admin-service`, which owns disputes and the
dashboard audit log in its own database. It runs only with the Compose `admin`
profile, so the rest of the application starts without it. Start its database,
then provision a login inheriting the NOLOGIN `admin_service_app` role in Admin
Studio (`http://localhost:17523`), as for Order and Credit:

```sh
cd admin-service
npm ci
npx supabase start
npx supabase migration up --local
cp .env.docker.example .env.docker   # Windows: Copy-Item .env.docker.example .env.docker
cd ..
```

```sql
CREATE ROLE foc_admin_local LOGIN INHERIT PASSWORD 'replace-with-admin-only-password';
GRANT admin_service_app TO foc_admin_local;
```

Set `DATABASE_URL` in `admin-service/.env.docker` to
`postgresql://foc_admin_local:<password>@host.docker.internal:17522/postgres`, then
add `--profile admin` to the Compose commands above. See the
[Admin Service README](admin-service/README.md) for native runs and tests.

### Optional Voice Assist Service

The voice-assisted errand creation nice-to-have (N3) adds `voice-assist-service`. It turns a
requester's recording into a draft of the ordinary errand form; the requester reviews it and
posts it through Order as usual. It stores nothing and has no database. It runs only with the
Compose `voice-assist` profile, and the errand form works without it.

```sh
cp voice-assist-service/.env.docker.example voice-assist-service/.env.docker
# Windows: Copy-Item voice-assist-service/.env.docker.example voice-assist-service/.env.docker
```

Set `OPENAI_API_KEY` in that file, or set `VOICE_ASSIST_PROVIDER=fake` to try the flow with a
canned draft and no OpenAI calls. Then add `--profile voice-assist` to the Compose commands
above. Browsers allow the microphone only on `localhost` or HTTPS. See the
[Voice Assist README](voice-assist-service/README.md) for native runs, tests and the evaluation.

### First Super Admin fields

In `user-service/.env`, set `BOOTSTRAP_SUPER_ADMIN_USERNAME`,
`BOOTSTRAP_SUPER_ADMIN_EMAIL` and `BOOTSTRAP_SUPER_ADMIN_PASSWORD`, then **save**.
Use a username without spaces and an email ending in `@u.nus.edu`. The password
must be 12–72 characters from at least three of uppercase letters, lowercase
letters, digits and symbols; supported symbols are `!@#$%^&*()-_=+?.`.
`BOOTSTRAP_SUPER_ADMIN_DISPLAY_NAME` is optional. Then run the bootstrap command
from your operating-system section. Do not invent hardcoded default accounts.

## Check the application

The three profiles enable the real Order API/recovery/expiry/outbox workers,
Credit API/consumer and Chat API/outbox publisher. With all enabled, root Compose
starts fourteen application/support services. Background workers do not have HTTP health checks;
check their logs as well as `ps`.

| Local address | Purpose |
| --- | --- |
| `http://localhost:3000` | Web UI and same-origin API proxy |
| `http://localhost:3000/wallet` | Own real Credit wallet after signing in |
| `http://localhost:3000/messages` | Private Chat conversations after signing in |
| `http://localhost:8000/health/ready` | User database readiness; expect HTTP 200 |
| `http://localhost:8001/docs` | Supplier API documentation |
| `http://localhost:8002/health/ready` | Order database/schema readiness; expect HTTP 200 |
| `http://localhost:8003/health/ready` | Credit database/schema readiness; expect HTTP 200 |
| `http://127.0.0.1:8004/health/ready` | Chat database and live-delivery readiness; expect HTTP 200 |
| `http://127.0.0.1:8004/docs` | Chat API documentation |
| `http://localhost:8000/docs`, `:8002/docs`, `:8003/docs` | User, Order and Credit API documentation |
| `http://localhost:8025` | Mailpit registration verification emails |
| `http://localhost:15672` | RabbitMQ management; use your local RabbitMQ credentials |

Readiness does not prove every downstream interaction. Test the full workflow:

1. Register an ordinary `@u.nus.edu` account, open Mailpit and use its six-digit
   verification code, then sign in. Mock local NUS addresses work because
   Mailpit captures these messages; no real NUS inbox is contacted.
2. Open **Suppliers** to browse active pickup locations, then **Wallet**. A new
   wallet starts at `20 available / 0 reserved / 20 total`. Users registered
   before Credit also get their one-time allocation on first wallet use.
3. Create an errand offering 5 credits with future acceptance/delivery deadlines.
   A requester starting with 20 now has `15 available / 5 reserved / 20 total`.
4. In a separate browser/incognito session, use another account to accept,
   mark picked up and mark delivered. The requester confirms receipt.
5. Refresh both Wallet pages after consumption. With both accounts initially
   at 20 and no other activity, requester has `15 / 0 / 15`, courier `25 / 0 / 25`.
   Cancellation before acceptance, expiry and participant failure release the
   held reward instead. Order completion or outbox `PUBLISHED` alone does not
   prove settlement; confirm the wallet/ledger result.

The web proxy routes `/v1/chat` HTTP/WebSocket paths to Chat, Order paths to
Order, wallet paths to Credit, Supplier paths to Supplier and other `/v1/` routes
to User. The edge does not route
Credit's `/v1/internal/*` endpoints to Credit; Order calls those privately with
its service secret. No service reads another service's tables. The retired
port-3001 mock demo has been removed. Test doubles remain under automated-test
directories only; the application uses real Credit and has no simulated fallback.

Chat HTTP requests use `http://localhost:3000/v1/chat/...` and WebSockets use
`ws://localhost:3000/v1/chat/ws`; Vite development uses the same paths on port
`5173`. Native/direct Chat access now uses port `8004`, leaving Credit on `8003`.
Chat containers still listen internally on `8003` under their own service name.
If your Postman environment used direct port `8003`, change `CHAT_BASE_URL` to
`http://127.0.0.1:8004` and `CHAT_WS_URL` to `ws://127.0.0.1:8004/v1/chat/ws`.
Follow the [ordered Chat manual walkthrough](chat-service/docs/verification.md).
Open **Messages** after signing in to search usernames, send messages, manage
blocks and read retained history. See [Chat UI verification](chat-service/docs/ui-verification.md)
for browser behavior, requirement mapping and the opt-in real-service test.

### Troubleshooting and data safety

- If `ps` shows an unhealthy API, check that its own database is running,
  migrations are current and its database URL uses the correct host/port/login.
- If wallet updates lag, inspect `credit-consumer` and `order-outbox` logs plus
  `credit-service.events`, `.retry` and `.dlq` in RabbitMQ. Do not reset wallets
  or submit another errand to work around an unresolved creation request.
- Keep existing secrets after pulls. Use `npm ci` when a service's lockfile
  changes, apply its pending migrations with `migration up --local`, then
  rebuild the application containers. Migrations do not run at API startup.
- Use **Compose stop/start**, not `down` or container deletion, for routine
  shutdown with pending messages. Root Compose currently has no explicit
  persistent RabbitMQ/Mailpit volumes. Durable queues do not guarantee data
  survives container recreation; database-volume persistence is separate.
- Normal `supabase stop` preserves saved database volumes. Do not add
  `--no-backup`, delete volumes or run `supabase db reset --local` for normal
  startup, updates or shutdown. Reset is destructive: it deletes that service's
  local application data and reapplies migrations/seeds. Resetting only one
  database can leave inconsistent references/reservations in the other services.
- Never point destructive integration tests at development or hosted data.
  Use explicitly disposable databases and test queues. Do not paste `.env`
  contents, private keys, passwords or tokens into chat or Git.

### Remove application containers

For an intentional teardown after finishing pending work, use all enabled
profiles from the repository root:

```sh
docker compose --env-file user-service/.env --profile order --profile credit --profile chat down
```

The same Docker command works in PowerShell. This removes application containers
and networks; it does not remove the separately managed Supabase databases.
RabbitMQ/Mailpit have no explicit persistent volumes here, so pending broker data
and captured mail can be lost on recreation. Use `stop` for routine shutdown.
Stop each Supabase stack using the operating-system steps above when finished.

### Reset disposable local application data

Reset only when you intentionally want to erase that service's local data.
Stop application containers first. For Chat alone, run from the repository root:

```sh
docker compose --env-file user-service/.env --profile order --profile credit --profile chat stop
(cd chat-service && npx supabase start && npx supabase db reset --local)
```

On Windows / PowerShell:

```powershell
docker compose --env-file user-service/.env --profile order --profile credit --profile chat stop
Set-Location chat-service
npx.cmd supabase start
npx.cmd supabase db reset --local
Set-Location ..
```

This deletes Chat conversations, messages, blocks, unread cursors and outbox rows,
then reapplies Chat migrations. It does not reset User, Supplier, Order or Credit.
To reset another disposable local database, run `npx supabase db reset --local`
from that service's directory and follow its README for login/seed recovery.
If resetting the entire demo, reset each service separately, recreate any local
Order/Credit login grants and bootstrap the first Super Admin again. Retain existing
secret files. Never run a reset against hosted, shared or non-disposable data.
Rebuild/start the application with the same enabled profiles after reconfiguration.

For service-specific APIs, development commands and test requirements, see
[User](user-service/README.md), [Supplier](supplier-service/README.md),
[Order](order-service/README.md), [Credit](credit-service/README.md) and
[Chat](chat-service/README.md).
The root instructions above describe the combined real-service Docker workflow.

For the separate AWS sandbox, see [the EC2 foundation runbook](deploy/aws/README.md).
It uses its own Compose project, cloud-only secrets, six separately owned Supabase
PostgreSQL databases and initially private access. Public HTTPS and automated cloud
releases are separate rollout steps; the local setup above is unchanged.

## AI Use Summary

**Scope** covers Feng1231’s implementation work in `user-service/` and `chat-service/`.

**Tools** include ChatGPT through Codex (`gpt-5.6-terra` and `gpt-6.1-sol`) and GitHub Copilot for the User Service bootstrap pull request review.

The course policy gives this example wording for a project-wide disclosure:

> Prohibited phases avoided: requirements elicitation; architecture/design decisions.

This implementation record covers the two services and is separate from a project-wide compliance attestation.

- **User Service** used AI to implement and debug service startup, registration, sessions, profiles, administrator operations, event publishing, and Chat identity lookups.
- **Chat Service** used AI to implement and debug service startup, identity checks, private conversations, messaging, live delivery, unread state, and recovery.
- **Verification** included author review, boundary checks, and existing unit, integration, and smoke tests as recorded in the implementation history.

The [AI usage log](ai/usage-log.md) records the prompts, key responses, and affected files in chronological order.

### Credit Service and Admin Dashboard (fjxfong)

**Scope** covers fjxfong’s (Fong Jing Xiang) implementation work in `credit-service/` and `admin-service/`, the wallet and Admin Dashboard pages in `web-client/`, and the administrator additions to `order-service/`, Compose, the edge proxy and CI.

**Tools** include Claude Code (model: Claude Opus 5.5).

Prohibited phases avoided: requirements elicitation; architecture/design decisions.

- **Credit Service** used AI to implement and debug the service foundation, the wallet ledger and its migrations, the Order-facing reservation endpoints, the event consumer and its retries, the wallet and history API, the dead-letter replay and integrity check commands, and the wallet page.
- **Admin Dashboard** used AI to implement and debug the Admin Service dispute workflow, participant problem reports and audit log, the administrator errand, analytics and decision endpoints in Order Service, the administrator credit views in Credit Service, and the dashboard pages.
- **Verification** included author review, boundary checks, and the existing unit, integration, component and browser tests, as recorded in the implementation history.

The [AI usage log](ai/usage-log.md) records the prompts, key responses, and affected files in chronological order.


### Order Service and cloud deployment (YingWen178)

**Scope** covers YingWen178’s implementation work in `order-service/`, the Order screens and integration code in `web-client/`, `deploy/aws/`, shared Order/deployment CI configuration, and the optional SES email additions to `user-service/`.

**Tools** include ChatGPT through Codex (`gpt-6-astra` and `gpt-6.1-sol`).

- **Order Service** used AI to implement and debug service startup, creation/read operations, retry recovery, participant lifecycle actions, event publishing, Order screens, and the corresponding tests.
- **Cloud deployment** used AI to implement and debug deployment configuration, provisioning helpers, HTTPS ingress, optional SES delivery, automated image release/rollback, monitoring collection, and the corresponding tests.
- **Verification** included author review, boundary checks, and existing unit, integration, and smoke tests as recorded in the implementation history.

The [AI usage log](ai/usage-log.md) records the prompts, key responses, and affected files in chronological order.

### Supplier Service and Voice Assist Service (hwangjihun)

**Scope** covers hwangjihun's implementation in `supplier-service/`, `voice-assist-service/`, their Supplier/voice web screens and directly related shared client, proxy, Compose and CI code.

**Tools** include ChatGPT through Codex (models: `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-astra`) and Claude Code (model: Claude Opus 5.5). Saved message metadata confirms Opus 5.5 for Voice Assist and the later Supplier fixes.

The course policy's example disclosure statement is:

> Prohibited phases avoided: requirements elicitation; architecture/design decisions.

This section documents implementation assistance only. The statement above is quoted policy wording, not a project-wide compliance attestation; the implementation-only prompt excerpts in the log are not a complete archive of original prompts.

- **Supplier Service** used AI to implement and debug SQL validation/seed import, authenticated CRUD/read handlers, filtering and pagination, connection reuse, health checks, responsive browsing/management screens, error handling and existing regression/CI checks.
- **Voice Assist Service** used AI to implement and debug audio transcription/drafting, deterministic time resolution and Supplier matching, transcript-grounded field processing, recording/draft/discard controls, errand-form integration and existing tests/evaluation tooling.
- **Author review**: I validated correctness, and added boundary checks. Existing automated regression checks are rerun for this attribution-only update; no implementation or test cases are added.

**Prompts and key exchanges**: see the chronological [hwangjihun implementation entries in the shared AI usage log](ai/usage-log.md#hwangjihun---supplier-and-voice-assist-implementation). JSON attribution is carried by that log because JSON does not support comments.
