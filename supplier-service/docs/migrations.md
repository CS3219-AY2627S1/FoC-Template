<!-- AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-29
Scope: Refactoring and documentation improvements — write database setup, role, migration, and isolated verification instructions. Refactoring and documentation improvements; Debugging assistance — expand deployment/recovery instructions, explain isolated test setup, and correct disposable probe port selection (2026-09-29).
Author review: Keith confirmed review of all affected changes.
Details: ../ai/usage-log.md; ai-20260929-001; ai-20260929-004
-->

# Supplier schema operations

The API and `supplier-migrate` use the shared image `foc-supplier-service:local`,
built from `supplier-service/`. The image contains `alembic.ini` and `migrations/`
and runs as `supplier` (UID 10001). The migration job runs
`python -m alembic upgrade head` as database role `supplier_migrator`, joins only
`supplier-private`, publishes no ports, and has no HTTP health check or automatic
restart. Its required `USER_SERVICE_URL` comes from Compose; shared application
settings validate that URL even though migrations do not contact User Service.

Compose waits for database health, then runs `supplier-bootstrap`,
`supplier-migrate`, and `supplier-grants` in order. Every job must complete
successfully before the next stage and a newly created API container can start.
The API uses `supplier_runtime`, retains its two networks and `127.0.0.1:8081`
binding, and has a `/ready` image health check with a three-second HTTP timeout and a
five-second Docker timeout.

| Probe | Success | Failure meaning |
| --- | --- | --- |
| `/health` | HTTP 200, `{"status":"healthy"}` | Application liveness only; no database access |
| `/ready` | HTTP 200, `{"status":"ready"}` | HTTP 503, `{"status":"not_ready"}` when connectivity, revision access, configuration, or exact head matching fails |

Readiness runs `SELECT 1`, reads installed heads with Alembic, and compares them
with the nonempty packaged heads. It releases connections and emits only a
generic failure diagnostic. Neither application startup nor readiness applies
migrations or creates tables. Probes do not require authentication.

## Fresh installation

Run these commands from the repository root with Docker running. Use the same
Compose project name throughout a deployment so it keeps the same named volume.

1. If `.env` does not exist, copy `.env.example` to `.env`. Configure
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `USER_SERVICE_INTERNAL_TOKEN` for
   complete Compose interpolation, plus these Supplier values:

   ```dotenv
   SUPPLIER_POSTGRES_DB=supplier_db
   SUPPLIER_POSTGRES_USER=supplier_admin
   SUPPLIER_POSTGRES_PASSWORD=REPLACE_WITH_ADMIN_PASSWORD
   SUPPLIER_MIGRATION_PASSWORD=REPLACE_WITH_MIGRATION_PASSWORD
   SUPPLIER_RUNTIME_PASSWORD=REPLACE_WITH_RUNTIME_PASSWORD
   AUTH_TIMEOUT_SECONDS=3
   LOG_LEVEL=INFO
   ```

   Use separate passwords; `openssl rand -hex 24` generates a URL-safe value.
   Migration and runtime passwords are interpolated into connection URLs, so
   use URL-safe values or correctly percent-encode URL components. Keep real
   credentials in the ignored `.env`. The API never uses the database
   administrator account.

   Compose reads `.env` and supplies job credentials directly. No `source .env`
   or manual SQL commands are required. Existing shell variables take precedence
   over `.env`; keep them consistent. Avoid printing resolved Compose
   configuration because it includes credentials; `config --quiet` validates it.

2. Validate and start Supplier, including its setup jobs:

   ```bash
   docker compose config --quiet
   docker compose up -d --build --wait --wait-timeout 180 supplier-service
   docker compose ps -a supplier-db supplier-bootstrap supplier-migrate supplier-grants supplier-service
   curl --fail --max-time 5 http://127.0.0.1:8081/ready
   curl --fail --max-time 5 http://127.0.0.1:8081/health
   ```

   To start Supplier alongside all other services in this checkout, use
   `docker compose up -d --build --wait --wait-timeout 180` instead.

The automatic dependency chain is:

```text
supplier-db healthy
  -> supplier-bootstrap completed successfully
  -> supplier-migrate completed successfully
  -> supplier-grants completed successfully
  -> supplier-service starts (or supplier-seed when explicitly invoked)
```

`supplier-bootstrap` uses `postgres:16-alpine` as a PostgreSQL client. It connects
as the configured database administrator and runs the read-only-mounted
`database/bootstrap.sql` to enable PostGIS and provision the two login roles.
It receives their passwords through environment variables read by `psql`.
`supplier-migrate` then applies packaged Alembic revisions as `supplier_migrator`.
Finally, `supplier-grants` uses the PostgreSQL client as `supplier_migrator` to run
`database/runtime-grants.sql`. These client jobs run only on `supplier-private`,
have no published ports, disable health checks, and never automatically restart.
SQL errors exit nonzero and block dependent services.

Runtime grants include `SELECT` on `alembic_version` for readiness and category
reads plus supplier/assignment data access. They grant no schema mutation or
revision-state writes. Expect all three jobs to exit 0 and the database/API
containers to become healthy. No User Service or frontend is needed for these
Supplier probes. Startup does not import supplier CSV data; use the explicit
seed tool when needed.

Bootstrap and grants are repeatable. New tables require a permissions review,
and grants must be reapplied after objects are recreated. Neither script
transfers ownership of existing objects. If application tables were previously
created as administrator, explicitly arrange ownership of `supplier`, `category`,
`supplier_category`, and `alembic_version` for `supplier_migrator` before deployment.
Do not transfer ownership of PostGIS extension objects. Initial PostgreSQL
credentials only initialize an empty volume; changing `.env` does not update
existing database account passwords.

## Deploying a new image with the existing volume

Compose startup ordering is not a migration scheduler. A completed job from an
older image does not prove that a new image has been migrated. Dependencies also
do not stop an already-running API when the database or migration job fails.
Docker marks an unhealthy API but does not automatically stop it or migrate it.

Use this maintenance-window sequence from the repository root. Keep the existing
project name, database name, credentials, and volume. Review new migration
operations and back up persistent data before deployment. New tables may need
updates to `database/runtime-grants.sql`. This sequence stops the API while the
setup jobs run:

```bash
docker compose config --quiet
docker compose build supplier-service
docker compose stop supplier-service

# Remove only the stopped setup containers, preserving the database and volume.
docker compose rm -f supplier-bootstrap supplier-migrate supplier-grants

# Recreate the jobs and wait for bootstrap, migrations, grants, and API readiness.
docker compose up -d --wait --wait-timeout 180 supplier-service
curl --fail --max-time 5 http://127.0.0.1:8081/ready
```

If a job fails, inspect its logs and repair the cause before rerunning startup.
Do not bypass dependencies with `--no-deps` to start the API after a failed job.
Do not use `down -v`, reset the schema, or reseed existing data as a deployment
step. Ordinary stop/start and container recreation retain the database volume;
repeatable bootstrap, migrations, and grants support already-provisioned volumes.

## Inspection and recovery

From the repository root:

```bash
docker compose ps -a supplier-db supplier-bootstrap supplier-migrate supplier-grants supplier-service
docker compose logs --tail=80 supplier-bootstrap supplier-migrate supplier-grants
docker compose logs --tail=80 supplier-service
docker compose run --rm --no-deps supplier-migrate python -m alembic heads
docker compose run --rm --no-deps supplier-migrate python -m alembic current
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q supplier-service)"
curl -i --max-time 5 http://127.0.0.1:8081/ready
curl -i --max-time 5 http://127.0.0.1:8081/health
```

`heads` is packaged state, `current` is installed state, and `ps -a` includes the
exited migration job. A removed one-off job has no retained logs; use the regular
job invocation above when you need its status and logs afterward. Readiness
responses/logs are generic; migration-tool diagnostics can include operational
details, so review them before sharing.

- Database unavailable: restore database service/connectivity, then retry
  `/ready`. Connections are checked on each request and readiness can recover
  without restarting the API. `/health` remains a liveness-only check.
- Bootstrap administrator login failure: an existing volume keeps its stored
  password even when `.env` changes. Restore the matching configuration or
  deliberately align the stored administrator password using local administrator
  access, then rerun startup. Preserve the volume and its data.
- Older schema: run the new image's migration job successfully and ensure grants
  are correct. Readiness recovers once installed and packaged heads match.
  Unknown or additional heads require diagnosis of image/database history;
  do not use `alembic stamp` merely to make readiness pass.
- Missing grants: apply the reviewed runtime grants, including revision-state
  reads. Recheck readiness without changing the API's database role.
- Migration failure: inspect the job logs, correct the migration/configuration
  cause, rebuild if needed, and explicitly rerun the migration job. Then apply
  grants and recreate/start the API. Keep the volume; do not delete data as a fix.

## Local Alembic commands and revision behavior

From `supplier-service/`, export `DATABASE_URL` for the migration role and
`USER_SERVICE_URL=https://localhost:8000` (required by shared settings):

```bash
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m alembic heads
.venv/bin/python -m alembic current
.venv/bin/python -m alembic check
.venv/bin/python -m alembic upgrade head --sql > /tmp/supplier-schema.sql
```

Revision `0001` creates the schema; `0002` inserts Food, Coffee, Shopping and
Printing with permanent UUIDs. Those IDs must not be regenerated. Downgrading
`0002` removes only those categories and fails while assignments reference them.
Downgrading `0001` removes application tables and data while preserving PostGIS.
Downgrade experiments below belong only on disposable data.

Offline SQL generation does not connect. Review generated revisions;
autogeneration does not prove check-expression equivalence. PostGIS's
`spatial_ref_sys` is excluded from application comparisons; its other public
metadata relations are views. Review extension-owned objects before adding
other extensions to schema comparison.

## Isolated deployment and recovery rehearsal

Use a new terminal at the repository root. This setup uses the final Compose
file plus a temporary override: a unique project/volume/image, random localhost
ports, and disposable credentials. The test database additionally joins the
project default network so Docker can publish its localhost port for host-run
integration tests; production keeps its internal-only database network. Only
Supplier services are started. It
requires Docker Compose with `!override` support (verified with v5.5.1).

```bash
CHECK_ROOT="$PWD"
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/foc-supplier-check.XXXXXX")"
CHECK_PROJECT="foc-supplier-check-$(date +%s)-$$"
cat > "$CHECK_DIR/test.env" <<'ENV'
POSTGRES_USER=unused_test
POSTGRES_PASSWORD=unused_test
USER_SERVICE_INTERNAL_TOKEN=unused_test_internal_token
SUPPLIER_POSTGRES_DB=supplier_deploy_test
SUPPLIER_POSTGRES_USER=supplier_test_admin
SUPPLIER_POSTGRES_PASSWORD=disposable_admin
SUPPLIER_MIGRATION_PASSWORD=disposable_migration
SUPPLIER_RUNTIME_PASSWORD=disposable_runtime
AUTH_TIMEOUT_SECONDS=3
LOG_LEVEL=INFO
ENV
set -a
source "$CHECK_DIR/test.env"
set +a
cat > "$CHECK_DIR/override.yaml" <<YAML
services:
  supplier-service:
    image: ${CHECK_PROJECT}-app:local
    ports: !override
      - "127.0.0.1::8080"
  supplier-migrate:
    image: ${CHECK_PROJECT}-app:local
  supplier-db:
    networks:
      - supplier-private
      - default
    ports:
      - "127.0.0.1::5432"
YAML
dc() {
  docker compose --env-file "$CHECK_DIR/test.env" -p "$CHECK_PROJECT" \
    -f "$CHECK_ROOT/compose.yaml" -f "$CHECK_DIR/override.yaml" "$@"
}
dc config --quiet
```

The disposable credentials are already loaded: do not copy or source the root
`.env` for this rehearsal. Build and start the complete automatic dependency
chain, then obtain its random port and inspect the probes:

```bash
dc up -d --build --wait --wait-timeout 180 supplier-service
CHECK_API="http://$(dc port supplier-service 8080)"
curl -i --max-time 5 "$CHECK_API/ready"   # 200, {"status":"ready"}
curl -i --max-time 5 "$CHECK_API/health"  # 200, {"status":"healthy"}
```

Recalculate `CHECK_API` after any API recreation because its random port can change.
To rehearse permission loss after startup, revoke revision access only in this
disposable database, then restore it using the grant job:

```bash
dc exec -T supplier-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
REVOKE SELECT ON alembic_version FROM supplier_runtime;
SQL
curl -i --max-time 5 "$CHECK_API/ready"   # 503
dc run --rm --no-deps supplier-grants
curl -i --max-time 5 "$CHECK_API/ready"   # 200
```

### Database outage and repair

Keep the API running and stop only this project's database:

```bash
dc stop supplier-db
curl -i --max-time 5 "$CHECK_API/ready"   # 503, safe generic body
curl -i --max-time 5 "$CHECK_API/health"  # 200
dc up -d --wait supplier-db
curl -i --max-time 5 "$CHECK_API/ready"   # 200 again
```

Container health may take the next health-check interval to catch up with the
HTTP result. No API restart or volume removal is needed.

### Older revision and upgrade with surviving data

On this disposable database only, with no seeded-category assignments, prepare
revision `0001` and insert a representative supplier:

```bash
dc run --rm supplier-migrate python -m alembic downgrade 0001
dc exec -T supplier-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO supplier (id, name, area, location, created_at, updated_at, version)
VALUES ('00000000-0000-0000-0000-000000000123', 'Persistent deployment probe',
        'Test area', ST_GeogFromText('SRID=4326;POINT(103.77 1.30)'), now(), now(), 1);
SQL
curl -i --max-time 5 "$CHECK_API/ready"   # 503: current image expects 0002
curl -i --max-time 5 "$CHECK_API/health"  # 200
CHECK_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$(dc ps -q supplier-db)")"
```

Follow the **existing-volume deployment** sequence above with `dc`, including
rebuilding the shared image and letting Compose rerun setup before restarting
the API. Replace that sequence's final fixed-port
`curl --fail --max-time 5 http://127.0.0.1:8081/ready` with the following commands
immediately after API recreation. Recalculate the disposable project's address
before probing it; port 8081 may belong to an unrelated development API.

```bash
CHECK_API="http://$(dc port supplier-service 8080)"
curl --fail --max-time 5 "$CHECK_API/ready"
```

Then verify the installed revision, unchanged volume, and saved row:

```bash
dc run --rm --no-deps supplier-migrate python -m alembic current
test "$CHECK_VOLUME" = "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$(dc ps -q supplier-db)")"
dc exec -T supplier-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT id, name, version FROM supplier
WHERE id = '00000000-0000-0000-0000-000000000123';
SQL
```

Expect `0002`, the same volume name, and `Persistent deployment probe` at version
1. This stages a real older database revision with the current source image;
it does not test an archived historical image or an arbitrary future migration.

### Failed migration blocks a new API, then recovers

Create an extra failing revision only in a temporary copy. Production revision
files remain untouched. This fixture assumes the current packaged head `0002`;
update its parent if the packaged migration chain changes.

```bash
cp -R supplier-service/migrations "$CHECK_DIR/failing-migrations"
cat > "$CHECK_DIR/failing-migrations/versions/failure_probe.py" <<'PY'
revision = 'disposable_failure_probe'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade():
    raise RuntimeError('Intentional disposable migration failure')

def downgrade():
    pass
PY
cat > "$CHECK_DIR/failure.yaml" <<YAML
services:
  supplier-migrate:
    volumes:
      - "$CHECK_DIR/failing-migrations:/app/migrations:ro"
YAML
# Remove only these disposable containers, keeping the database and its volume.
dc rm -s -f supplier-service supplier-migrate supplier-grants
# Expected nonzero exit; do not use --no-deps here: this tests startup gating.
dc -f "$CHECK_DIR/failure.yaml" up -d supplier-service
dc ps -a supplier-service supplier-migrate supplier-grants
dc logs --tail=20 supplier-migrate
```

Expect migration exit 1 and the API to remain `Created`, never started. Remove
the failure by invoking the normal configuration without `failure.yaml`:

```bash
dc rm -f supplier-service supplier-migrate supplier-grants
dc up -d --wait --wait-timeout 180 supplier-service
CHECK_API="http://$(dc port supplier-service 8080)"
curl --fail --max-time 5 "$CHECK_API/ready"
```

Repeat the saved-row and volume checks above. The failure and recovery must
preserve both; no database reset, stamp, production revision edit, or reseeding
is required.

## Unit, API, and database integration checks

From `supplier-service/`, unit/API checks need no external services:

```bash
.venv/bin/python -m pytest tests/unit tests/api -q
```

For full database coverage, use the isolated Compose project above after it is
migrated and granted. Remove only the demonstration row before running the
existing tests, which assume their own application fixtures. From the root in
the same rehearsal terminal:

```bash
dc exec -T supplier-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DELETE FROM supplier WHERE id = '00000000-0000-0000-0000-000000000123';
SQL
CHECK_DB_ADDRESS="$(dc port supplier-db 5432)"
export TEST_DATABASE_URL="postgresql+psycopg://supplier_migrator:${SUPPLIER_MIGRATION_PASSWORD}@${CHECK_DB_ADDRESS}/${SUPPLIER_POSTGRES_DB}"
export TEST_RUNTIME_DATABASE_URL="postgresql+psycopg://supplier_runtime:${SUPPLIER_RUNTIME_PASSWORD}@${CHECK_DB_ADDRESS}/${SUPPLIER_POSTGRES_DB}"
export TEST_ADMIN_DATABASE_URL="postgresql+psycopg://${SUPPLIER_POSTGRES_USER}:${SUPPLIER_POSTGRES_PASSWORD}@${CHECK_DB_ADDRESS}/${SUPPLIER_POSTGRES_DB}"
# In this disposable-test terminal only; avoid a conflicting local application URL.
unset DATABASE_URL
(cd supplier-service && .venv/bin/python -m pytest tests/integration -q)
# Or run everything together:
(cd supplier-service && .venv/bin/python -m pytest tests -q)
```

Install `supplier-service/requirements-dev.txt` into the service virtual
environment first if needed. Test URLs must use `postgresql+psycopg`, target a
separate database ending in `_test`, and differ from the application database
name when `DATABASE_URL` is set. Fixtures never fall back to application settings.
They apply Alembic migrations and roll back row tests; concurrency checks clean
up their committed rows. Runtime tests require the provisioned runtime role on
the same test database. Without `TEST_RUNTIME_DATABASE_URL`, that test is skipped.
The lifecycle test creates and removes its own uniquely named database; its admin
URL needs database-creation and extension-install privileges. Without
`TEST_ADMIN_DATABASE_URL`, that test is skipped. Supply all three URLs for full
coverage, using only disposable data.

### Automatic startup verification (2026-10-22)

Built the current API and database Dockerfiles and tested the Compose dependency
chain on Docker Desktop using isolated project `foc-supplier-auto-check-60fc20de`,
disposable credentials, no API host ports, and a new database volume:

- Fresh startup completed all three setup jobs with exit 0; the API became
  healthy and `/health`, `/ready`, and `/suppliers` returned 200.
- The runtime role could read migration state and insert supplier records, but
  could neither create schema objects nor write migration state. Both service
  roles retained their non-superuser, non-role/database-creation restrictions.
- The seed preview and import succeeded. After container removal and recreation,
  the same database cluster retained 21 suppliers and 26 assignments. Repeated
  `up` also preserved these values.
- Injected bootstrap SQL, migration-process, and grant SQL failures each blocked
  a newly created API and the seed tool. Removing the failure restored readiness
  while preserving the imported data.
- A seed preview invoked alone on another empty volume automatically ran all
  setup dependencies and left the supplier table empty.
- All disposable containers, networks, and volumes were removed. Compose
  validation, workflow YAML parsing, and whitespace checks passed.

A subsequent isolated check in `foc-three-service-check-65198c6d` built and
started all services in this checkout: User, Frontend, and Supplier, including
their databases and setup jobs. Both API readiness endpoints and the frontend
page returned 200; every setup job exited 0. The disposable resources were
removed. This verifies startup; frontend authentication and data remain stubbed.

Hosted GitHub Actions execution and the unrelated application unit/API suites
were not run for this Compose change. Order, Credit, and Kafka are absent from
this checkout's Compose configuration and were not part of the stack check.
The CI workflow now covers fresh Supplier startup, seed dependencies, and
existing-volume startup.

### Observed verification

Verified on 2026-09-29 using Docker Desktop (Apple Silicon), Compose v5.5.1,
and isolated project `foc-supplier-docs-19148` with disposable credentials/data:

| Check | Observed result |
| --- | --- |
| Compose configuration and image builds | Passed; packaged and installed head `0002` |
| Fresh bootstrap, migration, and grants | Before grants: readiness 503 and liveness 200; after grants: readiness 200 and API healthy |
| Database stopped, then restarted | Safe readiness 503 and liveness 200 during outage; readiness returned to 200 without API restart |
| Revision `0001` with a saved supplier, upgraded to `0002` | Outdated schema gave readiness 503/liveness 200; explicit job and API recreation restored health; volume name and supplier name/version survived |
| Temporary failing revision | Migration exited 1; newly created API remained `Created`, never started |
| Failure removed and migration rerun | Job exited 0, API became healthy, and the saved supplier survived without deleting the volume |
| Existing unit/API/integration suite | **74 passed**, no skips: 40 unit/API and 34 database checks, including runtime permissions and lifecycle coverage; one Starlette/AnyIO deprecation warning |
| Cleanup | Only the disposable project's containers, networks, and volume were removed |

An initial integration attempt used only the internal database network: Docker
reported no usable published host port, so database checks could not connect
(40 passed, 33 setup errors, one failure). Adding the default network **only in
the temporary test override** enabled the localhost mapping; the full rerun
passed as recorded above. The instructions include that corrected test setup.

Not verified: the full multi-service stack, native AMD64 execution, deployment
against development/production data, an archived older application image, or
future migration compatibility. The older-state check used the existing `0001`
revision with the current source image. Production revisions were not modified;
the intentional failure existed only in a disposable mounted copy.

### Cleanup

After all rehearsal/tests, from the same terminal:

```bash
dc down -v --remove-orphans
```

This removes only the uniquely named rehearsal project's containers, networks,
and volumes. Keep `CHECK_DIR` while inspecting its temporary fixtures, or remove
that specific directory afterward. Never run an unqualified `docker compose
down -v` against the development project as test cleanup. To stop development
containers while preserving data, use
`docker compose stop supplier-service supplier-db`. Built test images may remain
in the local image cache.
