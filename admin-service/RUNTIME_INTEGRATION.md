# Admin shared runtime integration

Nominated editor: Darryl's Admin task. This change prepares Compose, gateway, broker and CI.
The regular local activation and owner-review confirmation are recorded below.

## Owner review before activation

On 4 November 2026 Darryl confirmed that Jun Hui and the affected owners completed the shared
Admin runtime review, authorizing regular local activation. The table below records the earlier
runtime handoff; the new Order reporting UI and Admin lookup API still require their own affected
owner review before merge. Local activation preserves existing volumes and credentials and uses
the regular gateway; no test accounts/cases or synthetic evidence are seeded into this stack.

| Reviewer | Concrete scope to review | Status / remaining dependency |
| --- | --- | --- |
| Darryl — Admin/User | Private DB, signing-key pair and User trust, current eligibility, dashboard routes, test-only account fixtures | Task scope approved; operational key/data handoff and manual acceptance pending |
| Jun Hui — broker/gateway | Literal topics/groups, least-privilege ACLs, retention, rerunnable initialization, supplier route precedence, shared CI/image publishing | Runtime review complete, confirmed by Darryl on 4 November 2026 |
| Eldridge — Credit/Chat | Credit principal's new topics/group, correction outcome ownership, missing real consumer/outcome outbox, Chat DNS and callback trust | Runtime review complete per Darryl; Credit correction implementation and Chat runtime remain absent |
| XueTing — Order | Broker restart coordination, shared Compose/CI regression impact | Runtime review complete per Darryl; new reporting UI/API follow-up review remains pending |

No owner approval is inferred from an automated test. The regular stack was activated after the
explicit review confirmation, preserving existing databases and broker data. Its gateway is
`http://localhost:8088`; this checkout uses `ADMIN_DB_HOST_PORT=5545` in ignored `.env`, keeping
the disposable database on 5544 separate. No fixture accounts, reports or evidence were inserted.
Kubernetes/TLS/network-policy deployment is outside this local Compose iteration.

## Runtime and keys

Admin is `admin-service:8084`; its PostgreSQL 16 database is `admin-db:5432` on the internal
`admin-data` network. Only Admin joins that network. The database also joins a dedicated
`admin-db-host` bridge so Docker can publish its local inspection port; other services do not join
that bridge. Local Compose publishes PostgreSQL on
`127.0.0.1:${ADMIN_DB_HOST_PORT:-5544}` for desktop pgAdmin; it is not bound to LAN interfaces.
Use host `127.0.0.1`, port `5544` (or `ADMIN_DB_HOST_PORT`), maintenance database `ADMIN_DB_NAME`,
username `ADMIN_DB_USER` and password `ADMIN_DB_PASSWORD`. Disposable smoke projects suppress
this mapping to avoid collisions. This does not authorize cross-service database access. Its named
volume is `<compose-project>_admin-db-data`. No other service receives its credentials.
The separate `foc-admin-foundation` preview database/volume is not reused, reset or migrated.
If its data must be retained in the new runtime, arrange a stopped-writer backup/restore with
Darryl before switching traffic. Never attach two running PostgreSQL servers to one volume.

Provide the required values in `.env.example`: `ADMIN_DB_NAME`, `ADMIN_DB_USER`, `ADMIN_DB_PASSWORD`,
`ADMIN_SERVICE_PRIVATE_KEY`, `USER_SERVICE_TRUSTED_KEYS`, `KAFKA_ADMIN_SERVICE_PASSWORD`.
Use `admin_db` and `admin_user` for an existing default Admin volume; changing environment
values does not rename an initialized PostgreSQL database or role. New installations may choose
their own names. Compose passes the same values to Admin, PostgreSQL and its health check.
Keep existing trusted-key entries when adding Admin. Generate a separate RSA signing key;
do not reuse User's JWT signing private key. For example, using OpenSSL:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out admin-private.pem
openssl pkcs8 -topk8 -nocrypt -in admin-private.pem -outform DER | openssl base64 -A
openssl pkey -in admin-private.pem -pubout -outform DER | openssl base64 -A
```

The second command supplies `ADMIN_SERVICE_PRIVATE_KEY`; the third supplies `publicKey` in
`USER_SERVICE_TRUSTED_KEYS`, under the matching `ADMIN_SERVICE_KEY_ID` and subject `admin-service`.
Keep key files outside the repository and restrict their permissions. Chat's callback public
key goes in `ADMIN_SERVICE_TRUSTED_KEYS` only after Chat provides its approved identity/key.
An empty map denies unconfigured callbacks; it is not a permissive fallback.

Admin Kafka uses Spring's standard client properties with SASL/PLAIN, the dedicated
`admin_service` principal and its own password. Use generated hex passwords (no quotes,
backslashes or line breaks), matching the existing local broker credential convention.
No application uses the broker administrator credentials. This authenticated local transport
does not add production encryption or broker redundancy.

After owner review and configuring keys/secrets, start the shared runtime with:

```sh
docker compose config --quiet
docker compose up -d --wait kafka
docker compose run --rm kafka-init
docker compose up -d --build admin-service gateway
docker compose up -d kafka-ui
```

Adding the broker principal requires a coordinated broker restart/recreation. Rerun `kafka-init`
to apply topics/ACLs; `admin-service` waits for it. Do not delete shared volumes. Existing preview
processes using port 8084 must be identified and stopped deliberately, or choose `ADMIN_HOST_PORT`.
`up gateway` alone retains the existing core-only dependency graph; explicitly include Admin.
`docker compose up -d --build` starts all services, including Admin.

Use the browser at `http://localhost:8088`, sign in through User and select Admin mode, then
open `/admin`. Direct ports do not share browser session storage with the gateway origin.
User's existing first-admin bootstrap still requires its documented email verification setup;
this change does not create a default administrator or weaken registration.

## Routes and broker permissions

Gateway forwards `/admin`, `/admin/**`, `/admin-assets/**`, `/api/admin/**` and
`/docs/admin/openapi.json`. Supplier's `/admin/suppliers/**` and `/api/admin/suppliers/**`
routes precede the general Admin routes. `/internal/**` has no gateway route.
Admin continues to authorize requests locally.

| Resource | Admin principal | Credit principal |
| --- | --- | --- |
| `admin.credit.commands` (3 partitions, 7 days) | Write/Describe | Read/Describe |
| `credit.admin.events` (3 partitions, 7 days) | Read/Describe | Write/Describe |
| `admin.credit.commands.DLT` (1 partition, 30 days) | None | Write/Describe |
| `credit.admin.events.DLT` (1 partition, 30 days) | Write/Describe | None |
| `admin-service-credit` group | Read | None |
| `credit-service-admin` group | None | Read |

Admin receives cluster IdempotentWrite only; no Create/Alter or outcome-topic Write.
Kafka UI receives read/describe access to the four topics and describe access to the groups,
without business-group Read. Existing core permissions are preserved. Retention is a local
default, not a production retention agreement. The later case-event delivery iteration adds
`admin.events` and a separately fenced transactional relay; see the Admin README. Chat consumption
remains pending. Sanctions and recovery were added in their subsequent iterations.
Independent topic and principal setup runs in bounded parallel groups; the initializer waits
for every child and fails if any child fails. Admin starts only after successful initialization.

## Verification and interpretation

```sh
python3 .github/scripts/compose_env_check.py
python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
python3 admin-service/scripts/runtime_smoke.py
./deploy/kafka/Test-LocalKafka.sh
```

The runtime smoke requires Docker Compose with `!override` support (2.24.4+) and OpenSSL.
It creates a unique disposable project, ignores `.env`, generates throwaway credentials, uses
random loopback ports, and cleans up only its own containers/volumes. It builds the actual
Admin/User/gateway images and uses real PostgreSQL and authenticated Kafka with this change's
initializer. It registers a disposable User and activates/promotes it using **test-only fixture
SQL in the disposable User database**; email verification/bootstrap are not acceptance-tested.
It seeds **test-only Admin case data**, so this is not Chat reporting eligibility verification.

Its outcome producer simulates Credit by using Credit's scoped broker identity. Tests cover
command delivery, immutable retry identity, missing-outcome UNKNOWN, duplicate rejected outcomes,
restart persistence, real User JWT/eligibility calls and User outage. A simulated insufficient-
funds rejection proves only Admin's handling of that outcome, not actual balance arithmetic.
No Credit application or ledger runs in this smoke; no simulated outcomes enter live history.

The separate broker smoke verifies topic configuration, ACLs, denied writes/groups and restart
persistence. To run beside an existing stack, select a unique `COMPOSE_PROJECT_NAME`,
`KAFKA_HOST_PORT` and `KAFKA_UI_HOST_PORT`. Run it only against its disposable smoke project.
When launching the shell smoke through Git Bash on Windows, set
`MSYS2_ARG_CONV_EXCL='/bin/bash;/opt/foc-kafka/'` so container paths are not rewritten as Windows paths.

CI adds Admin backend/PostgreSQL/Kafka tests, frontend lint/typecheck/test/build and this isolated
container smoke. Image selection includes Admin; the registry publisher needs permission to
`arkanian4/foc-admin-service`. No image is published by running the local checks.

Real Credit acceptance remains blocked until Eldridge implements durable correction command
consumption, current administrator/target checks, transactional effect/inbox/outcome outbox,
duplicate command outcome republication and recovery. Verify one financial effect, authoritative
insufficient-funds rejection and unchanged reserved credits against that real service later.
See `INTEGRATION_READINESS.md` for all other owner dependencies.

## Manual acceptance after owner review

- Sign in through the shared gateway with an active administrator, select Admin mode and open
  the Admin tab. Check the packaged dashboard and navigation at desktop and mobile sizes.
- Sign out, then use a participant session: protected Admin content must not remain visible;
  sign-in and access-denied states must be clear.
- In a disposable environment, interrupt User availability and confirm the protected dashboard
  reports the dependency failure without granting access. Automated runtime coverage already
  verifies the corresponding 503 response.
- Inspect broker topics and the `admin-service-credit` group using the authenticated operational
  UI. Treat a broker-confirmed command as delivery only. Financial acceptance awaits real Credit.
- Record affected-owner review and the manual outcome before declaring shared activation and this
  iteration accepted. Real Chat evidence/reporting/conversations remain separate acceptance work.

## Sanctions extension

The subsequent [sanctions iteration](SANCTIONS_INTEGRATION.md) adds real User-owned ban handling,
`admin.user.commands`/`user.admin.events` and their DLTs with scoped Admin/User groups. The runtime
smoke now verifies real User outcomes in addition to the original explicitly simulated Credit
outcomes. Shared activation/owner review remains pending. Standalone sanctions default off;
shared Compose prepares `USER_ADMIN_COMMANDS_ENABLED=true` and User waits for broker initialization.
