# Chat Service

Python 3.13/FastAPI backend, isolated Supabase PostgreSQL storage, and RabbitMQ live delivery.
See [PLAN.md](PLAN.md) for requirement aliases. Root Compose and browser proxies
include the optional Chat backend and its publisher.

## Local setup

From this directory, run `npm ci` for the project-pinned Supabase CLI and
`uv sync --locked --extra dev` for Python dependencies, then copy `.env.example` to an ignored `.env`
and provide local credentials. Use Chat's own database on port 17422; do not point
Chat at another service's database or copy User Service's private RSA keys.
The dedicated `CHAT_SERVICE_SHARED_SECRET` must match User Service's configuration.

Use `npx supabase start` and `npx supabase stop` for normal local starts/stops.
Use `npx supabase db reset --local` only when deliberately clearing local data.
Run these commands from this directory so they use its CLI and config. Project ID is
`foc-chat-service`; database/shadow ports are 17422/17420. Auth and Data API are disabled.
Migrations are the sole schema history; API startup never creates or migrates tables.
Local development uses Supabase's default `postgres` username/password and database.
The template's native URL uses `127.0.0.1:17422`; its Docker URL uses
`host.docker.internal:17422`. No extra login creation or role grant is needed after
a local reset. Deployment uses a dedicated login inheriting the restricted
`chat_runtime` role instead of the local administrator account.

Start the API with `uv run uvicorn app.main:app --port 8004 --no-access-log --ws-max-size 65536`.
Start the independent publisher with `uv run chat-outbox` after broker configuration.
`/health/live` checks the process; `/health/ready` checks every owned database table.

For the integrated stack, run from the repository root:

```sh
docker compose --env-file user-service/.env --profile chat up --build -d
```

Root Compose loads `chat-service/.env` directly and selects its `DATABASE_URL_DOCKER`
and `RABBITMQ_URL_DOCKER` inside the API/publisher containers. The global `--env-file`
remains User Service's file so its database values stay independent. The API uses
`http://user-service:8000`; both Chat processes connect to the existing RabbitMQ.
Chat is published on `http://127.0.0.1:8004`, leaving Credit on host port `8003`.
The Chat container and Nginx upstream retain internal port `8003`.
Both Docker URL settings must be populated. No database migrations run on startup.

The service-local launcher remains available after the root stack has created its
networks: `docker compose --env-file .env --profile chat up --build -d` from this
directory. Stop its `chat-service` and `chat-outbox` before moving to the root
launcher; run only one launcher at a time because both bind host port `8004`
(container port `8003`). Credit uses host port `8003`.

Browser/Postman same-origin requests use `http://localhost:3000/v1/chat/...` and
`ws://localhost:3000/v1/chat/ws`. Vite uses port 5173 with the same paths. Root
Compose allows exact localhost/127.0.0.1 browser origins on both ports; override
the Compose variable `CHAT_ALLOWED_ORIGINS` with a JSON array when needed.
Native/service-local startup continues to use `ALLOWED_ORIGINS` in Chat's `.env`.

## Verification

`uv run ruff check app tests scripts` and `uv run pytest -q --tb=short` run local checks.
Database and broker tests skip unless configured. For the complete repeatable procedure and
actual results see [verification.md](docs/verification.md). The disposable restricted test
login must be provisioned again after a database reset. No test resets or truncates another
service's database. Protocol/client responsibilities are in [backend-contract.md](docs/backend-contract.md).

## External integration work

Root Compose now provides the optional `chat` profile and independent `chat-outbox`.
Vite and Nginx route `/v1/chat` before generic User routes, support WebSocket upgrades,
and preserve the caller's Origin. Nginx can start while Chat is disabled. Chat CI
includes lint/unit/PostgreSQL/RabbitMQ and container checks; its identity dependency
is a test-only contract fake. An actual User + Chat regression job remains follow-up.

Phase 6 adds the protected Messages screens, visible/focused read handling, plain-text
rendering, optimistic deduplication, explicit retry, block management and reconnect recovery.
See [UI verification](docs/ui-verification.md) for requirements, automated checks and the
real two-browser acceptance procedure. Production deployment and automated real-service CI
provisioning remain separate integration work.
No Sprint 4 scale/performance compliance is claimed.

See [integration-follow-up.md](docs/integration-follow-up.md) for exact shared routing/CI work
and the FR/NFR boundary in [verification.md](docs/verification.md).
