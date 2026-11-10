# FoC Admin Service

Admin Service supports the Admin Dashboard nice-to-have (backlog N2). It owns dispute cases
about errands, their status history and the audit log of dashboard actions, in its own Supabase
PostgreSQL database and `admin_service` schema. Errand, credit and identity data stay with Order,
Credit and User Service and are read only through their HTTP APIs. See [API.md](API.md) for the
contracts.

Current scope: health checks, current-session administrator authorization, the dispute workflow
(record, list, view and change status) and the append-only dashboard audit log.

## Local database

```sh
cd admin-service
npm ci
npx supabase start
npx supabase migration up --local
```

| PostgreSQL port | Studio | Application schema |
| --- | --- | --- |
| `17522` | `http://localhost:17523` | `admin_service` |

The migration creates `admin_service_app` as a **NOLOGIN** role with schema USAGE only. Provision
a separate local login inheriting it once, in the local Studio SQL Editor, using a random
password you generate locally:

```sql
CREATE ROLE foc_admin_local LOGIN INHERIT PASSWORD 'replace-with-admin-only-password';
GRANT admin_service_app TO foc_admin_local;
```

Reconstruct the schema with `npx supabase db reset --local` **only** in your own local Admin
database. It deletes that database's data.

## Configuration

| File | Use |
| --- | --- |
| `.env` (from `.env.example`) | Running the API natively. `DATABASE_URL` uses `127.0.0.1:17522`. |
| `.env.docker` (from `.env.docker.example`) | Root Compose. `DATABASE_URL` uses `host.docker.internal:17522`. |

Set `DATABASE_URL` to the `foc_admin_local` login. An unset URL keeps liveness available while
readiness returns `503`. Root Compose supplies `USER_SERVICE_BASE_URL` and `ORDER_SERVICE_BASE_URL`. Set
`ORDER_SERVICE_SECRET` to the same value as Order's `ADMIN_SERVICE_SECRET`; without it, disputes cannot be
opened, withdrawn or decided. Never commit either file.

## Run

From the repository root with Docker:

```sh
docker compose --env-file user-service/.env --profile admin up --build -d admin-service
```

Natively on port 8005 (Windows: use `.venv\Scripts\python.exe`):

```sh
python -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m uvicorn app.main:app --port 8005
```

## Tests

```sh
.venv/bin/python -m ruff check app tests
.venv/bin/python -m pytest -q -m "not integration"
```

Integration tests need `ADMIN_TEST_DATABASE_URL` set to the **administrative** URL of your own
disposable, migrated Admin database (from `npx supabase status`). They write data; never point
them at a teammate's or shared database.

```sh
.venv/bin/python -m pytest -q -m integration
```

CI runs lint, the unit and ASGI tests and an image build.
