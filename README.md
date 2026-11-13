# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

Friend on Campus (FoC) is a peer-to-peer campus errand platform for NUS
students. A requester can ask another student to collect an item from a campus
supplier and deliver it to a chosen campus location. Couriers earn credits for
completed errands, creating a closed internal economy: credits cannot be bought,
withdrawn, or exchanged for money.

FoC is implemented as a service-oriented application:

- **Frontend Service** — Next.js web application providing authentication,
  supplier browsing, errand creation, order tracking, credit views, and
  server-side service integration. Session tokens remain in secure HTTP-only
  cookies.
- **User Service** — student registration, authentication, sessions, profiles,
  roles, account lifecycle, and authorization.
- **Supplier Service** — NUS supplier and category data, public browsing,
  administrator reads, validation, soft deletion, seed imports, and supplier
  image delivery.
- **Order Service** — errand creation and idempotency, supplier validation,
  courier acceptance, pickup, completion, cancellation, expiry, and order
  lifecycle events.
- **Credit Service** — account initialization, reservations, settlement,
  refunds, transaction auditing, administrator adjustments, transactional
  outbox processing, and dead-letter handling.
- **Notification Service** — per-user notifications generated from order events,
  notification history, read-status updates, and live Server-Sent Events.
- **Event Broker and Contracts** — Kafka topics and versioned AsyncAPI contracts
  coordinate asynchronous order, credit, and notification workflows.

Each backend service owns its PostgreSQL database. Kafka provides durable
event delivery with idempotent consumers, retries, transactional outboxes, and
dead-letter queues. Services communicate through documented APIs rather than
direct database access. Internal User Service calls use certificate-verified
HTTPS.

The complete stack can run locally with Docker Compose and can also be
deployed to a local kind Kubernetes cluster or AWS EKS. Centralized backend
logging uses structured JSON records collected by Vector, stored in Loki, and
visualized and alerted through Grafana.

The main remaining integration work is relaying Notification Service history
and live events through the Frontend Service. Administrator interfaces for
credit, account, and order management are also not yet exposed in the frontend.

---

## Team Members

| Name        | Role             |
| ----------- | ---------------- |
| Swee Kah Ho | Frontend Service + Admin Dashboard |
| Max Khoo    | User Service + Centralized Logging    |
| Keith Shen  | Supplier Service + Notification Service |
| Chen Chi    | Credit Service + Cloud Deployment |
| Ewen Low    | Order Service + Kubernetes  |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── frontend-service/              # Next.js web application
│   ├── app/                       # Routes and pages
│   ├── components/                # Reusable UI components
│   ├── lib/                       # Server clients, actions, validation, utilities
│   └── test/                      # Frontend tests
│
├── user-service/                  # Accounts, authentication, profiles, roles
│   ├── app/
│   ├── alembic/
│   ├── scripts/
│   └── tests/
│
├── supplier-service/              # Suppliers, categories, seed imports
│   ├── app/
│   ├── migrations/
│   ├── database/
│   ├── seed/
│   ├── tools/
│   ├── documentation/
│   └── tests/
│
├── order-service/                 # Errand lifecycle and order events
│   ├── app/
│   ├── alembic/
│   └── tests/
│
├── credit-service/                # Closed credit economy and settlement
│   ├── app/
│   ├── alembic/
│   └── tests/
│
├── notification-service/          # Notification history and live SSE streams
│   ├── app/
│   ├── alembic/
│   ├── ai/
│   └── tests/
│
├── packages/
│   └── foc-observability/         # Shared structured logging and context
│
├── contracts/
│   ├── asyncapi.yaml              # Versioned Kafka event contract
│   └── README.md
│
├── event-broker/                  # Kafka topic setup and broker guidance
├── data/                          # Seed CSVs, images, mappings, and provenance
├── observability/                 # Vector, Loki, and Grafana configuration
├── deploy/
│   ├── k8s/                       # Kubernetes manifests
│   └── aws/                       # AWS and GitHub OIDC infrastructure
├── docs/                          # Architecture, HTTPS, observability, and EKS guides
├── scripts/                       # TLS, Compose, Kubernetes, EKS, and verification scripts
├── compose.yaml                   # Local multi-service deployment
├── pytest.ini                     # Shared Python test configuration
└── LICENSE
```

---

## Running Locally with Docker Compose

Services can be run via the root [`compose.yaml`](./compose.yaml).

Generate the local internal CA and User Service certificate once before the
first Compose start:

```powershell
.\scripts\generate-dev-tls.ps1
```

See [`docs/internal-https.md`](./docs/internal-https.md) for the internal HTTPS
trust model and production certificate guidance.

If `.env` does not exist, copy `.env.example` to `.env` and configure its required
credentials. Supplier startup automatically enables PostGIS, provisions its
database roles, runs migrations, and applies runtime grants before starting the
API. No manual SQL setup is needed; see the
[Supplier startup guide](supplier-service/README.md#docker-compose).

Start the services:

```bash
docker compose up
```

Rebuild after making changes:

```bash
docker compose up --build
```

Stop and remove the containers:

```bash
docker compose down
```

---

## Running on Kubernetes (kind)

The same stack can run on a local [kind](https://kind.sigs.k8s.io/) cluster.
Manifests under [`deploy/k8s/`](deploy/k8s/) keep the Compose service names, so
`https://user-service:8080` and `kafka:9092` still resolve. Compose is unchanged.

Install kind (`brew install kind`) in addition to Docker and kubectl. Copy
`.env.example` to `.env`, then generate the development certificates once.
On Windows, `scripts/generate-dev-tls.ps1` writes the same files.

```bash
./scripts/generate-dev-tls.sh
./scripts/k8s-up.sh
```

`./scripts/k8s-up.sh --demo` also starts the Kafka UI and the demo console.
That flag needs `demo-console/` in the checkout.
Re-running the script rebuilds the images, keeps the database volumes, and
replaces the one-shot migration Jobs. `./scripts/k8s-down.sh` deletes the
cluster. Changing [`deploy/k8s/kind-config.yaml`](deploy/k8s/kind-config.yaml)
requires a new cluster, because kind reads host port mappings only at creation.

| Surface | URL |
| --- | --- |
| Frontend | http://127.0.0.1:3000 |
| Supplier Service | http://127.0.0.1:8081 |
| Order Service | http://127.0.0.1:8082 |
| Credit Service | http://127.0.0.1:8083 |
| Kafka UI (`--demo`) | http://127.0.0.1:8090 |
| Demo console (`--demo`) | http://127.0.0.1:8091 |

User Service stays inside the cluster at `https://user-service:8080`, matching
Compose, which does not publish it on the host.

Supplier seed is the Compose `tools` profile. The CSV is CP1252, so it is
stored in a Secret rather than a ConfigMap. Run it after the stack is up:

```bash
kubectl -n foc delete job supplier-seed-dry-run --ignore-not-found
kubectl apply -k deploy/k8s/tools-dry-run
kubectl -n foc wait --for=condition=complete job/supplier-seed-dry-run --timeout=180s

kubectl -n foc delete job supplier-seed --ignore-not-found
kubectl apply -k deploy/k8s/tools
kubectl -n foc wait --for=condition=complete job/supplier-seed --timeout=180s
```

## AI Use Summary (FoC)

Codex (GPT-6) assisted Supplier Service work. The
[Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service)
and [usage log](supplier-service/ai/usage-log.md) record the affected files and evidence.
Claude Code (claude-opus-5-5 and claude-sonnet-5-5) assisted Notification Service work; see the
[Notification Service summary](notification-service/README.md#ai-use-summary-notification-service)
and [usage log](notification-service/ai/usage-log.md).
A Cursor agent (model not recorded) assisted Ewen Low's Order Service, event broker,
demo, Kubernetes, review and slide work; see
[Ewen Low's disclosure](#ewen-low-order-service-event-broker-demo-kubernetes).
Claude Code (claude-opus-5-5) also assisted Frontend Service work; see the
[Frontend Service summary](frontend-service/README.md#ai-use-summary-frontend-service)
and [usage log](frontend-service/ai/usage-log.md).

- [Database and migration work](supplier-service/ai/usage-log.md#ai-20260929-001):
  Requirements work, Learning support, Boilerplate generation, Writing implementation
  code, Debugging assistance, and Refactoring and documentation improvements covered
  migrations, role access, image configuration, integration checks, and related root
  configuration. The prior record reports 54 passing disposable-PostGIS tests,
  no Alembic drift, a successful image build, and confirmed author review. It also
  records unavailable original timestamps; the service summary notes redacted excerpts.
- [Readiness work](supplier-service/ai/usage-log.md#ai-20260929-002): Writing
  implementation code covered `/ready` and isolated readiness/liveness tests using
  the existing engine and Alembic setup. Changes were retained; 40 API/unit tests
  and `git diff --check` passed, with one dependency deprecation warning.
  PostgreSQL integration was not run for this change. Keith confirmed review of
  all affected readiness changes; no human test rerun is claimed.
  The exact prompt and final response are recorded; original timestamps are unavailable.

- [Compose migration gating](supplier-service/ai/usage-log.md#ai-20260929-003):
  Codex (GPT-6) provided Boilerplate generation for `compose.yaml` and the Supplier
  Dockerfile, configuring a shared image, migration job, startup dependencies,
  and readiness health check. Changes were retained and reviewed by Keith.
  Agent checks verified image build, packaged revisions, explicit migration,
  successful startup, disposable failure blocking startup, recovery, Compose
  validation, and `git diff --check`. The full stack and development database
  were not tested; no human test rerun is claimed. Exact prompt and response
  excerpts are recorded; original timestamps are unavailable.

- [Deployment documentation and port correction](supplier-service/ai/usage-log.md#ai-20260929-004):
  Codex (GPT-6) provided Refactoring and documentation improvements and Debugging
  assistance for the Supplier README and operations guide. Keith reviewed the
  retained work. Disposable deployment/recovery checks passed; after a test-only
  network correction, 74 tests passed with no skips and one dependency warning.
  Shell syntax, links, and `git diff --check` passed. The later wording correction
  was checked without rerunning Docker tests. Full-stack, AMD64, archived-image,
  and development/production deployments were not verified. Exact prompts and
  response excerpts are recorded; original timestamps are unavailable. No human
  test rerun is claimed.

- [Creation validation](supplier-service/ai/usage-log.md#ai-20260930-001):
  Codex (GPT-6) provided Writing implementation code for Pydantic client/result
  types, aggregate creation validation, the shared parsing-error adapter, and
  focused tests. The work remains in the working tree. Agent checks passed 112
  creation tests and 97 domain tests, with one dependency warning per run and
  no unavailable requested checks after correcting an initial test-file path.
  Keith confirmed review of all four affected files; no human rerun is claimed.
  The exact prompt and final
  response are recorded; original timestamps are unavailable. No redactions or
  header exceptions apply.

- [PATCH validation](supplier-service/ai/usage-log.md#ai-20260930-002):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for shared schemas, pure merged-value validation,
  update-service usage guidance, and focused tests. The work was retained and
  all three affected files were reviewed by Keith. Agent checks passed 90 PATCH
  tests and 209 creation/domain tests, with one dependency warning per run and
  no unavailable requested checks. No human test rerun is claimed. The exact
  prompt and final response are recorded; original timestamps are unavailable.
  No redactions or header exceptions apply.

- [HTTP validation integration](supplier-service/ai/usage-log.md#ai-20260930-003):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for shared 422 handlers, safe request-error
  conversion, test-only routes, and future API/import guidance. All four affected
  files were retained and reviewed by Keith. Agent checks passed 357 unit/API
  tests, including health and readiness, with one existing dependency warning
  and no unavailable requested checks. Coverage and final syntax/documentation
  checks were reviewed; no human test rerun is claimed. The exact prompt and
  final response are recorded; original timestamps are unavailable. No
  redactions or header exceptions apply.

- [Permanent seed mapping](supplier-service/ai/usage-log.md#ai-20260930-004):
  Codex (GPT-6) provided Requirements work for the reviewed JSON data, authored
  permanent labels and one-time UUIDv4 values, and provided Writing implementation
  code for mapping tests. All three files were retained and reviewed by Keith.
  Agent verification: 12 tests passed with one dependency warning and the source
  CSV SHA-256 remained unchanged. No human test rerun is claimed. The exact prompt
  and final response are recorded; original timestamps are unavailable.
  Header exceptions: `supplier-service/seed/manifest.json` and
  `supplier-service/seed/area_mapping.json` are strict JSON and cannot contain comments.
  See the [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [CSV source loading](supplier-service/ai/usage-log.md#ai-20260930-005):
  Codex (GPT-6) provided Writing implementation code, Refactoring and documentation
  improvements, and Boilerplate generation for the Supplier command-support package,
  loader, tests, and CP1252 fixture. Retained refinements count malformed duplicate
  rows and report syntax-error line numbers after blank lines correctly. Agent
  verification: 55 tests passed with one dependency warning, including stability
  of all 21 real associations after reordering. Keith confirmed review of all four
  affected files, including the final refinements. No human test rerun is claimed.
  The original exact prompt and response excerpts are recorded as one task;
  original timestamps are unavailable. Header exception:
  `supplier-service/tests/fixtures/seed_source.csv` is CP1252 CSV data that cannot
  safely contain attribution comments. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Shared seed scalar validation](supplier-service/ai/usage-log.md#ai-20260930-006):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for shared supplier schemas, pure seed scalar
  validation, and 61 new tests. The changes were retained and all three files
  were reviewed by Keith. Agent verification: 473 unit/API tests passed with one
  dependency warning; `git diff --check` passed. No human test rerun is claimed.
  The exact prompt and final response are recorded; original timestamps are
  unavailable. No redactions or header exceptions apply to this entry. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Seed normalization](supplier-service/ai/usage-log.md#ai-20260930-007):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for typed seed normalization and its tests. Retained
  behavior includes controlled category names, reviewed schedule corrections,
  exact image references, and whole-batch rejection. Keith reviewed both files.
  Agent verification: 163 focused tests passed with one dependency warning;
  real-data checks and `git diff --check` passed, and source CSV bytes were unchanged.
  No human test rerun is claimed. The exact prompt and final response are recorded;
  original timestamps are unavailable. No redactions or header exceptions apply.
  See the [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Seed dry-run command](supplier-service/ai/usage-log.md#ai-20260930-008):
  Codex (GPT-6) provided Writing implementation code for the CLI and subprocess
  tests, and Refactoring and documentation improvements for usage guidance.
  All three affected files were retained and reviewed by Keith. Agent verification:
  the real CSV produced 21 suppliers, 26 assignments, five corrections, and no
  issues; 528 unit/API tests passed with one dependency warning. Checks covered
  inert import, absent database access, stable identities/counts, unchanged data,
  and final syntax/whitespace. No requested checks were unavailable; no human test
  rerun is claimed. The exact prompt and final response are recorded; original
  timestamps are unavailable. No redactions or header exceptions apply. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Database seed classification](supplier-service/ai/usage-log.md#ai-20260930-009):
  Codex (GPT-6) provided Boilerplate generation, Writing implementation code, and
  Refactoring and documentation improvements for repository/service packages,
  read-only classification, integration tests, and the confirmed identity policy.
  All six files were retained and reviewed by Keith. Agent verification: 545 tests
  passed, including 17 isolated migrated PostgreSQL/PostGIS tests, with one existing
  dependency warning. Classification preserved database values and pending caller
  state. The scoped whitespace check passed; the repository-wide check reported
  pre-existing usage-log whitespace. No human test rerun is claimed. The exact
  prompt and final response are recorded; original timestamps are unavailable.
  No redactions or header exceptions apply. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Atomic supplier import](supplier-service/ai/usage-log.md#ai-20260930-010):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for service-owned transactions, repository insertion
  helpers, and rollback/concurrency tests. All three files were retained and
  reviewed by Keith. Agent verification: 558 tests passed, including 30 seed
  integration cases against isolated migrated PostgreSQL/PostGIS, with one
  existing dependency warning. Tests verified repeatability, preserved edits and
  deletion, assignment/pre-commit rollback, and explicitly synchronized importer
  and API races. Test databases and the container were removed; syntax and
  whitespace checks passed. No human test rerun is claimed. The exact prompt and
  final response are recorded; original timestamps are unavailable. No redactions
  or header exceptions apply. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- Recent Supplier seed command work: Codex (GPT-6) provided Writing
  implementation code, Refactoring and documentation improvements, and Debugging
  assistance for the CLI, parser snapshot, importer outcome reporting, and tests.
  Retained work and exact exchanges are consolidated as Prompts 1–3 for the
  [database-aware CLI](supplier-service/ai/usage-log.md#ai-20260930-011),
  [snapshot/passwordless fixes](supplier-service/ai/usage-log.md#ai-20260930-011),
  and [uncertain commits](supplier-service/ai/usage-log.md#ai-20260930-011).
  Agent verification passed 591, 596, and 599 tests respectively, each with one
  existing dependency warning. Tests included passwordless PostGIS and a real
  commit followed by simulated lost acknowledgement; test resources were removed.
  Keith confirmed review of all five affected files across these exchanges.
  No human test rerun is claimed.
  Exact prompts and final responses are recorded; original timestamps are
  unavailable. No redactions or header exceptions apply. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Explicit Supplier seed packaging](supplier-service/ai/usage-log.md#ai-20260930-012):
  Codex (GPT-6) provided Boilerplate generation for the service Dockerfile and
  root Compose tools service, and Refactoring and documentation improvements
  for the service README and seed mapping guide. All four changes were retained
  and reviewed by Keith. During this exchange, Compose validation, image builds,
  bootstrap, migrations, and grants passed on Linux/ARM64; Docker startup stalled
  before seed execution checks, and cleanup timed out. No successful container
  import or human test rerun is claimed for this entry. The exact prompt and
  final response are recorded; original timestamp unavailable, with no redactions
  or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Active Supplier detail reads](supplier-service/ai/usage-log.md#ai-20260930-013):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the repository, new read service, and PostGIS
  integration tests. All three files were retained and reviewed by Keith.
  Agent verification passed 612 read/seed integration and unit/API tests, with
  one existing dependency warning; syntax and scoped whitespace checks passed.
  The disposable database was removed. The full schema/runtime-role integration
  suite was not run; no human test rerun is claimed. The exact prompt and final
  response are recorded; original timestamp unavailable, with no redactions or
  header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Active Supplier listing and pagination](supplier-service/ai/usage-log.md#ai-20260930-014):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the repository, service, and PostGIS tests.
  All three files were retained and reviewed by Keith. Agent checks passed
  639 read/seed integration and unit/API tests, with one existing dependency
  warning, plus syntax and scoped whitespace checks. Fresh-session tests verified
  bounded query growth and unchanged stored data. The disposable database was
  removed; the full schema/runtime-role integration suite was not run. No human
  test rerun is claimed. The exact prompt and final response are recorded;
  original timestamp unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Controlled Supplier category and area readers](supplier-service/ai/usage-log.md#ai-20260930-015):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the repository, service, and read integration
  tests. All three files were retained and reviewed by Keith. Agent checks passed
  653 read/seed integration and unit/API tests and a separate database-independent
  area test, with an existing dependency warning. Syntax and scoped whitespace
  checks passed; the disposable database was removed. Full schema/runtime-role
  integration coverage was not run; no human test rerun is claimed. The exact
  prompt and final response are recorded; original timestamp unavailable, with
  no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Supplier read response models](supplier-service/ai/usage-log.md#ai-20260930-016):
  Codex (GPT-6) provided Writing implementation code for response schemas and
  detached-value serialization tests. Both files were retained and reviewed by
  Keith. Agent checks passed 11 new tests and all 552 unit/API tests with one
  dependency warning; scoped whitespace checks passed. Database integration
  tests were not run; no human test rerun is claimed. The exact prompt and final
  response are recorded; original timestamp unavailable, with no redactions or
  header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Unregistered Supplier GET adapters](supplier-service/ai/usage-log.md#ai-20260930-017):
  Codex (GPT-6) provided Writing implementation code for the supplier router and
  isolated HTTP tests. Retained handlers use existing services and response models
  and remain unregistered pending authentication. During this exchange, 37 read
  HTTP/serialization tests and all 578 unit/API tests passed with one dependency
  warning; scoped whitespace checks passed. Database integration tests were not
  run. Keith confirmed review of both affected files; no human test rerun is claimed. The exact
  prompt and final response are recorded; original timestamp unavailable, with
  no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Controlled reference-data GET adapters](supplier-service/ai/usage-log.md#ai-20260930-018):
  Codex (GPT-6) provided Writing implementation code for the reference-data router
  and isolated HTTP tests. Retained handlers preserve ordered choices and
  database-free areas; all four read adapters remain unregistered in production.
  Agent checks passed 43 read HTTP/serialization tests and all 584 unit/API tests,
  with one dependency warning. Combined read collection passed with 97 tests;
  scoped whitespace checks passed. Database integration tests were not run.
  Keith confirmed review of both files; no human test rerun is claimed. The exact prompt
  and final response are recorded; original timestamp unavailable, with no
  redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Synchronous Supplier User Service client](supplier-service/ai/usage-log.md#ai-20260930-019):
  Codex (GPT-6) provided Writing implementation code for the client and mock
  tests, and Boilerplate generation for the client package and HTTPX dependency
  relocation. All five files were retained; Keith approved the original
  implementation. During that exchange, 71 focused tests and all 655 unit/API
  tests passed with one existing dependency warning; scoped whitespace checks
  passed. Live-service and database integration checks were not run; no human
  test rerun is claimed. The exact prompt and final response are recorded;
  original timestamp unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Supplier User Service client lifecycle](supplier-service/ai/usage-log.md#ai-20260930-020):
  Codex (GPT-6) provided Writing implementation code for the application factory
  and startup tests. Retained changes share one client per lifespan and clean up
  client/database resources on shutdown and startup failures. Agent checks passed
  10 startup tests and all 666 unit/API tests with one existing dependency warning;
  scoped whitespace checks passed. Live-service and database integration checks
  were not run. Keith subsequently confirmed review of both affected files; no
  human test rerun is claimed. The exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Supplier authentication and administrator dependencies](supplier-service/ai/usage-log.md#ai-20260930-021):
  Codex (GPT-6) provided Writing implementation code for authentication
  dependencies, the dedicated error handler, and isolated API tests. All three
  files were retained and reviewed by Keith for this implementation. Agent checks
  passed 47 combined authentication/validation-error tests and all 695 unit/API
  tests, including 29 new tests, with one existing dependency warning; scoped
  whitespace checks passed. An initial test-file path error was corrected.
  Live-service and database integration checks were not run; no human test rerun
  is claimed. The exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Public Supplier and reference-data reads](supplier-service/ai/usage-log.md#ai-20260930-022):
  Codex (GPT-6) provided Writing implementation code for router registration and
  read/probe regression tests, plus Refactoring and documentation improvements
  for router descriptions and verification guidance. All eight affected files
  were retained and reviewed by Keith, including the additional validation-test
  correction. Agent checks passed 121 focused tests and all 723 unit/API tests
  after correcting the stale route-exclusion assertion, with one dependency
  warning; syntax and scoped whitespace checks passed. No Compose services were
  running, so live login/logout checks were not performed; database integration
  tests were not run. No human test rerun is claimed. The exact prompt and final
  response are recorded; original timestamp unavailable, with no redactions or
  header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Shared supplier seed/create insertion](supplier-service/ai/usage-log.md#ai-20261001-001):
  Codex (GPT-6) provided Writing implementation code for the repository helper
  and direct integration coverage, plus Refactoring and documentation improvements
  for the docstring. Retained work excludes category IDs from supplier inserts and
  preserves separate assignments and caller-owned transactions. Historical agent
  checks passed 62 seed integration tests, 723 unit/API tests, two focused SQL
  cases, and scoped whitespace checks, with one existing dependency warning.
  Subsequent test edits have unestablished authorship/timing and are not covered
  by those historical results. Keith confirmed review of both affected files; Keith also confirmed a test rerun, with commands and results unspecified. The exact prompt and
  final response are recorded; original timestamp unavailable, with no redactions
  or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Atomic supplier creation service](supplier-service/ai/usage-log.md#ai-20261001-002):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the creation service, plus Writing implementation
  code and Boilerplate generation for isolated PostGIS coverage. Retained changes
  validate and persist atomically, return detached values after commit, translate
  only the exact duplicate constraint, and never retry uncertain writes. Agent
  checks passed 878 creation/read/seed/unit/API tests, including 39 new creation
  cases, with one dependency warning; syntax and scoped whitespace checks passed.
  Keith confirmed review of both files; no human test rerun is claimed for this
  increment. The exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Administrator supplier POST adapter](supplier-service/ai/usage-log.md#ai-20261001-003):
  Codex (GPT-6) provided Writing implementation code for the POST adapter and
  API regressions, plus Refactoring and documentation improvements for the router
  docstring. All four files were retained and reviewed by Keith, including the
  additional GET-registration assertion correction. Agent checks passed 148
  focused API tests and all 765 unit/API tests, including 42 new POST cases,
  with one dependency warning; syntax and scoped whitespace checks passed.
  Controlled User Service responses exercised real authentication dependencies.
  Live-service and PostGIS checks were not run for this increment; no human test
  rerun is claimed. The exact prompt and verbatim relevant response excerpt are
  recorded; original timestamp unavailable, with no redactions or header exceptions.
  See the [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Supplier POST duplicate-policy and concurrency verification](supplier-service/ai/usage-log.md#ai-20261001-004):
  Codex (GPT-6) provided Writing implementation code and Boilerplate generation
  for 12 additional PostGIS-backed cases in the creation integration test file.
  Retained tests cover exact duplicate rules, deleted-history preservation,
  canonical public reads, rollback, and synchronized independent commit/rollback
  races using mounted routes and controlled administrator authentication. Agent
  checks passed 199 tests, including 51 creation integration and 148 API cases,
  with one dependency warning; syntax and scoped whitespace checks passed.
  Disposable migrated databases were cleaned up. Keith confirmed review of the
  test file; no human test rerun is claimed for this increment. No requested checks
  were blocked. The exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Supplier creation documentation](supplier-service/ai/usage-log.md#ai-20261001-005):
  Codex (GPT-6) provided Refactoring and documentation improvements for the service
  README and Writing implementation code for its live HTTP smoke procedure.
  Retained content documents implemented POST, canonical examples, safe errors,
  atomic persistence, seed/API reuse, and planned feature boundaries. Schema and
  canonical-example checks, script syntax, paths, anchors, and whitespace checks
  passed. No application suite was rerun; live smoke was not executed without an
  approved administrator account and agreed provisioning process. Keith confirmed
  review of the README and procedure; no human test rerun is claimed for this
  increment. Exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Atomic versioned supplier updates](supplier-service/ai/usage-log.md#ai-20261001-006):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the service/repository layers, plus Writing
  implementation code and Boilerplate generation for update tests. Retained work
  adds merged validation, atomic version checks and category replacement, fresh
  conflict classification, and detached post-commit responses. Agent checks passed
  44 update cases, 51 creation integration cases, and 765 unit/API tests, with one
  dependency warning; syntax and whitespace checks passed. Temporary PostGIS
  resources were removed. Broader read/seed/schema suites were not run; no checks
  remained blocked. Keith reviewed all three files; no human test rerun is claimed.
  Exact prompt and final response are recorded; original timestamp unavailable,
  with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Administrator supplier PATCH adapter](supplier-service/ai/usage-log.md#ai-20261001-007):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the route, Writing implementation code and
  Boilerplate generation for API tests, and Writing implementation code and
  Debugging assistance for the stale registration assertion. Retained work adds
  administrator-only PATCH, aggregate validation, positive expected versions,
  canonical saved output, and safe errors through the existing atomic service.
  Agent checks passed 55 new PATCH cases and all 820 unit/API tests after the
  assertion correction, with one dependency warning; syntax and whitespace checks
  passed. Live-service and PostGIS checks were not rerun. Keith reviewed all three
  files; no human test rerun is claimed. Exact prompt and final response are
  recorded; original timestamp unavailable, with no redactions or header exceptions.
  See the [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [PATCH concurrency and rollback verification](supplier-service/ai/usage-log.md#ai-20261001-008):
  Codex (GPT-6) provided Writing implementation code and Boilerplate generation
  for 13 additional update integration cases. Retained tests exercise mounted
  routes and real PostGIS with controlled authentication, synchronized independent
  writes, complete rollback snapshots, stale/no-op behavior, canonical public
  reads, and deletion-race classification. Agent checks passed 57 update integration
  cases and 174 selected API cases, with one dependency warning; syntax and
  whitespace checks passed. Disposable resources were removed. No requested checks
  were blocked; broader suites and live authentication were not run. Keith reviewed
  the retained changes; no human test rerun is claimed. The exact prompt and verbatim
  relevant response excerpt are recorded; original timestamp unavailable, with no
  redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Implemented PATCH documentation](supplier-service/ai/usage-log.md#ai-20261001-009):
  Codex (GPT-6) provided Refactoring and documentation improvements for the
  Supplier Service README. Retained changes document mounted administrator PATCH,
  version checks, complete saved/conflict examples, atomic failure behavior, and
  test coverage/prerequisites while preserving planned DELETE and administrative
  reads. Merged example validation, exact canonical response comparison, conflict
  body, test paths, summary placement, and whitespace checks passed. No application
  suite or live smoke check was rerun; prior results remain historical. Keith
  reviewed the retained README changes; no human test rerun is claimed. Exact
  prompt and final response are recorded; original timestamp unavailable, with
  no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Atomic supplier soft deletion](supplier-service/ai/usage-log.md#ai-20261001-010):
  Codex (GPT-6) provided Writing implementation code and Refactoring and
  documentation improvements for the supplier repository/service, and Writing
  implementation code and Boilerplate generation for 31 new integration cases.
  Retained work adds refreshed row locking, version checks, write-free repeated
  deletion, preserved columns/assignments, and safe transaction failures without
  retries. Agent checks passed 88 update/deletion integration cases and 820 unit/API
  tests, with one dependency warning per suite; scoped whitespace checks passed.
  Disposable PostGIS resources were removed; broader integration suites were not
  run. Keith reviewed all three files; no human test rerun is claimed. Exact prompt
  and final response are recorded; original timestamp unavailable, with no
  redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Administrator supplier DELETE adapter](supplier-service/ai/usage-log.md#ai-20261001-011):
  Codex (GPT-6) provided Writing implementation code, Refactoring and documentation
  improvements, Boilerplate generation, and Debugging assistance across the new
  administrator router, app registration, API tests, and route assertion correction.
  Retained work adds positive-version validation, empty 204 after service completion,
  safe errors, and 31 DELETE cases covering authentication, repeat deletion,
  transaction failure, cleanup, no retries, and OpenAPI. Agent checks passed
  86 focused adapter cases and all 851 unit/API tests, with one dependency warning
  per suite; whitespace checks passed. Controlled dependencies required no external
  services; PostGIS integration was not rerun for this adapter. Keith reviewed all
  four files; no human test rerun is claimed. Exact prompt and final response are
  recorded; original timestamp unavailable, with no redactions or header exceptions.
  See the [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Protected administrator supplier reads](supplier-service/ai/usage-log.md#ai-20261001-012):
  Codex (GPT-6) provided Writing implementation code, Refactoring and documentation
  improvements, and Debugging assistance across the supplier repository/service,
  administrator router, and API/integration read tests. Retained work adds protected
  status-filtered listing and complete active/deleted detail reads while preserving
  anonymous active-only public reads. Agent checks passed 883 unit/API tests
  (including 91 focused read API cases) and 85 read integration tests against
  disposable PostGIS, with one dependency warning per suite; scoped whitespace
  checks passed. Initial route and working-directory errors were corrected and
  the test container removed. Broader integration suites and live authentication
  were not run. Keith reviewed all five files; no human test rerun is claimed.
  Exact prompt and final response are recorded; original timestamp unavailable,
  with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Deletion lifecycle verification](supplier-service/ai/usage-log.md#ai-20261001-013):
  Codex (GPT-6) provided Writing implementation code and Boilerplate generation
  for five integration cases across supplier updates, reads, and seed imports.
  Retained tests verify mounted deletion visibility, stable repeat deletion,
  real DELETE/PATCH contention, complete retained state, cleanup, and seed
  reimport preservation. All 240 integration cases passed against disposable
  PostGIS, with one dependency warning; collection and whitespace checks passed.
  Test resources were removed; no requested checks remained blocked. Authentication
  was controlled, not live. Keith reviewed all three files; no human rerun is
  claimed. Exact prompt and final response are recorded; original timestamp
  unavailable, with no redactions or header exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Deletion and administrator-read documentation](supplier-service/ai/usage-log.md#ai-20261001-014):
  Codex (GPT-6) provided Refactoring and documentation improvements for the
  Supplier Service README, covering implemented contracts, retention/concurrency,
  seed preservation, separate service authentication, examples, and verification
  commands. A follow-up fixed a remaining stale claim with an internal link.
  Canonical examples, OpenAPI declarations, test links, summary placement, and
  whitespace checks passed; application suites and live authentication were not
  rerun. Historical results remain historical. Keith reviewed the retained work
  and correction; no human rerun is claimed. Exact prompts and relevant responses
  are recorded; original timestamps unavailable, with no redactions or header
  exceptions. See the
  [Supplier Service summary](supplier-service/README.md#ai-use-summary-supplier-service).

- [Notification Service skeleton](notification-service/ai/usage-log.md#ai-20261103-001):
  Claude Code (claude-opus-5-5) provided Boilerplate generation, Writing
  implementation code, and Debugging assistance for the new service package,
  its tests, and Notification-related root `compose.yaml` and `.env.example`
  changes. A readiness hang against a frozen database was fixed before
  retention. Agent checks: 19 tests passed, `docker compose config` succeeded
  with existing services unchanged, and live startup, readiness, and
  configuration-failure checks passed. Keith reviewed all affected
  changes; no human test rerun is claimed. Exact prompts and key responses are recorded; original
  timestamps unavailable, no redactions; header exception for
  `notification-service/alembic/versions/.gitkeep`. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service database schema](notification-service/ai/usage-log.md#ai-20261104-001):
  Claude Code (claude-sonnet-5-5, then claude-opus-5-5) provided Writing
  implementation code, Boilerplate generation, Debugging assistance, and
  Refactoring and documentation improvements. The work covered the
  `processed_events` and `notifications` Alembic revision, the models, the
  PostgreSQL schema tests, a UTC session time zone for the app and Alembic, and
  the service README's "Running tests" section. All six of Keith's review
  points were adopted. Agent checks: 53 tests passed against disposable
  PostgreSQL (19 passed and 34 skipped without it); the migration round trip
  and `alembic check` succeeded; mutation checks passed. Keith confirmed that
  all tests and manual verification were completed and approved, and confirmed
  a test rerun, with commands and results unspecified. Exact prompts
  and verbatim key-response excerpts are recorded; original timestamps
  unavailable; no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service event validation and translation](notification-service/ai/usage-log.md#ai-20261104-002):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Debugging
  assistance, and Refactoring and documentation improvements for
  `notification-service/app/events.py` and its unit tests, following the user's
  specification and answers to three clarifying questions. All changes were
  retained, including a requested rename of `parse_record` to `process_record`.
  Agent checks: the full suite without a database had 435 passed, 34 skipped,
  and 1 warning; the tests caught all 21 mutations applied. Keith confirmed
  review and confirmed running `.venv/bin/python -m pytest tests/test_events.py`,
  with 416 passed. Exact prompts and verbatim
  key-response excerpts are recorded; original timestamps unavailable; no
  redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service Kafka consumer](notification-service/ai/usage-log.md#ai-20261104-003):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Boilerplate
  generation, Debugging assistance, and Refactoring and documentation improvements
  for the `order.events` consumer, the `start_at` cutoff, worker settings,
  Notification-related root `compose.yaml` and `.env.example` settings, tests, and
  the service README, following the user's specification. All changes were
  retained. Agent checks: the full suite with PostgreSQL 16 had 551 passed and 1
  warning; without a database, 494 passed, 57 skipped, and 1 warning; a live
  Compose run used a verification-only workaround for Order Service TLS trust.
  Keith confirmed verification, with 551 tests passed on the Pytest suite. 
  Exact prompts and verbatim key-response excerpts are recorded; original timestamps unavailable; 
  no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service consumer retries and DLQ](notification-service/ai/usage-log.md#ai-20261105-001):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Boilerplate
  generation, and Refactoring and documentation improvements for failure
  classification, retries, the dead-letter queue, Notification-related root
  `compose.yaml` and `.env.example` settings, tests, and the service README,
  following the user's specification. Agent checks: the full suite with PostgreSQL
  16 had 625 passed and 1 warning; without a database, 550 passed, 75 skipped, and
  1 warning; a live isolated Compose run covered the failure scenarios. Keith confirmed on 2026-11-08 (for ai-20261105-001 to ai-20261107-001 as one
  increment) running the full suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed;
  manually reading and verifying the code; and manual checks in an isolated Compose
  run. The
  exact prompt and key response excerpts are recorded; original timestamps unavailable; no redactions; no header exceptions.
  See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service oversized DLQ records](notification-service/ai/usage-log.md#ai-20261106-001):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Boilerplate
  generation, Debugging assistance, and Refactoring and documentation improvements
  for the DLQ size limits, Kafka error code logging, `event-broker/create-topics.sh`,
  real-broker tests, and documentation, after reproducing the user-reported restart
  cycle. Agent checks: the full suite with PostgreSQL 16 and Kafka 4.1.2 had 634
  passed and 1 warning; with neither, 554 passed, 80 skipped, and 1 warning; a live
  isolated Compose run covered the failure before and after the change. Keith confirmed on 2026-11-08 (for ai-20261105-001 to ai-20261107-001 as one
  increment) running the full suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed;
  manually reading and verifying the code; and manual checks in an isolated Compose
  run. Exact
  prompts and key response excerpts are recorded; original timestamps unavailable; no
  redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service database hang timeouts](notification-service/ai/usage-log.md#ai-20261106-002):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Debugging
  assistance, and Refactoring and documentation improvements for a worker-only engine
  option with network, lock, and statement timeouts, its tests, and the service
  README, following the user's specification. Agent checks: the full suite with
  PostgreSQL 16 and Kafka 4.1.2 had 642 passed and 1 warning; with neither, 557 passed,
  85 skipped, and 1 warning; a live isolated Compose run covered the hang before the
  change and the failure scenarios after it. Keith confirmed on 2026-11-08 (for ai-20261105-001 to ai-20261107-001 as one
  increment) running the full suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed;
  manually reading and verifying the code; and manual checks in an isolated Compose
  run. The exact prompt and key response
  excerpts are recorded; original timestamps
  unavailable; no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service failure code on offset commit failures](notification-service/ai/usage-log.md#ai-20261107-001):
  Claude Code (claude-opus-5-5) provided Debugging assistance and Writing
  implementation code, verifying and applying the fix the user identified, with tests.
  Agent checks: the full suite with PostgreSQL 16 and Kafka 4.1.2 had 645 passed and 1
  warning; with neither, 560 passed, 85 skipped, and 1 warning. Keith confirmed on 2026-11-08 (for ai-20261105-001 to ai-20261107-001 as one
  increment) running the full suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed;
  manually reading and verifying the code; and manual checks in an isolated Compose
  run. Exact prompts
  and key response excerpts are recorded;
  original timestamps unavailable; no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service history and read-status API](notification-service/ai/usage-log.md#ai-20261108-001):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Boilerplate
  generation, and Refactoring and documentation improvements for the User Service
  bearer-token authentication, the history, unread-count, mark-read, and read-all
  endpoints, the DTO and per-type `params` schemas, the notification-service
  settings in root `compose.yaml`, tests, and the service README, following the
  user's specification. Agent checks: the full suite with PostgreSQL 16 had 790
  passed and 5 skipped; without a database, 668 passed and 127 skipped; EXPLAIN
  showed both indexes used and no sequential scan. Keith confirmed on 2026-11-08
  running the full suite with PostgreSQL 16, 790 passed and 5 real-broker tests
  skipped; reading and verifying the code; and manual checks against the full
  Compose stack with the real User Service. The exact prompt and the final response
  are recorded; original timestamps unavailable; no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service live stream](notification-service/ai/usage-log.md#ai-20261108-002):
  Claude Code (claude-opus-5-5) provided Writing implementation code, Boilerplate
  generation, and Refactoring and documentation improvements for the per-process
  `LISTEN` connection, the `GET /notifications/stream` Server-Sent Events endpoint,
  the `SSE_HEARTBEAT_SECONDS` and `SSE_MAX_LIFETIME_SECONDS` settings (including
  root `compose.yaml` and `.env.example`), uvicorn's `--timeout-graceful-shutdown 5`
  in the Dockerfile, tests, and the service README, following
  the user's specification and answers. Agent checks: the full suite with
  PostgreSQL 16 had 918 passed and 5 skipped; without a database, 753 passed and
  170 skipped; the tests caught all 14 mutations applied; with a stream open, the API
  stopped 5 seconds after SIGTERM. Keith confirmed on 2026-11-09 running
  `.venv/bin/python -m pytest -rs` with 918 passed and 5 skipped, and manual SSE
  checks against the local Compose stack. The exact prompts, the clarifying answers, and the final
  responses are recorded; original timestamps unavailable; no
  redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service documentation and walkthrough](notification-service/ai/usage-log.md#ai-20261109-001):
  Claude Code (claude-opus-5-5) provided Refactoring and documentation
  improvements for the Notification Service README: purpose, contract assumption,
  Compose and configuration reference, an end-to-end walkthrough, API reference,
  DLQ investigation runbook, Frontend Service handover, and a single full-suite
  test command, following the user's specification. It reported an Order Service
  CA-trust bug and, at the user's choice, documented a temporary git-ignored
  Compose override instead of fixing it. A follow-up labelled every command with
  the terminal and directory to run it from. Agent checks: the walkthrough, the
  handover statuses, and the runbook were run against the local Compose stack;
  the full suite with PostgreSQL 16 and Kafka 4.1.2 had 923 passed and 0
  skipped. The follow-up's edits were only syntax-checked by the agent. Keith
  confirmed on 2026-11-09 performing all end-to-end checks and tests included in
  the README, with 923 tests passed, and the validity of the whole document. The
  exact prompts, the clarifying answer, and the final responses are recorded;
  original timestamps unavailable; no redactions; no header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service per-recipient commit order](notification-service/ai/usage-log.md#ai-20261110-001):
  Claude Code (claude-opus-5-5) provided Writing implementation code and
  Refactoring and documentation improvements for a per-recipient advisory lock in
  the Notification Service worker, so that each recipient's rows commit in id
  order and several workers are safe for the live stream, with tests, the stream
  module docstring, and the service README, following the user's specification.
  Agent checks: the full suite with PostgreSQL 16 and Kafka 4.1.2 had 940 passed
  and 0 skipped; the tests caught all three mutations applied. Keith confirmed on
  2026-11-10 verifying and testing the change with
  `.venv/bin/python -m pytest -rs`, with 940 passed. The exact prompt and the
  final response are recorded; original timestamps unavailable; no redactions; no
  header exceptions. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).
- [Notification Service observability](notification-service/ai/usage-log.md#ai-20261110-002):
  Codex (GPT-5) provided Writing implementation code and Refactoring and
  documentation improvements for shared JSON logging, request context,
  worker lifecycle and processing events, migration and API diagnostics,
  Vector collection, notification-worker heartbeat alerting, and regression
  tests. Agent checks: 784 tests passed and 187 were skipped without disposable
  PostgreSQL/Kafka services; YAML parsing, Python compilation, and
  `git diff --check` passed. No human test rerun or live Compose observability
  check is claimed. See the
  [Notification Service summary](notification-service/README.md#ai-use-summary-notification-service).

- [Frontend Service notification integration](frontend-service/ai/usage-log.md#ai-20261111-001):
  Claude Code (claude-opus-5-5) provided Writing implementation code,
  Boilerplate generation, and Refactoring and documentation improvements for
  the Frontend Service notification relay routes, unread badge, live stream
  provider, `/notifications` page, unit tests, `NOTIFICATION_SERVICE_URL` in
  `compose.yaml`, and README updates in Frontend Service and Notification
  Service. Agent checks: lint, type check, 111 Vitest tests, a production
  build, and a relay check against a fake SSE upstream passed; the real stack
  was not exercised. Author review is pending. See the
  [Frontend Service summary](frontend-service/README.md#ai-use-summary-frontend-service).

Disclosure-only updates do not establish submission readiness.

### Ewen Low (Order Service, event broker, demo, Kubernetes)

All of Ewen's AI use in this project was through the Cursor agent. The model
identifier is not recorded in the chat history. The 35 chats below run
from 2026-09-24 to
2026-11-10 and contain 236 prompts. Each entry lists the files and
categories affected, where the output ended up, and the exact prompts with
verbatim key-response excerpts. Exchanges where the AI proposed designs or
drafted justifications are labelled **Design discussion**.

- Evidence: the Cursor chat transcripts and git history on Ewen's machine.
  Original timestamps are in UTC+8. System follow-up messages are omitted.
  Repeated identical prompts are merged and counted.
- Redactions: an SSO start URL, an email address and an AWS account ID in the
  AWS SSO chat.
- Author review: Ewen committed or merged the outputs named in each entry. No
  other review or human test rerun is recorded.
- Missing evidence: model identifiers; file-header attributions and an
  `ai/usage-log.md` for Ewen's files do not exist yet.

#### 2026-09-24: PR #4 review and first Order Service create-order work (F11.1)

- Code review (outside the course categories): reviewed PR #4 in chat, ranked the points, and explained them. Nothing was posted on GitHub.
- Writing implementation code: a first create-order Order Service in `order-service/` (app, models, routes, schemas, services, Dockerfile, tests) for F11.1.
- Boilerplate generation: Order Service entries in `compose.yaml` and `.env.example`.
- Outcome: Kept locally; superseded by the 2026-10-05 Order Service work, which became [PR #24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24).

<details>
<summary>Exact prompts and key responses (10)</summary>

Prompt 1 (2026-09-24 13:39 +08:00):

```text
@/Users/a65945/Downloads/CS3219_ProjectTeam08_D1_Slides.pptx
i aim to complete F11.1 for order service only.  Pull latest.

I want you to review PR4 and write out the comments here. 1 line per point only. then complete F11.1 but do not create a PR yet.
```

Key response 1: not quoted, because the final message was progress narration. See the outcome above.

Prompt 2 (2026-09-24 13:44 +08:00):

```text
write the PR4 review in this chat, do not comment anything on github. implement plan
```

Key response 2:

> 1. Branch carries all of #3 plus a merge commit; rebase onto `main` after #3 merges so the diff is registration only.
> 2. `compose.yaml` is diffed against the old empty file, but `main` now has `frontend-service` (#5), so this will conflict.
> 3. `user-service` publishes `8080:8080` to the host, which breaks NFR12.5.2 (only gateway/frontend ports published).
> 4. Generic `POSTGRES_USER`/`POSTGRES_PASSWORD` will collide once other services add databases; prefix them (e.g. `USER_DB_*`).
> 5. `db.py` silently falls back to SQLite when `DATABASE_URL` is unset; fail fast and drop the SQLite branch.
> 6. [...]

Prompt 3 (2026-09-24 16:44 +08:00):

```text
rank the PR4 review starting with the most important from the top
```

Key response 3:

> Ranked from most important to least, based on merge risk, security, and correctness:
>
> 1. `compose.yaml` is diffed against the old empty file, but `main` now has `frontend-service` (#5), so this will conflict.
> 2. The branch carries all of #3 plus a merge commit; rebase onto `main` after #3 merges so the diff is registration only.
> 3. The 409 "User already exists" contradicts the README's rule that registration errors must not disclose account existence.
> 4. `EmailStr` has no max length but the column is `String(254)`, so an overlong email becomes a Postgres DataError (500).
> 5. [...]

Prompt 4 (2026-09-24 16:49 +08:00):

```text
"compose.yaml is diffed against the old empty file, but main now has frontend-service (#5), so this will conflict." what does this mean simply
```

Key response 4:

> PR 4 rewrote the whole `compose.yaml` from an empty file, adding only `user-db` and `user-service`. After that branch was started, PR #5 merged and `main` now already has a `frontend-service` entry in that same file.
>
> Git cannot automatically combine those two edits. Merging PR 4 will conflict, and a careless resolution can drop `frontend-service` and leave only the user-service containers.

Prompt 5 (2026-09-24 16:51 +08:00):

```text
"The 409 "User already exists" contradicts the README's rule that registration errors must not disclose account existence." what line is this
```

Key response 5:

> The 409 response is raised twice in `user-service/app/services/users.py` on the PR branch:

Prompt 6 (2026-09-24 16:57 +08:00):

```text
"user-service publishes 8080:8080 to the host, which breaks NFR12.5.2 (only gateway and frontend ports published)." explain this simply
```

Key response 6:

> In PR 4, `compose.yaml` maps the user service like this:

Prompt 7 (2026-09-24 16:57 +08:00):

```text
which line is this
```

Key response 7:

> In PR 4's `compose.yaml`, the host mapping is lines 22–23:

Prompt 8 (2026-09-24 17:02 +08:00):

```text
summarise the merge conflicts as 1 line points
```

Key response 8:

> 1. `compose.yaml` conflicts because PR 4 fills the old empty file with `user-db` and `user-service`, while `main` already added `frontend-service` in that same file.
> 2. If PR #3 merges first, PR 4 conflicts again on the shared scaffold files (`compose.yaml`, `.gitignore`, `user-service` Dockerfile, README, app, and CI), because those commits are already inside PR 4.
> 3. `.github/workflows/ci.yml` conflicts if open PR #2 merges first, because both PRs add that file.

Prompt 9 (2026-09-24 17:04 +08:00):

```text
what is the suggestion to fix the conflicts? 1 line
```

Key response 9:

> Rebase `fr5-account-creation` onto current `main` after #3 merges, drop the duplicated scaffold commits, and add the user-service entries next to `frontend-service` instead of replacing `compose.yaml`.

Prompt 10 (2026-09-24 17:06 +08:00):

```text
"add the user-service entries next to frontend-service instead of replacing compose.yaml." explain simply
```

Key response 10:

> `compose.yaml` on `main` already lists `frontend-service`. PR 4 was written when that file was empty, so its version contains only `user-db` and `user-service`. Merging that version as-is would wipe out `frontend-service`. The fix is to keep `frontend-service` and add the user-service blocks underneath it in the same file.

</details>

#### 2026-09-28: Pull latest main and PR #11 review

- Debugging assistance: merged `main` into `feat/order-service-create-order` and resolved conflicts in `.env.example` and `compose.yaml`.
- Code review (outside the course categories): reviewed PR #11 and explained a login row-lock finding.
- Outcome: Merge kept locally on the feature branch.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-09-28 11:42 +08:00):

```text
pull latest
```

Key response 1:

> Pulled latest from `origin/main` into `feat/order-service-create-order`.
>
> **What came in from main:**
> - `user-service` (auth, users, migrations, tests)
> - CI workflow (`.github/workflows/ci.yml`)
> - Updates to `.gitignore`, `pytest.ini`, `TODO.md`
>
> **Merge conflicts resolved** in `.env.example` and `compose.yaml` by keeping both the user-service config from main and your order-service config. Your local order-service work is intact.

Prompt 2 (2026-09-28 11:49 +08:00):

```text
review PR 11
```

Key response 2:

> [PR 11](https://github.com/AY2627S1-CS3219-P8/FoC/pull/11) — **fr7 view and update profile information** — is not ready to merge. The profile, deactivation, and reactivation behavior is in good shape and well tested. Two security and concurrency issues should be fixed first, and the description does not match the diff.

Prompt 3 (2026-09-28 11:54 +08:00):

```text
"Login holds a row lock across work that does not belong there. login_user does SELECT … FOR UPDATE, then runs Argon2, and on success calls cleanup_sessions, which deletes revoked and expired sessions for every user. That global delete already runs hourly in user-service/app/main.py. Doing it inside login keeps the user row locked for the whole hash, and two logins can deadlock on the same session-row delete. Verify the password first, then lock and re-read the row before inserting the session. Leave cleanup on the existing loop. The new tests use SQLite, which ignores FOR UPDATE, so this race is not actually covered."

which lines are this? also summarise this in 1 short line
```

Key response 3:

> Login locks the user row, then hashes the password and deletes every user's expired sessions before it releases the lock.
>
> In the PR copy of `user-service/app/services/users.py` (commit `1e56ec0`):
>
> - The row lock is taken at lines 65–69, before the password is checked:

</details>

#### 2026-09-28: PR #13 review

- Code review (outside the course categories): reviewed PR #13 (Supplier Service setup). No file changed.
- Outcome: Review findings reported in chat.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-09-28 12:00 +08:00):

```text
review PR 13
```

Key response 1:

> **Request changes** on [PR #13](https://github.com/AY2627S1-CS3219-P8/FoC/pull/13) (`build: setup Supplier Service`, `supplier-service-setup` → `main`, `2a74f14`). The supplier scaffold itself is in good shape. The CI split removes two user-service gates that this PR does not replace.

</details>

#### 2026-09-30 to 2026-10-01: PR #17, #18, #20 and #21 reviews; User Service database questions

- Code review (outside the course categories): flagged one issue in PR #18 and suggested how to resolve PR #21's conflicts.
- Learning support: explained the User Service database and drew an example diagram.
- Design discussion: drafted one-line answers justifying the User Service database choice, and a one-minute script. No file changed.
- Outcome: Answers and script given in chat only.

<details>
<summary>Exact prompts and key responses (8)</summary>

Prompt 1 (2026-09-30 21:17 +08:00):

```text
are you able to select lines and comment them on PRs for review?
```

Key response 1:

> Yes. On GitHub pull requests I can leave inline review comments on specific lines or line ranges in the diff.
>
> I do that through the GitHub API (`gh api`), not by clicking in the web UI. A comment needs:
>
> - the pull request
> - the file path
> - the diff line (or a start and end line for a range)
> - which side of the diff (`LEFT` or `RIGHT`)
> - the commit SHA the comment is attached to

Prompt 2 (2026-09-30 21:18 +08:00):

```text
Review PRs 17, 18, 20, 21. Only focus on very important issues, for each issue write out which lines they affect. 1 line 1 point per issue
```

Key response 2:

> No very important issues in PRs 17, 20, or 21. One in PR 18.
>
> - **PR 18** — `.agents/skills/disclosure/SKILL.md` line 21: a prompt that both runs this skill and gives other instructions is dropped entirely, so the usage log can lose the only exact record of the work that was requested.

Prompt 3 (2026-09-30 21:28 +08:00):

```text
"PR 18 — .agents/skills/disclosure/SKILL.md line 21: a prompt that both runs this skill and gives other instructions is dropped entirely, so the usage log can lose the only exact record of the work that was requested."

explain simply
```

Key response 3:

> The disclosure skill is supposed to save the exact prompts that led to AI-written work. Line 21 tells it to throw away any prompt that asks for a disclosure, even when that same prompt also asks for the actual work.
>
> If someone writes one message like “add the login check, then run `$disclosure`,” the whole message is left out of the usage log. The record of what was requested disappears with it.

Prompt 4 (2026-09-30 21:32 +08:00):

```text
1 line suggest how to resolve merge conflicts on PR21
```

Key response 4:

> Rebase `supplier-read-layer` onto current `main` (after #16 and #12) and, in each conflicted supplier file, keep `main` and re-apply only the read-layer changes.

Prompt 5 (2026-09-30 21:40 +08:00, sent 2 times):

```text
look through the whole repo and all the open PRs, has the db for user service been implemented yet?
```

Key response 5:

> Yes. The User Service database is already on `main`, not waiting in an open pull request.
>
> It is a PostgreSQL database named `foc_users`, started by the `user-db` Compose service and migrated by `user-migrate`. The service connects through `DATABASE_URL` in `user-service/app/db.py`. Current `main` has Alembic revisions `0001` through `0004`: the `users` table, `user_sessions`, the student-number length check, and the admin state lock.

Prompt 6 (2026-09-30 21:43 +08:00):

```text
"Which database technology have you selected? Justify your choice based on FoC’s specific needs, including the nature of the user data, expected query patterns, and scalability requirements. "

Answer this question directly using 1 line bullet points
```

Key response 6:

> - PostgreSQL is the database for the User Service (`foc_users` via the `user-db` Compose service).
> - User data is a fixed relational record: NUS student number, email, display name, Argon2id password hash, role, status, and timestamps, with sessions in a child table.
> - Unique indexes on student number and email reject duplicate registrations, and check constraints keep role, status, and the 9-character student number valid on every write. [...]

Prompt 7 (2026-09-30 22:07 +08:00):

```text
example visual of the DB
```

Key response 7:

> The User Service database `foc_users` has two related tables and one singleton lock row.

Prompt 8 (2026-10-01 14:15 +08:00):

```text
write a 1 min script. only 1 line per point
```

Key response 8:

> User Service stores accounts in PostgreSQL.
>
> Each account is one fixed record: student number, email, name, password hash, role, and status.
>
> Sessions live in a child table, one row per login.
>
> Unique indexes, check constraints, and foreign keys reject bad writes.

</details>

#### 2026-10-05: Pull latest main and AWS Agent Toolkit setup

- Git operations (outside the course categories): pulled `main` and switched to it.
- Boilerplate generation: set up the AWS Agent Toolkit. Its config is in `~/.cursor/mcp.json` and `~/.claude.json` (outside the repo) and `.cursor/rules/aws-agent-toolkit.mdc` (untracked).
- Outcome: Tool setup only; nothing committed. The transcript itself redacts one setup response.

<details>
<summary>Exact prompts and key responses (5)</summary>

Prompt 1 (2026-10-05 14:28 +08:00):

```text
pull latest main
```

Key response 1:

> Local `main` is now at `0b5c35e` (`feat: add Supplier Service read layers and response adapters (#21)`), matching `origin/main`.
>
> You are still on `feat/order-service-create-order`. Uncommitted order-service work was left as-is. I did not merge or rebase that branch onto `main`.

Prompt 2 (2026-10-05 14:30 +08:00):

```text
view only the latest version of main
```

Key response 2:

> The workspace is on **`main`**, matching `origin/main`, with a clean working tree.
>
> Current commit: `0b5c35e` — *feat: add Supplier Service read layers and response adapters (#21)*
>
> There was nothing left to stash. You are viewing only the latest `main`.

Prompt 3 (2026-10-05 14:31 +08:00):

```text
Set up Agent Toolkit for AWS by following instructions:
https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md
```

Key response 3:

> [REDACTED]

Prompt 4 (2026-10-05 14:33 +08:00):

```text
400 bad request
```

Key response 4:

> The **400 Bad Request** during `aws login` is usually a browser-side OAuth issue, not a problem with your profile config. Your `Ewen` profile looks fine — region is set to `ap-southeast-1`, and no stale login cache exists.
>
> This is the most common cause. AWS session cookies from an old login can make the sign-in page return 400 instead of completing auth.

Prompt 5 (2026-10-05 14:39 +08:00):

```text
Set up Agent Toolkit for AWS by following instructions:
https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md
```

Key response 5:

> Setup is complete. Here is what was done:

</details>

#### 2026-10-05: AWS SSO access check

- Boilerplate generation: configured AWS CLI SSO in `~/.aws/config` (outside the repo) and checked access and remaining credits.
- Outcome: Local tool configuration only. The SSO URL, email and account ID are redacted below.

<details>
<summary>Exact prompts and key responses (5)</summary>

Prompt 1 (2026-10-05 14:42 +08:00):

```text
do i have access for nusisb_IsbUsersPS
```

Key response 1:

> I can’t tell from here whether **you** have access to `nusisb_IsbUsersPS`.
>
> I searched this FoC workspace (code, config, `.env.example`, agent stores, and past transcripts) and found **no references** to `nusisb_IsbUsersPS`, `IsbUsersPS`, or `nusisb`. This repo doesn’t define or check permissions for that resource.

Prompt 2 (2026-10-05 14:43 +08:00):

```text
check
```

Key response 2:

> Here’s what I was able to verify from your machine:
>
> `nusisb_IsbUsersPS` does **not** appear anywhere in the FoC repo, your local files, or configs I could search. I also **cannot prove** you’re in (or out of) that group from here.

Prompt 3 (2026-10-05 14:45 +08:00):

```text
configure the AWS CLI to retrieve them automatically using aws configure sso command
```

Key response 3: not quoted, because the final message was progress narration. See the outcome above.

Prompt 4 (2026-10-05 14:46 +08:00):

```text
configure the AWS CLI to retrieve them automatically using aws configure sso command
SSO start URL: [REDACTED: SSO start URL]
SSO Region: ap-southeast-1
```

Key response 4:

> SSO is configured and working. You **do** have access to `nusisb_IsbUsersPS`.
>
> Your `~/.aws/config` now has:

Prompt 5 (2026-10-05 14:49 +08:00):

```text
how much credits do i have for AWS and what does that mean
```

Key response 5:

> I checked your **NUS SSO account** (`[REDACTED: AWS account ID]`, role `nusisb_IsbUsersPS`) and couldn’t retrieve a **remaining credit balance** from the CLI.

</details>

#### 2026-10-05: Existing asynchronous workflow question

- Learning support: explained that no asynchronous product workflow existed yet. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-05 14:57 +08:00):

```text
is there an asynchronous workflow implemented currently
```

Key response 1:

> There is no asynchronous product workflow. Request handling in both services is synchronous, and the supplier change-request approval flow is still only a planned design.
>
> The only background task is session cleanup in the User Service. On startup, `session_cleanup_loop` in `user-service/app/main.py` starts an asyncio task that deletes revoked and expired session rows, then sleeps for one hour (`SESSION_CLEANUP_INTERVAL`) and repeats until shutdown. The same `cleanup_sessions` function also runs inside the login transaction, so login does not wait on that loop. [...]

</details>

#### 2026-10-05: Order Service implementation on RabbitMQ

- Writing implementation code: Order Service API, worker, outbox, RabbitMQ messaging, Alembic baseline migration and tests in `order-service/`, from Ewen's request and the team's D1 requirements. The AI drafted the plan, and Ewen approved it before implementation.
- Boilerplate generation: `order-service/Dockerfile`, `alembic.ini`, `alembic/env.py`, `compose.yaml`, `.env.example`, `.github/workflows/compose.yml` and `.github/workflows/order-service.yml`.
- Refactoring and documentation improvements: `order-service/README.md` and the diagram `order-service/docs/how-it-works.pdf`.
- Outcome: Opened as [PR #24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24), after one PR was opened on the template repo by mistake. Ewen then had the tests removed from the PR.

<details>
<summary>Exact prompts and key responses (6)</summary>

Prompt 1 (2026-10-05 15:02 +08:00):

```text
implement order service according to the requirements and also come up with a way to test it. make it as efficient as possible, with minimal changes to the code, like an experienced engineer
/Users/a65945/Downloads/CS3219-Group8-Project-D1.pdf
```

Key response 1: not quoted, because the final message was progress narration. See the outcome above.

Prompt 2 (2026-10-05 15:22 +08:00, sent 2 times):

```text
Order Service (M4 + order side of M6) on RabbitMQ

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 2:

> The Order Service is on the `order-service` branch, built from your stashed create-order work. The stash is still there, and nothing has been committed.
>
> The API stores each state change and its event in one database transaction. A separate worker publishes those events to RabbitMQ and applies credit and expiry messages, so a broker outage cannot fail a request. Expiry is a one-hour queue, not a scheduler.

Prompt 3 (2026-10-05 15:47 +08:00):

```text
create a simple diagram pdf to explain the system
```

Key response 3:

> The diagram is at `order-service/docs/how-it-works.pdf`. It is one page with three parts:
>
> 1. **Saving the errand.** The student calls the Order API, which checks the user and the store, then writes the order and its event in one database commit. RabbitMQ is not on this path.
> 2. **Delivering the event.** The worker publishes to the `foc.events` exchange, which fans out to Credit, Notifications, and a one-hour expiry queue. Credit’s answer and the expiry come back to the worker.
> 3. [...]

Prompt 4 (2026-10-05 15:51 +08:00, sent 2 times):

```text
create PR with the necessary files. do not commit the image, put the image in the PR comment
```

Key response 4:

> The pull request is https://github.com/CS3219-AY2627S1/FoC-Template/pull/75.
>
> The diagram is in a comment on that pull request and is not in the commit. `order-service/docs/how-it-works.pdf` is still only on your machine.

Prompt 5 (2026-10-05 15:56 +08:00):

```text
open the PR at https://github.com/AY2627S1-CS3219-P8/FoC.git
```

Key response 5:

> The pull request is on the group repository: https://github.com/AY2627S1-CS3219-P8/FoC/pull/24
>
> The diagram is in a comment on that pull request and is still not part of the commit.

Prompt 6 (2026-10-05 15:59 +08:00):

```text
remove the tests from the PR
```

Key response 6:

> The tests are out of https://github.com/AY2627S1-CS3219-P8/FoC/pull/24.
>
> The Order Service test files, `pytest.ini`, and `requirements-dev.txt` are gone. CI still checks that the migration matches the models and that the image builds. The diagram comment is unchanged.

</details>

#### 2026-10-12: D3 Order Service slides and handout

- Refactoring and documentation improvements: `order-service/docs/order-service.pptx` (2 slides) and `order-service/docs/d3-order-service.pdf`, built by `order-service/docs/_build_d3_docs.py`.
- Design discussion: the handout drafted the answers to the 5 Order Service points in the D3 brief.
- Outcome: The slides and the PDF are on `main`.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-12 16:33 +08:00):

```text
create 2 powerpoint slides describing order service. make it brief and easy to read, focusing only on the main points. create a seperate pdf addressing all 5 points under order service in /Users/a65945/Downloads/CS3219-Instructions-MilestoneD3.pdf
```

Key response 1:

> The two slides and the handout are in `order-service/docs/`.
>
> **Slides:** `order-service/docs/order-service.pptx`
> - Slide 1 is the lifecycle: pending credit, open, accepted, picked up, completed, plus rejected, cancelled, and expired. It also states the three rules: Postgres, one accept wins, and the status is saved before the event is published.
> - Slide 2 is one errand in four steps (create, hold, deliver, settle) and who may act: requester, courier, and admin.

</details>

#### 2026-10-18: Pull latest and update the PR #24 branch

- Git operations (outside the course categories): fast-forwarded and merged `main` into `order-service`. No file content written by the AI.
- Outcome: Pushed to the PR #24 branch.

<details>
<summary>Exact prompts and key responses (2)</summary>

Prompt 1 (2026-10-18 15:15 +08:00):

```text
pull latest
```

Key response 1:

> `order-service` is up to date with `origin/order-service`, fast-forwarded from `6af5758` to `92baf1d`.
>
> Two commits came in:
>
> - `c5aa891` — chore: update readme with team members (#25)
> - `92baf1d` — Merge branch `main` into `order-service`
>
> Only `README.md` changed. Your untracked files (`.cursor/` and `order-service/docs/`) were left as they were.

Prompt 2 (2026-10-18 15:16 +08:00):

```text
update order-service branch with main base branch in the PR
```

Key response 2:

> `order-service` now includes the latest `main`, and that update is on PR [#24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24).
>
> The branch was missing one commit from `main`:
>
> - `b2321c5` — feat (fr2): implement login page with stubbed auth logic (#22)

</details>

#### 2026-10-18 to 2026-10-19: Event ordering issues, plan discussion and flow diagrams

- Design discussion: the AI analysed Ewen's two event-ordering issues and drafted a fix plan (`~/.cursor/plans/event_ordering_fixes_3797b690.plan.md`, outside the repo). Ewen revised it several times, settling on one worker and one queue with each service handling its own issues. The AI evaluated that approach and suggested one-line fixes for the Credit Service owner.
- Learning support: Order DB, outbox, events vs orders, row locks, and concurrent accepts.
- Refactoring and documentation improvements: generated slide diagrams (event flow, example flow, order body, errand timeline, invariants, edge cases) as images outside the repo.
- Outcome: The plan was not implemented in this chat. The diagrams were used for slides; no repo file changed.

<details>
<summary>Exact prompts and key responses (59)</summary>

Prompt 1 (2026-10-18 15:27 +08:00):

```text
for event ordering, there are a few issues:

- For example if user service's create account event arrives, then immediately an order service place order arrives, credit service may falsely reject this order if the initial credit allocation is still being processed.

- rabbitmq retries event without adjusting their orders? So if a cancel order arrives before a create order, right now it retries the cancel order and fails until the maximum number of retries, then move on to create order.

solve these issues, then prepare event broker RabbitMQ for any more edge cases that might happen with the least over-engineering
```

Key response 1: not quoted, because the final message was progress narration. See the outcome above.

Prompt 2 (2026-10-18 15:33 +08:00):

```text
summarise in 1 line points
```

Key response 2: none recorded; the request was interrupted or re-sent.

Prompt 3 (2026-10-18 15:33 +08:00):

```text
summarise simply in 1 line points
```

Key response 3:

> The plan in one-line points (nothing has been implemented yet):
>
> **The problems**
> - **Account race:** if an order arrives before the user's credit account exists, Credit rejects it with "account not found".
> - **Cancel before create:** Credit retries the cancel in place until it gives up, and the queue behind it waits the whole time.
> - **Extra bug found:** Credit treats `order.opened`, `order.accepted` and `order.picked_up` as bad messages and sends them to its dead-letter queue for every order.

Prompt 4 (2026-10-18 15:35 +08:00):

```text
only make changes to order service and the event broker rabbitmq in the open plan
```

Key response 4:

> I've rewritten the plan so it changes only Order Service and its RabbitMQ queues. Credit Service stays untouched, so both issues are fixed by controlling what Order Service sends Credit and when.
>
> - **Account race:** if Credit rejects an order because the account doesn't exist yet, Order Service keeps the order pending and asks again after about 2 seconds. It gives up after 5 tries (about 10 seconds) and then rejects the order. The re-send goes through a new delay queue that delivers only to Credit's queue. [...]

Prompt 5 (2026-10-18 15:39 +08:00):

```text
what would happen if i dont implement a delay/retry queue
```

Key response 5:

> The answer depends on which of the two broker queues in the plan you drop. The release hold-back (issue 2) needs neither of them. The credit re-request delay is needed for issue 1. The retry queues are the most optional part of the plan.
>
> The order would still be falsely rejected, so issue 1 would not be fixed. You would have three options, none of them good:

Prompt 6 (2026-10-18 15:41 +08:00):

```text
are retry queues the same queue as the main event queue?
```

Key response 6:

> No. Each retry queue is a separate queue, used only to park failed messages for a while. Nothing consumes it.
>
> Take `order-service.credit-events` as the example:

Prompt 7 (2026-10-18 15:44 +08:00):

```text
does any of the proposals in the open plan contradict what is said in the pdf?
```

Key response 7:

> There are no hard contradictions, but four points sit in tension with the deck. Two come from the plan itself, and two are differences the current code already has.
>
> 1. **Holding back `order.cancelled` and `order.expired`.**
>    - Slide 37 has Notification Service consuming `order.cancelled` and `order.expired`.
>    - Under the plan, a cancel or expiry while the order waits for credit is sent late. It is never sent if Credit rejected the reservation.
>    - Notification Service would therefore miss some cancels and expiries. [...]

Prompt 8 (2026-10-18 15:46 +08:00):

```text
summarise the plan in 1 line points per isue
```

Key response 8:

> The plan, grouped by issue; it touches only Order Service and RabbitMQ.
>
> **Issue 1: an order arrives before the credit account exists**
> - When Credit replies "account not found", Order Service keeps the order pending instead of rejecting it.
> - It re-sends `order.created` with a new event id through a 2-second delay queue that delivers only to Credit.
> - A new `credit_request_attempts` column caps this at 5 tries, about 10 seconds, after which the order is rejected as today.
> - Credit needs no changes: it treats the re-send as a new request and still reserves at most once per order.

Prompt 9 (2026-10-18 15:51 +08:00):

```text
issue 1: is there more efficient ways to do this, retrying after fixed time intervals does not seem like the best way to do it

issue 2: i dont understand the problem, explain simply in 1 line

others: is there a more effective implementation other than implementing seperate queues with fixed time intervals? i aim to only have 1 main queue with 1 main worker with additional queues and workers only for availability and backup. i do not want to implement retry and queues for other purposes
```

Key response 9:

> **Short answers:**
> - **Issue 1:** there is no efficient fix inside Order Service alone. The clean fix is a small change in Credit.
> - **Issue 2:** Credit gets "release this hold" for a hold that was never placed, errors, and retries until it gives up, blocking the queue meanwhile.
> - **Others:** yes. One queue, one active worker, and a standby worker can handle this with no retry queues.

Prompt 10 (2026-10-18 15:55 +08:00):

```text
1 line to tell the guy responsible for credit service how to fix it in the most efficient way
```

Key response 10:

> "In `handle_order_created`, before calling `reserve_credits`, idempotently create the requester's account with its initial allocation if it doesn't exist yet. Make `nus_student_number` nullable so `user.created` can fill it in later. Keep `initial_allocation_granted_at` as the guard so a user is only ever granted credits once."

Prompt 11 (2026-10-18 15:56 +08:00):

```text
1 line simply, say as a higher level
```

Key response 11:

> "If an order arrives for a user with no credit account yet, create the account with its starting credits on the spot, instead of rejecting the order."

Prompt 12 (2026-10-18 15:58 +08:00):

```text
what if the user is fake and is not pending but does not exist?
```

Key response 12:

> A fake user can't reach Credit through the normal flow. Order Service checks every create with User Service (`GET /users/me` with the bearer token), and the requester id comes from that session, never from the request body. No real session means a 401 and no order, so there is no `order.created` and no account gets created.

Prompt 13 (2026-10-18 16:00 +08:00):

```text
remove issue 1 fix from the open plan
```

Key response 13:

> I've removed the issue 1 fix from the plan, along with its delay queue, attempt counter and migration. Issue 1 is now noted as the Credit owner's job.
>
> I also changed the RabbitMQ section, which you didn't ask for in this message. You said earlier you didn't want retry queues, so I swapped them for the single-queue design we discussed. Tell me if you'd rather keep the retry queues.

Prompt 14 (2026-10-18 16:02 +08:00):

```text
would issue 2 be more efficient if credit service handles it?
```

Key response 14:

> Yes. Credit owns the reservations, so it can decide on its own that there's nothing to release. Order Service would then need no changes for issue 2.
>
> The Credit-side fix:
> - When a release arrives and no hold exists, Credit records the order as released and acks the message. It doesn't throw an error.
> - If that order's `order.created` arrives later, Credit sees the order is already released and doesn't place a hold.

Prompt 15 (2026-10-18 16:02 +08:00):

```text
1 line simply higher level
```

Key response 15:

> "If Credit is asked to release credits it never reserved, treat the order as already settled and don't reserve credits for it later, instead of failing and retrying."

Prompt 16 (2026-10-18 16:10 +08:00):

```text
im aiming to have only 1 worker and 1 event queue, without any retries and additional queues for other purposes. any issues should be handled by the respective services. do yall think this is a good approach? be objective
```

Key response 16:

> Mostly yes. It's a sound approach for a campus-scale system, as long as three caveats are covered. Without them, some pieces would quietly break.
>
> - **It's simple.** One consumer per queue processes messages in the order they were published, so you don't have to reason about events being reordered or delayed.
> - **Each service owns its own edge cases.** Credit handles releases that arrive early, and Order ignores stale credit replies. This matches the deck (FR4.8 gives Credit responsibility for repeated updates). [...]

Prompt 17 (2026-10-18 16:32 +08:00):

```text
currently, is there an "order service" module that handles order related actions (like rejection and checking) before it goes into event broker?
```

Key response 17:

> Yes. In your diagram that's the "Request Order (producer)" box, and it's the Order Service API. Every order action is checked and rejected there before anything reaches RabbitMQ. All of this lives in `order-service/app/services/orders.py`.
>
> **Checks before an event is created:**
> - **Who the caller is.** Every request is checked with User Service (`GET /users/me`). A bad session gets 401, and the requester id comes from the session, never from the request body. [...]

Prompt 18 (2026-10-18 16:36 +08:00):

```text
for issue 1, could we check if user and credit account exists in the order module before we send it to event queue? if rejected, it sends order. cancelled to the queue with reason
```

Key response 18:

> You could, but it wouldn't fix issue 1, and sending `order.cancelled` would make things worse.
>
> **Why the check doesn't fix the race:**
> - Issue 1 happens in the first moment after sign-up, before Credit has processed `user.created`.
> - A check from Order Service in that moment finds no credit account either, so the order is still falsely rejected. It's just rejected earlier, over HTTP instead of through an event.
> - The only way to pass would be to wait and check again, which is the retry approach you wanted to avoid.

Prompt 19 (2026-10-18 16:38 +08:00):

```text
so, is it a good idea for order service to check user and credit accounts to determine if the order should be rejected?
```

Key response 19: none recorded; the request was interrupted or re-sent.

Prompt 20 (2026-10-18 16:38 +08:00):

```text
so, is it a good idea for order service to check user and credit accounts to determine if the order should be rejected for issue 1?
```

Key response 20:

> No. Checking the user is already done, and checking the credit account doesn't solve issue 1.
>
> - **The user check already exists.** Every order request is verified with User Service, so a missing or inactive user is rejected before any event is sent. Nothing needs to change there.
> - **The credit account check fails at exactly the wrong moment.** Issue 1 happens right after sign-up, before Credit has set up the account, so the check would wrongly reject the same orders.
> - **It makes ordering depend on Credit being up.** If Credit is down, nobody can create an order. [...]

Prompt 21 (2026-10-18 16:39 +08:00):

```text
i want to reject the order if credit account still isnt up. allowing credit account initialization from functions other than account creation is extra coupling
```

Key response 21: none recorded; the request was interrupted or re-sent.

Prompt 22 (2026-10-18 16:39 +08:00):

```text
i want to reject the order if credit account still isnt up. allowing credit account initialization from functions other than account creation is extra coupling. does this change your mind
```

Key response 22:

> It changes my mind about issue 1, but not about where the check should go.
>
> **On issue 1:** if rejecting the order is the behaviour you want, issue 1 is no longer a bug, and you don't need any new code for it. This already works:
> 1. `order.created` reaches Credit before the account exists.
> 2. Credit's `reserve_credits` rejects it with reason `ACCOUNT_NOT_FOUND` and publishes `credit.reservation_failed`.
> 3. Order Service sets the order to `REJECTED` and stores the reason in `rejection_reason`.

Prompt 23 (2026-10-18 16:42 +08:00):

```text
1 line
```

Key response 23:

> Yes, it changes my mind: Credit already rejects orders when the account isn't set up yet (with reason `ACCOUNT_NOT_FOUND`), so issue 1 needs no new code, and adding a credit check in Order Service would only add coupling between the two services.

Prompt 24 (2026-10-18 16:43 +08:00):

```text
update the open plan to this new mission:

Im aiming to have only 1 worker and 1 event queue, without any retries and additional queues for other purposes, so as to avoid creating more races and bugs
any issues should be handled by the respective services
```

Key response 24:

> I've rewritten the plan around the new mission: Order Service runs one worker that consumes one event queue. There is no retry logic, and no other queue except the dead-letter queue, which I kept as a backup.
>
> - **One inbound queue.** Order Service keeps only `order-service.credit-events` and its dead-letter queue.
>   - It no longer declares Credit's or Notification's queues; each service declares its own.
>   - That also fixes the bug where Credit dead-lettered `order.opened`, `order.accepted` and `order.picked_up`. [...]

Prompt 25 (2026-10-18 16:47 +08:00):

```text
summarise the plan in 1 line points
```

Key response 25:

> The plan in one-line points:
>
> - **One queue:** Order Service listens only to `order-service.credit-events`, plus its dead-letter queue as backup.
> - **No queues for others:** it stops declaring Credit's and Notification's queues; each service declares its own.
> - **Side fix:** that stops Credit dead-lettering `order.opened`, `order.accepted` and `order.picked_up`.
> - **Expiry:** the worker checks the database every 5 seconds and expires overdue orders, replacing the two expiry queues. [...]

Prompt 26 (2026-10-18 16:50 +08:00):

```text
update this image to reflect how the flow works
```

Key response 26:

> I can't produce an image file in Ask mode, but here's the updated diagram as Mermaid. It shows the flow once the plan is built, and you can redraw your slide from it. I can render it as an image in Agent mode.

Prompt 27 (2026-10-18 16:51 +08:00):

```text
generate the slide
```

Key response 27:

> I've generated the slide at `/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/m6-event-flow.jpg`. The text is all correct, but one arrow is missing: nothing shows Credit Service sending `credit.reserved` and `credit.reservation_failed` back to the broker. The slide only shows those replies going from the broker to Order Service, so it looks as if they come out of nowhere.

Prompt 28 (2026-10-18 16:53 +08:00):

```text
shouldnt there be a worker for receiving and sending events. whatever orders credit service rejects or modifies and sends to the worker gets sent to the order service module before sending to event broker. also order service validates the order from user service, supplier service. the worker receives orders from frontend and anywhere else too. regenerate the slide
```

Key response 28: none recorded; the request was interrupted or re-sent.

Prompt 29 (2026-10-18 16:54 +08:00, sent 2 times):

```text
shouldnt there be a worker for receiving and sending events. whatever orders credit service rejects or modifies and sends to the worker gets sent to the order service module before sending to event broker. also order service validates the order from user service, supplier service. the worker receives orders from frontend and anywhere else too. regenerate the slide with less words
```

Key response 29:

> The slide is regenerated with fewer words, and all the arrows are in the right place.
>
> ![Event-driven order flow](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/m6-event-flow-v5.png)
>
> It includes your corrections:
> - **Validation:** the Order API checks User Service and Supplier Service before saving an order.
> - **The worker sends and receives:** it publishes order events to RabbitMQ and receives Credit's replies. [...]

Prompt 30 (2026-10-18 16:56 +08:00):

```text
where?
```

Key response 30:

> The slide is here:
>
> `/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/m6-event-flow-v5.png`
>
> The editable source is in the same folder: `/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/m6-event-flow.svg`
>
> To open the folder in Finder, run this in a terminal:

Prompt 31 (2026-10-18 16:58 +08:00):

```text
what is the purpose of order db + outbox?
also, shouldnt frontend be updated of any changes from order changes?
```

Key response 31:

> - **Order DB:** the source of truth for every order: its status, who requested it, the courier, the store, the drop-off and the timestamps.
> - **Outbox:** the `outbox_events` table. When an order changes, the change and its event are saved in the same database transaction. The worker then publishes unpublished rows to RabbitMQ in order.

Prompt 32 (2026-10-18 16:58 +08:00):

```text
1 line
```

Key response 32:

> The outbox saves each order change and its event together, so no event is lost or sent for a change that failed; and yes, the frontend should hear about changes, most simply by polling `GET /orders`, with Notification Service pushing updates later.

Prompt 33 (2026-10-18 20:29 +08:00):

```text
1 line, what is the purpose of order db and outbox
```

Key response 33: none recorded; the request was interrupted or re-sent.

Prompt 34 (2026-10-18 20:30 +08:00):

```text
- shouldnt the order db be a branched out terminus instead
- shouldnt credit service send the rejected order back to worker
```

Key response 34:

> **Purpose of the Order DB and outbox, in one line:** the Order DB is the source of truth for every order, and the outbox saves each change's event in the same transaction, so the worker can publish it later without losing it or sending an event for a change that failed.

Prompt 35 (2026-10-18 20:32 +08:00):

```text
1 line. what does the event broker do
```

Key response 35:

> The event broker (RabbitMQ) holds each published event in a durable queue for every service that subscribes to it, so services exchange events without calling each other directly or needing to be up at the same time.

Prompt 36 (2026-10-18 20:32 +08:00):

```text
difference between event and order. give an example
```

Key response 36:

> An **order** is the thing itself: one row in the Order DB holding the errand's current state, which keeps changing. An **event** is a message saying something just happened to that order. It is fixed once sent and only says what changed.
>
> Example: Alice asks for coffee from the store at E3, offering 8 credits.

Prompt 37 (2026-10-18 20:34 +08:00):

```text
draw the example flow
```

Key response 37:

> I've drawn the example flow as a slide in the same style as the last one: one coffee order going through Order Service, with the events that tell Credit what to do.
>
> ![Example: Alice's coffee order](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/order-example-flow.png)

Prompt 38 (2026-10-18 20:37 +08:00):

```text
describe the flow step by step 123...
```

Key response 38:

> The example flow, step by step:
>
> 1. **Alice creates the order.** She asks for a coffee, offering 8 credits. Order Service checks her with User Service and the store with Supplier Service, then saves the order as `PENDING_CREDIT` together with an `order.created` event in the outbox.
> 2. **The worker publishes `order.created`** to the event broker.
> 3. **The broker delivers `order.created` to Credit Service.**
> 4. **Credit holds 8 credits** from Alice's balance.
> 5. **Credit publishes `credit.reserved`** to the broker. [...]

Prompt 39 (2026-10-18 20:37 +08:00):

```text
describe the flow step by step 123... 1 line per step
```

Key response 39:

> 1. Alice submits a coffee order offering 8 credits, and Order Service checks her session with User Service and the store with Supplier Service.
> 2. Order Service saves the order as `PENDING_CREDIT`, with an `order.created` event in its outbox in the same transaction.
> 3. The order worker publishes `order.created` to the event broker.
> 4. The broker delivers `order.created` to Credit Service, which holds 8 of Alice's credits.
> 5. Credit Service publishes `credit.reserved`, and the broker delivers it to the order worker.
> 6. [...]

Prompt 40 (2026-10-18 20:39 +08:00):

```text
is it better to validate credit service credits with user service and supplier service at the order api or with the current approach?
```

Key response 40:

> The current approach (asking Credit through an event) is better. The reason is the difference between reading data and changing it.
>
> **Why User and Supplier can be checked over HTTP:** these checks only read data that rarely changes, such as "is this session valid?" and "is this store active?". Nothing is reserved, so reading them during the request is safe.

Prompt 41 (2026-10-18 20:44 +08:00):

```text
i still dont understand what is order db and outbox. explain very simply
```

Key response 41:

> Think of Order Service as a small office.
>
> **Order DB = the filing cabinet.** It holds one folder per order with its current status. When anything changes, for example "Bob accepted", the folder is updated. If someone asks "what's the state of Alice's order?", the answer comes from here.

Prompt 42 (2026-10-18 20:47 +08:00):

```text
Credit service can handle rejection, how does order follow up? 1 line
```

Key response 42:

> When Credit rejects, it publishes `credit.reservation_failed`; Order Service's worker receives it, marks the order `REJECTED` with Credit's reason, and publishes `order.rejected`, so the order never reaches the open board.

Prompt 43 (2026-10-18 20:53 +08:00):

```text
generate a slide showing how the order body should like
```

Key response 43:

> I made the order body slide, matched to the real schema in `order-service/app/schemas.py`. "Order body" could mean the request or the event, so it shows both: on the left, what the frontend sends to `POST /orders`, and on the right, the `order.created` event Order Service publishes from it.

Prompt 44 (2026-10-18 20:55 +08:00):

```text
at any time, there is no order object?
```

Key response 44: none recorded; the request was interrupted or re-sent.

Prompt 45 (2026-10-18 20:55 +08:00):

```text
at any time, there is no order object? if no, justify why
```

Key response 45:

> Yes, there is an order object. It lives in Order Service and is never sent whole through the broker.
>
> Where it exists:
> - **In the database:** the `Order` model in `order-service/app/models.py` is the `orders` table. It holds the full order, including status, requester, courier, store, drop-off, item, credits and timestamps.
> - **In the API:** `OrderResponse` in `order-service/app/schemas.py` is the full order returned to the frontend by `POST /orders`, `GET /orders/{id}` and the other routes.

Prompt 46 (2026-10-18 20:58 +08:00):

```text
remove the words at the bottom, add what is stored in order DB
```

Key response 46:

> I've updated the slide: the notes at the bottom are gone, and a new middle column shows what's stored in the Order DB.
>
> ![Order body](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/order-body-v3.png)
>
> On your earlier question: there is always an order object. It's the `orders` row in Order DB, now the middle column. The request on the left is what creates it, and the event on the right announces it to other services.

Prompt 47 (2026-10-18 21:01 +08:00):

```text
generate the slide to be more visual and easier to understand
```

Key response 47:

> I've redrawn the slide as a visual timeline in the same navy and teal style.
>
> ![How one errand moves](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/errand-moves.png)
>
> What changed from the text version:
> - **The four stages sit over one status timeline:** `PENDING_CREDIT`, `OPEN`, `ACCEPTED`, `PICKED_UP`, `COMPLETED`. Each arrow is labelled with what moves it on (reserved, accept, pick up, confirm).
> - **Endings branch off the timeline:**
>   - **Rejected:** Credit refuses, so nothing is held.
>   - **Expired:** not accepted within 1 hour, so credits are returned. [...]

Prompt 48 (2026-10-18 21:04 +08:00):

```text
remove the two couriers accept at once box
```

Key response 48:

> I removed the "two couriers accept at once" box. The rest of the slide is unchanged.
>
> The updated slide is `/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/errand-moves-v2.png`, and the source `errand-moves.svg` in the same folder is updated too.

Prompt 49 (2026-10-18 21:07 +08:00):

```text
create 2 slides showing the invariants and how they and the system design handle possible edge cases. some come to mind:

if user service's create account event arrives, then immediately an order service place order arrives, credit service may falsely reject this order if the initial credit allocation is still being processed.

rabbitmq retries event without adjusting their orders? So if a cancel order arrives before a create order, right now it retries the cancel order and fails until the maximum number of retries, then move on to create order.

make each edge case and how the design/invariant solves them 1 line each in the slide.
```

Key response 49:

> I've made both slides in the same style as your errand slide, numbered 3 and 4.
>
> ![Invariants](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/invariants.png)
>
> ![Edge cases](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/edge-cases.png)

Prompt 50 (2026-10-18 21:11 +08:00):

```text
remove the planned in edge cases
```

Key response 50:

> I removed the three "planned" tags, and nothing else on the slide changed. Those three rows now read as if the behaviour already exists, but none of it is in the code yet:
> - Credit treating a cancel for a hold it never placed as already settled.
> - The worker exiting without acking when the database is down.
> - Malformed messages going straight to the dead-letter queue.

Prompt 51 (2026-10-18 21:12 +08:00):

```text
show me
```

Key response 51:

> Here is the edge-cases slide with the "planned" tags removed:
>
> ![Edge cases](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/edge-cases-v2.png)
>
> If you meant something else, such as the invariants slide or the `ROBOT_CAFE.jpeg` you have open, tell me which.

Prompt 52 (2026-10-18 21:17 +08:00):

```text
explain the edge cases simply
```

Key response 52:

> Here is each edge case in plain words:
>
> 1. **Order placed before the credit account is ready.** A brand-new user orders before Credit has set up their wallet. Credit says "no account", the order is rejected with that reason, and the user tries again a moment later.
> 2. **Cancel reaches Credit before its create.** All of an order's events go through one line, handled in order by one worker, so "create" always gets there before "cancel". Nothing retries out of turn, so nothing jumps the queue or blocks it.
> 3. [...]

Prompt 53 (2026-10-19 12:35 +08:00):

```text
make this diagram cleaner and show how frontend displays the update
```

Key response 53:

> I've redrawn the diagram on a cleaner grid and added the paths that show how the frontend gets updates.
>
> ![Event-driven order flow](/Users/a65945/.cursor/projects/Users-a65945-FoC/assets/m6-event-flow-v7.png)
>
> **Cleaner layout:**
> - Boxes are aligned, and every connector is straight or right-angled.
> - The two validation arrows now merge into one line labelled "validate".
> - Credit's "reserved / rejected" reply is a separate dashed line, so it no longer crosses the "order events" arrow.
> - A small legend at the bottom explains the line styles.

Prompt 54 (2026-10-19 12:41 +08:00):

```text
step by step what each component does
```

Key response 54:

> What each component does, in the order a request moves through the diagram:
>
> 1. **Frontend:** sends the user's actions (create, accept, pick up, complete, cancel) to the Order API, and shows the order's current status.
> 2. **User Service:** confirms who the caller is and that their account is active, every time the Order API asks.
> 3. **Supplier Service:** confirms the pickup store exists and is active, when an order is created.
> 4. **Order API:** checks the request, the user and the store, then saves the order change together with its event.
> 5. [...]

Prompt 55 (2026-10-19 12:46 +08:00):

```text
DB holds the order object, outbox holds the events? how are the events created
```

Key response 55:

> Yes. Both live in the same Order DB, as two tables: `orders` holds the order objects, and `outbox_events` holds the events waiting to be sent.
>
> **How an event is created:** every function that changes an order does three things in the same database session:
> 1. It changes the order row.
> 2. It calls `enqueue_event(...)`, which builds an event row and adds it to the session. It sends nothing yet.
> 3. It commits once, so the order change and the event row are saved together or not at all.

Prompt 56 (2026-10-19 12:49 +08:00):

```text
who changes the order row and creates events?
```

Key response 56:

> The order logic in `order-service/app/services/orders.py` does both. Two processes run that code:

Prompt 57 (2026-10-19 12:51 +08:00):

```text
would this not cause a lot of races and conflicts? lets say frontend changes .accepted to the same order a worker changes to .rejected
```

Key response 57:

> No. Two things stop it.
>
> **1. Row lock.** Both paths lock the order row before reading it, using `SELECT ... FOR UPDATE`:
> - the API through `_lock()` in `services/orders.py`
> - the worker in `apply_incoming`
>
> If both arrive at once, PostgreSQL makes the second wait until the first commits. They never run at the same time.

Prompt 58 (2026-10-19 13:16 +08:00):

```text
i got two riders who accept the same order at the same time. how does this handle it?
```

Key response 58:

> A database row lock lets only one rider take the order. Here's what happens when Rider A and Rider B both tap "accept" at the same moment:
>
> 1. Both requests reach `accept_order`, and each tries to lock the order row with `_lock()`, which runs `SELECT ... FOR UPDATE`.
> 2. PostgreSQL gives the lock to one of them, say Rider A. Rider B's request waits at that line.
> 3. Rider A's request sees the status is `OPEN`. It sets `ACCEPTED`, records Rider A as courier, saves `order.accepted` to the outbox and commits. Committing releases the lock.
> 4. [...]

Prompt 59 (2026-10-19 13:17 +08:00):

```text
do you think having a queue for this is better?
```

Key response 59:

> No. The row lock is the better fit here. A queue would make accepts slower and more complicated without making them any safer.

</details>

#### 2026-10-18: Order Service module questions

- Learning support: what the Order Service and its worker do, and who can call it. No file changed.
- Outcome: Answers in chat only.

<details>
<summary>Exact prompts and key responses (5)</summary>

Prompt 1 (2026-10-18 16:45 +08:00):

```text
what does the order service module do currently? im not talking about event queue rabbitMQ, im talking about the module before it. answer in 1 line points
```

Key response 1:

> The order service is a FastAPI + PostgreSQL REST API for a campus errand marketplace. Requesters post errands with a credit reward, and couriers accept and deliver them. Leaving out the RabbitMQ part, here is what it does:
>
> - **Create errand** (`POST /orders`): saves a new order with pickup supplier, delivery location, item description and credit amount, starting at status `PENDING_CREDIT`.
> - **Idempotent create**: needs an `Idempotency-Key` header. Re-sending the same request returns the original order (200), and reusing the key with a different body returns 409. [...]

Prompt 2 (2026-10-18 16:46 +08:00):

```text
who can do these actions? only frontened? what about the services like user, credit, etc.
```

Key response 2:

> Any caller holding a valid user login token can use the endpoints, not just the frontend. The order service never checks who the caller is (browser, curl or another service); it only checks the bearer token.
>
> **How access works:**
> - Every `/orders` endpoint needs an `Authorization: Bearer <token>` header. The order service sends that token to the User Service (`/users/me`) to find out who the caller is.
> - Permissions depend on the user's role (`user` or `admin`) and on how they relate to the order (requester or assigned courier). They don't depend on which app sent the request. [...]

Prompt 3 (2026-10-18 16:48 +08:00):

```text
if credit service sees an order that has no credit account, it rejects it, how does that go to order service?
```

Key response 3:

> It goes back through RabbitMQ: the Credit Service publishes a `credit.reservation_failed` event, and the order service's background worker picks it up and marks the order `REJECTED`. The order service side of this is fully built. The Credit Service isn't: `credit-service/` only has a `Dockerfile`, `README.md` and `AGENTS.md`, with no code publishing or consuming anything yet.

Prompt 4 (2026-10-18 16:49 +08:00):

```text
1 line
```

Key response 4:

> The Credit Service publishes a `credit.reservation_failed` event to RabbitMQ, and the order worker receives it and changes the order from `PENDING_CREDIT` to `REJECTED`, though the Credit Service side isn't built yet.

Prompt 5 (2026-10-18 16:49 +08:00):

```text
what is order worker? the module?
```

Key response 5:

> The order worker is `order-service/app/worker.py`. It's a separate background process built from the same order-service code, and Compose runs it as the `order-worker` container with `python -m app.worker`. It does two jobs:
>
> - **Sending events out:** it reads unpublished rows from the `outbox_events` table and publishes them to RabbitMQ (for example `order.created`, `order.accepted`, `order.rejected`).
> - **Receiving events in:** it listens for credit results (`credit.reserved`, `credit.reservation_failed`) and for orders that have hit their 1-hour expiry. [...]

</details>

#### 2026-10-19: Monolith vs microservices comparison

- Design discussion: drafted bullet points and a comparison table of monolithic and microservice approaches for the Order flow. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-10-19 12:06 +08:00):

```text
answer in 1 line bullet points
```

Key response 1:

> These answers come from your actual code: `order-service/app/services/orders.py` and `order-service/app/messaging.py`.
>
> **Monolithic approach**
> - One app with one shared database handles the user check, supplier check, credit hold and order insert.
> - Every component talks through in-process function calls, with no network hops or message broker.
> - Creating an errand is one ACID (all-or-nothing) transaction: check the requester, check the supplier, deduct or hold credits, and insert the order as `OPEN`. It all commits or it all rolls back. [...]

Prompt 2 (2026-10-19 12:07 +08:00):

```text
shorter, simpler
```

Key response 2:

> **Monolithic**
> - One app and one database do everything.
> - Create and accept each run as a single transaction: all succeed or all roll back.
> - Consistency is instant, and nothing needs undoing.
>
> **Microservices**
> - User, Supplier, Order and Credit services each have their own database.
> - Order Service saves the order as `PENDING_CREDIT` and sends an `order.created` event.
> - Credit Service holds the requester's credits and replies `credit.reserved`.
> - Order Service then marks the order `OPEN`.
> - A courier accepts, and the order becomes `ACCEPTED`. [...]

Prompt 3 (2026-10-19 12:08 +08:00):

```text
create a table to compare monolithic vs microservices
```

Key response 3:

> | Aspect | Monolithic | Microservices (FoC) |
> | --- | --- | --- |
> | Components | One app | User, Supplier, Order and Credit services |
> | Database | One shared database | One database per service |
> | Interactions | In-process function calls | REST calls plus events through RabbitMQ |
> | Create order | One transaction: check user, hold credits, save order as `OPEN` | Save as `PENDING_CREDIT`, send `order.created`, Credit Service holds credits, order becomes `OPEN` |
> | Accept order | One transaction: lock the row, set `ACCEPTED` | Order Service locks the row, sets `ACCEPTED`, sends `order.accepted [...]

</details>

#### 2026-10-19 to 2026-10-21: Lecture alignment, move to Kafka, event broker, slides and D3 answers

- Design discussion: compared the implementation with the lecture slides and, when asked, proposed architecture changes including moving from RabbitMQ to Kafka.
- Writing implementation code: switched the Order Service to Kafka in `order-service/app/events.py`, `messaging.py`, `worker.py`, `services/orders.py` and `requirements.txt`, and created `event-broker/compose.yaml` and `event-broker/create-topics.sh`. The AI drafted the plan, and Ewen approved it.
- Boilerplate generation: root `compose.yaml` `include:`, `.env.example` and `.github/workflows/compose.yml`.
- Refactoring and documentation improvements: `event-broker/README.md`, `order-service/README.md`, `order-service/docs/event-driven-order-flow.pptx` (including the asynchronous workflow slide), and `order-service/docs/d3-part1-part3-answers.pdf`, which drafted the answers to D3 Parts 1 and 3.
- Learning support: Alembic, Kafka, idempotency keys, conflicting actions and status enforcement.
- Outcome: Code pushed to PR #24, then split into [PR #27](https://github.com/AY2627S1-CS3219-P8/FoC/pull/27) (event broker); both are merged. `event-driven-order-flow.pptx` is on `main`; `d3-part1-part3-answers.pdf` is local only.

<details>
<summary>Exact prompts and key responses (26)</summary>

Prompt 1 (2026-10-19 16:35 +08:00):

```text
is what is currently implemented consisten with what is in this lecture?
```

Key response 1:

> **Mostly yes, with two real departures.** The order service follows the lecture's main event-driven ideas: events are past-tense facts, publishing is asynchronous, each service owns its own data, and choreography is driven by events. It departs from the lecture in two places:

Prompt 2 (2026-10-19 17:13 +08:00):

```text
if you were to change the current order service architecture to align with the lecture slides, what will you do?
```

Key response 2:

> I'd make four changes, in priority order. They remove the two departures from the lecture and close the two partial gaps: switch to a replayable, partitioned log, stop the producer from knowing its consumers, carry more data in events, and replace the synchronous Supplier check with a local copy. I'd keep the outbox, idempotency handling and event contract as they are, since they already match the lecture.

Prompt 3 (2026-10-19 17:21 +08:00):

```text
how would order service know credit_amount in the event before sending the event to credit service?
```

Key response 3:

> The requester sets the amount when they create the order. `credit_amount` is a required field in the `POST /orders` body. It's the reward the requester offers the courier for the errand, so the order service never has to ask Credit for it.

Prompt 4 (2026-10-19 17:23 +08:00):

```text
update these slides to reflect the proposed changes
```

Key response 4:

> I've recreated both slides with the proposed changes as a new two-slide deck, `order-service/docs/event-driven-order-flow.pptx`. Your screenshots aren't in the repo, so I couldn't edit the originals. Instead I rebuilt them as editable PowerPoint shapes in the same teal style, and each carries a "PROPOSED" tag because the code still uses RabbitMQ. I exported both slides through Keynote to check the layout; that's where the previews below come from.

Prompt 5 (2026-10-19 17:29 +08:00):

```text
why is supplier service not validated together with user service?
```

Key response 5:

> In the current code they are validated together: `create_order` calls the User Service and the Supplier Service while handling the request. They're split only in the proposed slides. The reason is that the two checks need different freshness, so the lecture's advice to avoid synchronous coupling suits one check and not the other.

Prompt 6 (2026-10-19 17:32 +08:00):

```text
- move supplier service beside user service when order api is validating, it should be checked together with user service
- remove +supplier copy in order DB, the 3 boxes below, worker description, supplier.events, and any description in event broker except (Kafka)
- make sure notification service has a way of updating the frontend also
```

Key response 6: none recorded; the request was interrupted or re-sent.

Prompt 7 (2026-10-19 17:33 +08:00):

```text
First slide:
- move supplier service beside user service when order api is validating, it should be checked together with user service
- remove +supplier copy in order DB, the 3 boxes below, worker description, supplier.events, and any description in event broker except (Kafka)
- make sure notification service has a way of updating the frontend also

second slide:
- remove the "proposed" and descriptor
- remove the words underneath each box, and space the lines out so its more readable
```

Key response 7:

> I've made all the changes, rebuilt `order-service/docs/event-driven-order-flow.pptx`, and checked both slides through a Keynote export.
>
> ![Event-Driven Order Flow](/tmp/foc_slides/out/out.001.png)
>
> **Slide 1, Event-Driven Order Flow:**
> - **Validation:** Supplier Service now sits next to User Service above the Order API. Both have grey synchronous arrows into the API, under one "validate (sync)" label.
> - **Removed:** "+ supplier copy" in the Order DB, the three explanation cards at the bottom, the Worker's sub-labels, the `supplier.events` topic and the Supplier Service on the right. [...]

Prompt 8 (2026-10-19 17:45 +08:00):

```text
implement order service and event broker

- do not implement notification service or credit service, or user/supplier service
- only make changes to order service, and event broker
- create a new directory "event broker" alongside the service directories and implement any code related to event broker there
- make minimal changes and do not over engineer, make sure the code is cleanly seperated by context
```

Key response 8: not quoted, because the final message was progress narration. See the outcome above.

Prompt 9 (2026-10-19 17:51 +08:00):

```text
does the proposed plan mirror the images?
```

Key response 9:

> Yes, for everything in scope. Each part of both slides that touches the Order Service or the broker has a matching step in the plan. Notification Service and its "status updates" path to the Frontend are drawn but not built, because you excluded those services. The plan also adds two things the slides don't show, and one header that differs slightly.

Prompt 10 (2026-10-19 17:53 +08:00):

```text
so does event_id send alongside event_type?
```

Key response 10:

> In the plan, yes: `event_id` would go out as a second Kafka header next to `event_type`. The slide shows only `event_type` in the headers. Either way, `event_id` is always in the message value, because it's part of the event envelope:

Prompt 11 (2026-10-19 17:54 +08:00):

```text
Kafka event broker for Order Service

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 11:

> Order Service now publishes and consumes through Kafka. RabbitMQ is gone. The API still never talks to the broker: each status change and its event commit together, and the worker delivers the event afterwards.
>
> **Event broker.** `event-broker/` runs a single Kafka node at `kafka:9092` and a one-shot job that creates the topics. `order.events` and `credit.events` have 3 partitions and are kept indefinitely. `order-service.credit-events.dlq` holds credit messages the worker cannot apply. Nothing in Notification, Credit, User, or Supplier Service was changed.

Prompt 12 (2026-10-19 18:12 +08:00):

```text
Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 12: none recorded; the request was interrupted or re-sent.

Prompt 13 (2026-10-19 18:12 +08:00):

```text
answer in 1 line each

- whats alembic
- how does kafka work here
- is notification service built
- were any services apart from event broker/order service modified
```

Key response 13:

> Alembic is the tool that creates and updates the Order Service's Postgres tables from the migration files in `order-service/alembic/versions/`.
>
> Kafka is the broker: the worker publishes order events to `order.events` and consumes credit events from `credit.events`, while the API only writes the order and its event into Postgres.

Prompt 14 (2026-10-19 18:13 +08:00):

```text
push to PR 24, make sure it has the latest code
```

Key response 14:

> PR 24 is up to date with the Kafka changes at commit `5178c7b`: https://github.com/AY2627S1-CS3219-P8/FoC/pull/24
>
> The commit includes the event broker, the Order Service worker changes, and the slides in `order-service/docs`. The local `.cursor/` folder was left untracked. The PR title still says "RabbitMQ outbox".

Prompt 15 (2026-10-19 18:17 +08:00):

```text
create 3 slides:
- 1 for event broker
- 1 for worker
- 1 for orderDB + outbox

make it simple, brief, short, easy to read and understand. do not need a lot of words
```

Key response 15:

> If the frontend resends the same order request with the same `Idempotency-Key`, the Order Service returns the original order with a 200 and writes nothing new. No second event is created.
>
> The Order Service never sends a "credit reservation" event. It publishes `order.created`, and Credit Service reserves the credits when it reads that event.

Prompt 16 (2026-10-19 21:29 +08:00):

```text
whats Idempotency-Key?
```

Key response 16:

> `Idempotency-Key` is an HTTP header the frontend sends with `POST /orders`. Its value is a unique ID that the frontend makes up for each order attempt, usually a UUID. It lets the server recognise a repeated request so that a retry doesn't create a second order.

Prompt 17 (2026-10-19 21:31 +08:00):

```text
what about two http with different keys but same actions to the same order, or conflicting actions to the same order
```

Key response 17:

> The `Idempotency-Key` is only used when creating an order. Accept, pickup, complete, cancel and change-delivery ignore it, so it makes no difference whether two action requests carry the same key, different keys or none.
>
> What protects an existing order is that every action first locks the order's database row. A second request for the same order waits until the first one has finished and saved its change. It then checks the order's new status and decides from that.

Prompt 18 (2026-10-19 21:35 +08:00):

```text
1 line
- any conflicting actions to orders (double order accept from frontend, accept order after cancel) how does order service handle it
```

Key response 18:

> The Order Service locks the order row, so the first action wins and the later one gets a 409 or 404 with no event (a double accept by the same courier just returns the order with a 200; accept after cancel is rejected).

Prompt 19 (2026-10-19 21:38 +08:00):

```text
1 line. how is this checked/rejected
```

Key response 19:

> Each action first runs `SELECT … FOR UPDATE` (`_lock` in `services/orders.py`), then checks the order's current status and courier or requester (for example, accept requires `status == "OPEN"`); if the check fails, `_illegal()` raises an HTTP 409, or a 403 or 404 for permission or visibility.

Prompt 20 (2026-10-19 21:40 +08:00):

```text
how is order enforced. how to register illegal actions to know what to raise
```

Key response 20:

> There is no central list of legal transitions. Each action function in `order-service/app/services/orders.py` checks the order's current status itself, and the row lock means only one action can run those checks on an order at a time.
>
> The intended flow is PENDING_CREDIT → OPEN → ACCEPTED → PICKED_UP → COMPLETED. CANCELLED, EXPIRED and REJECTED are side exits. Every action follows the same three steps:

Prompt 21 (2026-10-19 21:47 +08:00):

```text
i send 2 actions, accepted then pickup in that order. but pickup arrives first, then accept. how is this avoided?
```

Key response 21:

> Nothing on the server reorders them: the early pickup is rejected and the accept then succeeds normally. The fix belongs in the frontend.
>
> **What happens when pickup arrives first:**
>
> 1. **Pickup arrives** while the order is still OPEN with no courier. `_lock_visible` checks `_can_view`, which only lets an admin, the requester or the assigned courier see the order. This courier isn't assigned yet, so the request gets a **404** before the status check even runs. Nothing changes and no event is written.
> 2. [...]

Prompt 22 (2026-10-19 21:50 +08:00):

```text
so the component responsible for checking legal order status changes and enforcing correct ordering is the db?
```

Key response 22:

> No. The rules about which status changes are legal live in the Order Service's Python code, in `order-service/app/services/orders.py`. The database does three supporting jobs:
>
> - **Row lock.** `SELECT … FOR UPDATE` means only one request at a time can change a given order. A second request waits, then sees the latest status.
> - **Atomic commit.** The status change and its outbox event are saved together, or not at all.
> - **Basic checks on stored values.** `ck_orders_status` only allows known status names in the column. [...]

Prompt 23 (2026-10-19 21:51 +08:00):

```text
what component is this
```

Key response 23:

> It's the **Order API**, the FastAPI app in the `order-service` container (the "Order API" box on the architecture slide). Within it, the status rules live in the service layer: each action function in `order-service/app/services/orders.py` checks the current status and who is asking.

Prompt 24 (2026-10-19 21:52 +08:00):

```text
does the current implementation address all D3 requirements?
```

Key response 24:

> No. The Order Service, the Kafka event flow and the Order containers cover most of their parts of the D3 brief, but the Credit Service is empty, so Part 2 and the credit side of the integration demo are missing.

Prompt 25 (2026-10-19 21:55 +08:00):

```text
create a PDF to address all points/questions in part 1 and part 3. write the questions/points directly and the respective answers below in 1.2.3. format. make the answers simple, short, and easy to understand
```

Key response 25:

> I've created the PDF at `order-service/docs/d3-part1-part3-answers.pdf` (8 pages). It lists every Part 1 and Part 3 question from the D3 brief word for word, numbered 1.1, 1.3.1 and so on, with a short bullet-point answer under each.
>
> ![Page 2 preview](/tmp/foc_d3/page2.png)

Prompt 26 (2026-10-21 21:01 +08:00):

```text
create a slide for Asynchronous and Event-Driven Workflow. keep it simple and easy to read
```

Key response 26:

> I've added the slide as slide 6 of `order-service/docs/event-driven-order-flow.pptx`, and it renders cleanly in Keynote. The first five slides are unchanged.
>
> ![Asynchronous and Event-Driven Workflow slide](/tmp/foc_slides/out6/out/out.006.png)
>
> The slide shows the credit flow as three boxes: Order Service sends `order.created` through Kafka to Credit Service, and `credit.reserved` comes back the same way. One sentence underneath says the requester gets a 201 straight away and the order opens once Credit replies. [...]

</details>

#### 2026-10-19: Split PR #24 into stacked PRs

- Boilerplate generation: split PR #24 into the event broker PR #27 and the Order Service PR #24. File contents did not change.
- Outcome: Both PRs were later merged.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-19 18:19 +08:00):

```text
in PR 24, split it into 2 stacked PRs, one for order service only, one for event broker
```

Key response 1:

> PR 24 is now two stacked PRs:
>
> 1. [PR 27: feat: add Kafka event broker](https://github.com/AY2627S1-CS3219-P8/FoC/pull/27), based on `main`, 5 files. It contains the `event-broker/` folder, the `include:` line in the root `compose.yaml`, and the `event-broker/**` path filter for Compose CI.
> 2. [PR 24: feat: add Order Service](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24), now based on `event-broker`, 31 files. It contains everything for the order service. I updated its description to say Kafka instead of RabbitMQ and to note that PR 27 merges first.

</details>

#### 2026-10-20: N2H 4 Kubernetes slide and autoscaler questions

- Refactoring and documentation improvements: `docs/n2h-4-kubernetes.pptx`.
- Design discussion: one-line answers on AWS Lambda and KEDA as autoscalers.
- Outcome: Slide kept locally; not on `main`.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-10-20 21:45 +08:00):

```text
create a slide for N2H 4 - Kubernetes deployment and automated scaling. make it simple and brief and easy to read
```

Key response 1:

> I made the slide and saved it at `docs/n2h-4-kubernetes.pptx`. It uses the same cream-and-teal D3 style as `order-service.pptx`.
>
> ![N2H 4 slide preview](/tmp/n2hprev/v2.pptx.png)
>
> It has three parts:
> - **Header:** "Deploy every service, scale it automatically", plus a one-line summary underneath.
> - **Why FoC needs it:** three short cards. Busy hours (lunch and exam-week rushes), self-healing (a crashed copy restarts on its own), and safe updates (new versions roll out one copy at a time).
> - **How it fits together:** a simple diagram. [...]

Prompt 2 (2026-10-20 21:53 +08:00):

```text
is aws lambda a good autoscaler?
1 line why it is
```

Key response 2:

> Lambda isn't really an autoscaler. It's serverless compute that scales itself, running one copy per request and dropping to zero when idle, so you never set scaling rules. It's a poor fit for FoC, though, because the Order and Credit workers are long-running Kafka consumers, and Lambda works best for short, stateless requests. On the slide, Kubernetes' built-in Horizontal Pod Autoscaler is the right fit.

Prompt 3 (2026-10-20 21:54 +08:00):

```text
what is the best autoscaler and why? 1 line
```

Key response 3:

> For FoC, the best choice is **KEDA**, Kubernetes Event-Driven Autoscaling. It runs on top of Kubernetes' built-in Horizontal Pod Autoscaler and scales the Order and Credit workers by Kafka consumer lag, meaning how many messages are waiting, which shows real demand better than CPU does. One limit: a service can't usefully have more copies than its topic has partitions.

</details>

#### 2026-10-20 to 2026-10-22: Edge cases, Order API flow questions and presentation script

- Design discussion: listed common edge cases with solutions for the Order Service and event flow, and gave a one-line answer to "why choose kafka?".
- Learning support: how the Order API calls User and Supplier Service, threads, concurrent requests and the worker.
- Refactoring and documentation improvements: drafted a presentation script under 7 minutes. No file changed.
- Outcome: Answers and script in chat only.

<details>
<summary>Exact prompts and key responses (14)</summary>

Prompt 1 (2026-10-20 21:45 +08:00):

```text
come up with the most common edge cases and solutions for order service and the event driven architecture. write the problem 1 line, solution 1 line. easy to read and understand
```

Key response 1:

> These are the most common edge cases for the order service and the event-driven flow between Order Service and Credit Service over Kafka. Most of them are already handled in your code.

Prompt 2 (2026-10-21 21:11 +08:00):

```text
answer all in 1 line from this conversation forwards
```

Key response 2:

> Got it: from now on, every answer will be one line.

Prompt 3 (2026-10-21 21:14 +08:00):

```text
i still dont get how order api checks user and supplier service if its just an api
```

Key response 3:

> The Order API is also an HTTP client: during each request, `app/clients.py` calls the User Service at `GET /users/me` with the caller's bearer token to find out who the caller is, then calls the Supplier Service at `GET /suppliers/{id}` to confirm the pickup location exists, and only creates the order if both answers are OK.

Prompt 4 (2026-10-21 21:16 +08:00):

```text
is there a queue before order db + outbox
```

Key response 4:

> No: the API writes the order and its outbox row straight to the database in one transaction during the HTTP request, and Kafka only comes in after that, when the worker relays outbox rows out to `order.events`.

Prompt 5 (2026-10-21 21:16 +08:00):

```text
so if there are multiple HTTP requests what happens
```

Key response 5:

> Each request runs in parallel with its own database transaction, and the database keeps them safe: different orders never clash, the idempotency key's unique constraint stops duplicate creates, and row locks (`FOR UPDATE`) make conflicting actions on the same order, like two accepts, wait their turn so only the first succeeds.

Prompt 6 (2026-10-21 21:18 +08:00):

```text
so what happens if Two couriers accept the same order at once.
```

Key response 6:

> Both requests try to lock the order row (`_lock` uses `SELECT ... FOR UPDATE`), so the first courier gets the lock, sets the order to `ACCEPTED` with themselves as courier, and commits, then the second courier's request continues, sees the order is already `ACCEPTED` by someone else, and gets a 409 Conflict telling them they lost (`accept_order` in `order-service/app/services/orders.py`).

Prompt 7 (2026-10-21 21:19 +08:00):

```text
the API goes directly straight to the DB?
```

Key response 7:

> Yes: the FastAPI route calls the service function, which uses a SQLAlchemy session to read and write Postgres directly in that same request, with no queue or broker in between, and the only outside calls it makes first are the HTTP checks to the User and Supplier services.

Prompt 8 (2026-10-21 21:19 +08:00):

```text
so where is the API waiting when it checks user and supplier
```

Key response 8:

> It waits inside the request itself: the routes are plain `def`, so FastAPI runs each one on a threadpool thread, and that thread blocks on the `httpx` call to the User or Supplier service until it gets a reply or hits the 3-second timeout (`HTTP_TIMEOUT_SECONDS`), which becomes a 503, while other requests keep running on other threads.

Prompt 9 (2026-10-21 21:28 +08:00):

```text
so the API waits on the main thread, while it spawns 2 side threads to check user and supplier service while the main thread waits?
```

Key response 9:

> No: each request runs on a single threadpool thread, and that same thread calls the User Service and then the Supplier Service one after the other with no extra threads, while the main event-loop thread never waits and just keeps accepting new requests.

Prompt 10 (2026-10-21 21:29 +08:00):

```text
so 1 HTTP request 1 thread, and it sends message requests to user and supplier while that 1 thread waits?
```

Key response 10:

> Yes, one request gets one thread, but these are plain HTTP calls rather than messages, and they happen one at a time: the thread calls the User Service, waits for the reply, then calls the Supplier Service and waits again before writing to the database.

Prompt 11 (2026-10-21 21:29 +08:00):

```text
explain very clearly how this works
```

Key response 11:

> When a create-order request arrives, FastAPI hands it to one free worker thread, which sends an HTTP call to the User Service to check the token and waits up to 3 seconds for the reply, then sends an HTTP call to the Supplier Service to check the pickup location and waits again, then saves the order and its outbox event to Postgres in one transaction and returns the response, while other requests run the same steps on other threads.

Prompt 12 (2026-10-21 21:51 +08:00):

```text
how does worker work
```

Key response 12:

> The worker in `order-service/app/worker.py` is a separate process that runs one endless loop doing three jobs in turn: it polls `credit.events` and applies each message to the order (retrying a few times, then sending it to the DLQ if it still fails, and committing the offset either way), then publishes unsent outbox rows to `order.events` in id order and marks each one sent, then periodically expires orders that are past their `expires_at`.

Prompt 13 (2026-10-21 22:04 +08:00):

```text
generate the script explaining each slide very very clearly that clears all doubt and is very easy to understand. make sure in total is under 7mins
```

Key response 13:

> This needs more than one line, so here is the full script. It comes to about 850 words, which is roughly 6 to 6.5 minutes at a normal speaking pace.
>
> ---
>
> "Let's start with what an order actually is. In our app, an order is an errand. A requester like Alice asks someone to pick something up for her, and she pays in credits.

Prompt 14 (2026-10-22 15:09 +08:00):

```text
why choose kafka? 1 line
```

Key response 14:

> Kafka keeps every event in a durable log that can be replayed (retention is set to never delete), keeps each order's events in order by keying them on `order_id`, and lets both Credit and Notification read the same `order.events` stream independently at their own pace, which a simple job queue like RabbitMQ or SQS doesn't do as naturally.

</details>

#### 2026-10-20: Order API to Order DB and outbox explanation

- Learning support: explained the outbox flow simply. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-20 21:58 +08:00):

```text
im still unclear how the order api to order db + outbox flow works. explain very simply
```

Key response 1:

> The order API never talks to Kafka. It saves two rows to Postgres in one go: the order, plus a "to-do" note saying "tell everyone this order was created." A separate worker process later picks up those notes and sends them to Kafka.
>
> When someone creates an order, two things need to happen:

</details>

#### 2026-10-22: Worker crash when the DLQ is unavailable

- Debugging assistance: assessed a reviewer's comment on DLQ failures and explained the problem.
- Writing implementation code: kept the worker alive when a DLQ publish fails (`order-service/app/worker.py`, commit `8b9ff20`). Following Ewen's requirement that a bad message must not block good ones, it added parking in Postgres (`order-service/app/worker.py`, `order-service/app/models.py`, `order-service/alembic/versions/20261022_0002_parked_messages.py`, `order-service/README.md`, commit `63aa98e`).
- Outcome: Pushed to PR #24, which is merged.

<details>
<summary>Exact prompts and key responses (13)</summary>

Prompt 1 (2026-10-22 11:40 +08:00):

```text
"""
When Kafka is down or slow:

A message gets nacked and dead_letter is called.
The DLQ send isn't acknowledged within 10s, so RuntimeError is raised and main() exits. The worker container dies.
Until Docker restarts it, everything the worker does stops: no outbox events are sent, no credit messages are processed, and no expiry sweep runs.
On restart, the offset was never committed, so the same message is processed again. That means another ~7.5s of retries and another DLQ attempt.
If Kafka is still unhealthy, the worker gets stuck in a crash loop.
Recommended to wrap this publisher.dead_letter in a try except
"""

this comment in PR 24. summarise in 1 line
```

Key response 1:

> If Kafka is down or slow, the DLQ publish times out after 10s and the `RuntimeError` it raises kills the worker; the offset is never committed, so the restarted worker reprocesses the same message and crash-loops, which is why the comment suggests wrapping `publisher.dead_letter` in a try/except.

Prompt 2 (2026-10-22 11:41 +08:00):

```text
is this valid? be objective
```

Key response 2:

> The facts in the comment are accurate, and the risk is real but narrower than it sounds. The suggested fix is also wrong if it's done naively: a bare try/except here turns a crash into silent message loss.
>
> **What the comment gets right**
>
> - `dead_letter` calls `_require_delivery`. That flushes for 10s and raises `KafkaException` or `RuntimeError` if the send isn't acknowledged. In `_handle_message` nothing catches it, so it goes up through `main()` and the process exits. The relay and the expiry sweep catch their own errors, but this path doesn't. [...]

Prompt 3 (2026-10-22 11:44 +08:00):

```text
i dont understand. explain simply in 1 line
```

Key response 3:

> The comment is partly right: the worker can crash and restart over and over, but only when a bad message can't be sent to the DLQ. And just catching the error would quietly lose that message, so the fix should keep it and retry later.

Prompt 4 (2026-10-22 11:45 +08:00):

```text
i dont understand the problem
```

Key response 4:

> Here's the problem in plain steps:
>
> 1. The worker reads a message from Kafka and tries to save it to the database. It fails 5 times, maybe because the message is broken.
> 2. So the worker tries to set the message aside by sending it to the "failed messages" topic (the DLQ).
> 3. If Kafka doesn't answer within 10 seconds, that send throws an error. Nothing catches it, so the whole worker crashes.
> 4. While the worker is down, its other jobs stop too: sending order events and expiring old orders.
> 5. Docker restarts the worker. [...]

Prompt 5 (2026-10-22 11:46 +08:00):

```text
the DLQ is in kafka?
```

Key response 5:

> Yes. The DLQ is just another Kafka topic, `order-service.credit-events.dlq`. It's created in `event-broker/create-topics.sh` and set in `order-service/app/messaging.py` (line 7).
>
> That's the core of the problem. When Kafka is unhealthy, the DLQ is unhealthy too, because it's the same Kafka. The worker's fallback for bad messages depends on the very system that's failing, so instead of setting the message aside, the worker crashes.

Prompt 6 (2026-10-22 11:47 +08:00):

```text
fix the problem and push the changes to PR 24 with minimal lines changed
```

Key response 6:

> I pushed the fix to [PR 24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24) as commit `8b9ff20`, which touches one file (`order-service/app/worker.py`) and changes 8 lines. The worker no longer crashes when it can't send a failed message to the DLQ.

Prompt 7 (2026-10-22 11:50 +08:00):

```text
will the bad message block the other good messages from reaching the worker?
```

Key response 7:

> Partly. The bad message blocks the good messages behind it in the same partition, and it slows down the rest. This only lasts while the DLQ send keeps failing.
>
> **Same partition: blocked.** `credit.events` has 3 partitions (see `event-broker/create-topics.sh`, line 18). Kafka hands out each partition's messages in order. `seek` rewinds that partition to the bad message, so the good messages after it there wait until the bad one gets through. That's roughly a third of the traffic.

Prompt 8 (2026-10-22 11:54 +08:00):

```text
cant i keep the bad message somewhere instead of blocking the good messages in the same partition? also what partition is that?
```

Key response 8:

> **Which partition?** Credit Service sends each `credit.events` message with the `order_id` as its key, as listed in `event-broker/README.md` (line 10). Kafka hashes that key to choose one of the 3 partitions. So every message about one order lands in the same partition, and that partition is also shared with roughly a third of all other orders. The partition is never set by hand; it depends on whichever order the bad message belongs to.

Prompt 9 (2026-10-22 11:55 +08:00):

```text
so if my credit.events message is bad, other good credit.events messages cant get through?
```

Key response 9:

> No, not normally. Good messages only get stuck when a bad message arrives and Kafka can't accept it into the DLQ at the same time.
>
> **Normal case (Kafka healthy):**
> 1. A bad `credit.events` message fails 5 times, which takes about 7.5 seconds.
> 2. The worker sends it to the DLQ, which works.
> 3. The worker marks it as done and moves on. Good messages are only delayed by those few seconds.

Prompt 10 (2026-10-22 11:56 +08:00):

```text
i want to find a way when bad message and DLQ send fails, the bad message does not block good messages from the worker
```

Key response 10:

> To do this, keep the bad message in the order-service's Postgres database instead of rewinding Kafka. Postgres is separate from Kafka, so it's usually still working when Kafka is down. Once the message is saved, the worker can mark it as done in Kafka and move on to the good messages.

Prompt 11 (2026-10-22 11:57 +08:00):

```text
implement this on PR24, minimal changes to the code
```

Key response 11:

> I pushed the change to [PR 24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24) as commit `63aa98e`. A bad message no longer blocks the good messages in its partition when the DLQ is down. The worker now saves it to Postgres and moves on.
>
> **What happens now when a bad message arrives and the DLQ send fails**

Prompt 12 (2026-10-22 12:00 +08:00):

```text
how many lines changed?
```

Key response 12:

> The parking commit (`63aa98e`) added 136 lines and removed 13, across 4 files:

Prompt 13 (2026-10-22 12:00 +08:00):

```text
1 line to summarise the fix
```

Key response 13:

> When the DLQ send fails, the worker now saves the bad message in Postgres, moves on to the good messages, and forwards the saved message to the DLQ once Kafka recovers. If Postgres is also down, it rewinds and retries the message instead of crashing.

</details>

#### 2026-10-22: State transition enforcement question

- Learning support: how order status changes are checked. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-10-22 12:01 +08:00):

```text
how does state transition enforcement work?
```

Key response 1:

> The rules live entirely in the service layer, `app/services/orders.py`, and there is no central transition table. Each action function locks the order row, checks who is calling, checks the current status, and then writes the new status in the same database transaction as its outbox event. The database itself only checks that `status` is one of the eight known values (`ck_orders_status` in `app/models.py`); it doesn't check which status can follow which.

Prompt 2 (2026-10-22 12:03 +08:00):

```text
1 line
```

Key response 2:

> Each action function in `app/services/orders.py` locks the order row, checks who is calling and the current status, and returns 409 through `_illegal` on a bad transition, while the Kafka and expiry handlers just skip transitions that don't apply.

Prompt 3 (2026-10-22 12:03 +08:00):

```text
i dont get it. simpler
```

Key response 3:

> Each button that changes an order first checks whether the order is in the right state for it.
>
> For example, "pick up" only works if the order is currently `ACCEPTED`. If it's anything else, like still `OPEN` or already `COMPLETED`, the request is refused with a "Cannot pick up an order with status …" error (HTTP 409).

</details>

#### 2026-10-22: Resolve PR #24 and PR #27 conflicts

- Debugging assistance: resolved the `.github/workflows/compose.yml` conflict on `event-broker` and merged it into `order-service`.
- Outcome: Pushed as commits `14035b5` and `c505e86`; both PRs later merged.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-22 12:05 +08:00):

```text
resolve the PR24 conflicts. do not merge
```

Key response 1:

> I resolved the conflicts on [PR #24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24) without merging the PR, and all its CI checks now pass.
>
> **Where the conflict was:** PR #24 (`order-service`) is stacked on [PR #27](https://github.com/AY2627S1-CS3219-P8/FoC/pull/27) (`event-broker`), and the conflict actually came from `event-broker`. Since `event-broker` branched off, `main` has picked up the Supplier Service CI changes. Both branches edited the trigger path lists in `.github/workflows/compose.yml`, so PR #27 conflicted with `main` too.

</details>

#### 2026-10-22: PR #26 compatibility review and Order Service HTTPS fix

- Code review (outside the course categories): checked Credit Service PR #26 against PR #24 and PR #27, and posted four inline comments on PR #26.
- Debugging assistance: made Order Service call User Service over HTTPS with a CA file (`order-service/app/clients.py`, `order-service/app/main.py`, `compose.yaml`).
- Outcome: The HTTPS change was left uncommitted, then carried into the demo merge.

<details>
<summary>Exact prompts and key responses (5)</summary>

Prompt 1 (2026-10-22 12:11 +08:00):

```text
check PR 26 "Implement Credit Service Infrastructure and Event-Driven Workflows", if its compatible with the order service and event broker
```

Key response 1:

> **The event contract between the two services is compatible, but [PR #26](https://github.com/AY2627S1-CS3219-P8/FoC/pull/26) can't merge cleanly as it stands. It breaks the order service's login check, conflicts with the event broker PR, and sends one ordinary cancel case to the dead-letter topic.**

Prompt 2 (2026-10-22 12:17 +08:00):

```text
1 line per issue. simply
```

Key response 2:

> 1. PR 26 makes User Service HTTPS-only, but the order service still calls `http://user-service:8080` with no CA file, so every authenticated order request will fail.
> 2. PR 26 and PR 27 both add `event-broker/` and edit `compose.yaml`, so they conflict, and PR 27's `create-topics.sh` doesn't create the `credit-service.order-events.dlq` topic the credit worker writes to.
> 3. PR 26 already conflicts with `main`, because its `credit-service/Dockerfile` and `README.md` clash with the skeleton files there and `compose.yaml` has changed since #30.
> 4. [...]

Prompt 3 (2026-10-22 12:20 +08:00):

```text
comment on PR26. highlight lines minimally where changes are needed. comments should be as simple and easy to understand as possible.
```

Key response 3:

> I posted a review on [PR 26](https://github.com/AY2627S1-CS3219-P8/FoC/pull/26#pullrequestreview-5609217820) with four inline comments, each highlighting only the lines that need to change. It's posted as a plain comment, so it doesn't block or approve the PR.

Prompt 4 (2026-10-22 12:26 +08:00):

```text
for the https issue, should credit service or order service change for the most efficient fix?
```

Key response 4:

> The order service should change. It's the smaller fix, and it doesn't undo a feature PR 26 built on purpose.
>
> **Changing the order service** (in [PR #24](https://github.com/AY2627S1-CS3219-P8/FoC/pull/24)) takes about three small edits:
> - In `compose.yaml`, point `order-service` at `https://user-service:8080` and mount the CA file, the same way `credit-service` does.
> - In `order-service/app/clients.py`, give `UserServiceClient` a CA file and use it to verify the certificate. With httpx you can pass `verify=ssl.create_default_context(cafile=ca_file)`. [...]

Prompt 5 (2026-10-22 12:28 +08:00, sent 2 times):

```text
fix this by making minimal changes to PR 27 event broker
```

Key response 5:

> The order service now calls User Service over HTTPS and checks its certificate against the CA file, matching how PR 26's credit service does it. The changes are local and uncommitted on your `order-service` branch (PR 24's branch); nothing is pushed yet.

</details>

#### 2026-10-22: Live demo console, Credit Service merge and reset button

- Writing implementation code: the demo console (`demo-console/`) with an animated broker view, plus `compose.demo.yaml`.
- Debugging assistance: merged the Credit Service branch and resolved conflicts in `compose.yaml`, `.env.example`, `.github/workflows/compose.yml`, `README.md`, `event-broker/README.md`, `event-broker/create-topics.sh`, `docs/internal-https.md`, `supplier-service/README.md`, `supplier-service/app/config.py` and `supplier-service/tests/unit/test_config.py`. It also added `scripts/generate-dev-tls.sh`.
- Writing implementation code: a demo-only credit reset in `credit-service/app/config.py`, `credit-service/app/routes/credits.py`, `credit-service/app/services/credits.py` and `credit-service/tests/test_credit_services.py`, plus the console button.
- Learning support: how to use the demo, Kafka UI, races, status polling and the credit flow.
- Outcome: The merge became commit `a9b663a` on the demo branch. `demo-console/`, `compose.demo.yaml`, `scripts/generate-dev-tls.sh` and the credit reset are local only, not on `main`.

<details>
<summary>Exact prompts and key responses (19)</summary>

Prompt 1 (2026-10-22 15:01 +08:00):

```text
i want to show a live demo showcasing order service and the kafka event broker. find a way to visualise and interact with the live demo, also to show how asynchronity works
```

Key response 1:

> PR #26 brings the missing pieces: a TLS setup script for User Service, Credit Service itself, and an event contract that matches Order Service. I'm checking how its compose file wires them together.

Prompt 2 (2026-10-22 15:06 +08:00):

```text
Live demo: Order Service + Kafka broker

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 2:

> The live demo is running. Open the console at **http://127.0.0.1:8091** and the read-only Kafka UI at **http://127.0.0.1:8090**.
>
> The console talks to the real Order, Credit, User, and Supplier services. Alice, Bob, and Carol are already registered. A click returns in a few tens of milliseconds — a create just now came back **201 in 49.6ms** as `PENDING_CREDIT`, and the card turned `OPEN` only after `order.created`, `credit.reserved`, and `order.opened` showed up on the timeline. Bob's accept returned **200 in 21.2ms** and the card moved to `ACCEPTED`. [...]

Prompt 3 (2026-10-22 15:26 +08:00):

```text
Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 3: none recorded; the request was interrupted or re-sent.

Prompt 4 (2026-10-22 15:26 +08:00):

```text
how do i use it
```

Key response 4:

> Open **http://127.0.0.1:8091**. That page is the demo. Kafka UI is at **http://127.0.0.1:8090** if you want to look at topics, partitions, and consumer lag.
>
> The stack from the last run should still be up. If the page does not load, from the repo root:

Prompt 5 (2026-10-22 15:28 +08:00):

```text
after pickup why is it not completed
```

Key response 5:

> Pickup only moves the order to `PICKED_UP`. Completion is the next click, and only Alice can do it.
>
> The life of an order is `OPEN` → `ACCEPTED` → `PICKED_UP` → `COMPLETED`. The assigned courier confirms they have the item with **Pickup**, which writes `order.picked_up` and stops there. The requester confirms they received it with **Alice completes**, which is the only call that sets `COMPLETED` and publishes `order.completed`. That event is what makes Credit pay the courier. Pickup does not move any credit.

Prompt 6 (2026-10-22 15:29 +08:00):

```text
where is alice completes button?
```

Key response 6:

> **Alice completes** is on the demo console at http://127.0.0.1:8091, in the **Do something** panel. It sits on the same row as **Pickup**, immediately under **Race Bob and Carol**.
>
> It stays grey until you click an order card. Select the card that is already `PICKED_UP`, then press **Alice completes**.

Prompt 7 (2026-10-22 15:30 +08:00):

```text
what am i supposed to see on kafka ui?
```

Key response 7:

> Kafka UI at http://127.0.0.1:8090 is the broker's own view of the same events the demo page draws. Open the cluster named **foc**, then **Topics**.
>
> You should see four topics:

Prompt 8 (2026-10-22 15:32 +08:00):

```text
is there a more easy to understand and visualise way to learn how kafka works?
```

Key response 8:

> Kafka UI is an operator console, so it shows partitions, offsets, and consumer groups with no story. The easier picture of this system is the demo page at http://127.0.0.1:8091. Kafka UI is only for checking the raw log behind that timeline.
>
> Four ideas cover what that log is doing.

Prompt 9 (2026-10-22 15:34 +08:00):

```text
i want a visualisation of the kafka event broker on the visual console that clearly showcases how the event broker works
```

Key response 9: none recorded; the request was interrupted or re-sent.

Prompt 10 (2026-10-22 15:34 +08:00):

```text
i want a visualisation of the kafka event broker on the visual console that clearly showcases how the event broker works. add animations to how the flow works also, you can use the architecture diagram to show how this works with animations on the console.
```

Key response 10: none recorded; the request was interrupted or re-sent.

Prompt 11 (2026-10-22 15:35 +08:00, sent 2 times):

```text
Animated event broker view on the demo console

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 11:

> The demo console at http://127.0.0.1:8091 now has an architecture panel above the timeline. Each cell is one Kafka record. The bar on a partition is that consumer group's committed offset, and the number beside it is the lag.
>
> I ran the four scenes in the browser:

Prompt 12 (2026-10-22 15:56 +08:00):

```text
how to top up credits for alice
```

Key response 12:

> The demo page cannot add credit. Alice already received her one-time grant of **100** on her first `order.created`, and that grant does not run again. Cancelling an open order only returns credit that is already held.
>
> To add more, call the admin adjustment on Credit Service. It needs an administrator token, and this stack was started without one.

Prompt 13 (2026-10-22 15:58 +08:00):

```text
put back all credits free to both alice and bob
```

Key response 13:

> Alice's held credit is back in her free balance, except for one order that is already picked up. Bob's credit was already entirely free.

Prompt 14 (2026-10-22 16:05 +08:00):

```text
if it races, why does the whole thing not work correctly?
```

Key response 14:

> The race is working when one courier gets **200** and the other gets **409**. The order, the outbox, and Kafka stay on a single `order.accepted`. What fails is pressing Race before the order is `OPEN`, or expecting the rest of the saga to run from that click.

Prompt 15 (2026-10-22 16:08 +08:00):

```text
when i create an order, what is sent back to frontend after credit service verifies?
```

Key response 15:

> Nothing is pushed to the frontend. Credit's answer goes to the order worker on Kafka, and the page only notices the new status the next time it reads the order.
>
> When the reservation succeeds, Credit writes `credit.reserved` onto `credit.events`. The body is:

Prompt 16 (2026-10-22 16:10 +08:00):

```text
status poll and order api goes to opened?
```

Key response 16:

> No. The status poll only reads an order that is already `OPEN`. It does not create `order.opened`.
>
> `order.opened` is written by the order worker, after it consumes `credit.reserved`. In that same database commit the worker sets the row's status to `OPEN` and stages `order.opened` in the outbox. The worker then publishes that event to `order.events`.

Prompt 17 (2026-10-22 16:14 +08:00):

```text
what is the dashed status poll?
```

Key response 17:

> The dashed status poll is the demo page asking the Order API whether the row has changed. It is not a Kafka record and not a reply from Credit.
>
> After the order worker applies `credit.reserved` and sets the order to `OPEN`, the page calls `GET /api/orders/{id}` about every 500 ms. That call is Alice's `GET /orders/{id}`. The API reads the order row and returns it, including `"status": "OPEN"`. The card updates from that response.

Prompt 18 (2026-10-22 16:16 +08:00, sent 2 times):

```text
put a reset button to reset the credit balances
```

Key response 18:

> **Reset balances** is in the Credit panel. Alice and Bob are back to **100 free / 0 held**. Carol still has no account.
>
> The button cancels open and accepted orders, completes a picked-up order while its hold is still active, then sets each demo account back to the starting grant. One order was already picked up before that hold was cleared, so completing that one will not pay the courier.

Prompt 19 (2026-10-22 16:39 +08:00):

```text
where is the pptx for this?
```

Key response 19:

> That slide is **slide 2** of `order-service/docs/event-driven-order-flow.pptx`.
>
> The deck is the “Event-Driven Order Flow” presentation. Slide 2 is titled **Order body** and shows the three columns from your screenshot: `POST /orders`, the stored `orders` row, and `order.created` on `order.events`.

</details>

#### 2026-10-22: Kafka container question

- Learning support: explained that Kafka runs in its own container. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-22 15:54 +08:00):

```text
is kafka in its own container
```

Key response 1:

> Yes, Kafka runs in its own container. It's defined in `event-broker/compose.yaml`, and the root `compose.yaml` pulls that file in with `include:`, so it starts with the rest of the stack.

</details>

#### 2026-10-22: Order DB and outbox schema question

- Learning support: described the Order Service tables. No file changed.
- Outcome: Answer in chat only.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-22 17:45 +08:00):

```text
what is the schema for outbox and order db
```

Key response 1:

> The Order Service database has four tables: `orders`, `outbox_events`, `processed_events` and `parked_messages`. They're defined in `order-service/app/models.py`, created by the baseline migration `20261005_0001_baseline_orders.py`, and `parked_messages` was added by `20261022_0002_parked_messages.py`.

</details>

#### 2026-10-29: PR #33 review

- Code review (outside the course categories): reviewed PR #33 (frontend order and credit integration). No file changed.
- Outcome: Review findings reported in chat.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-10-29 15:57 +08:00):

```text
review PR 33 "Frontend order credit integration"
```

Key response 1:

> **Request changes.** [PR 33](https://github.com/AY2627S1-CS3219-P8/FoC/pull/33) wires the feed, request form, errand list, and credits page to Order Service and Credit Service carefully, but a few user-facing paths do not match the services or the mobile layout. No CI checks ran on `frontend-order-credit-integration`.

</details>

#### 2026-11-03: Local Kubernetes (kind) deployment

- Boilerplate generation: Kustomize manifests in `deploy/k8s/` (apps, data, jobs, demo, seed, tools, `kind-config.yaml`), and `scripts/k8s-up.sh` and `scripts/k8s-down.sh`. The AI drafted the plan, and Ewen approved it.
- Refactoring and documentation improvements: the "Running on Kubernetes (kind)" section of `README.md`.
- Learning support: one-line overviews of the Kubernetes architecture.
- Outcome: Opened as [PR #35](https://github.com/AY2627S1-CS3219-P8/FoC/pull/35), still open.

<details>
<summary>Exact prompts and key responses (8)</summary>

Prompt 1 (2026-11-03 21:46 +08:00):

```text
is kuberneted working?
```

Key response 1:

> Kubernetes is not working on this machine. The `kubectl` client is installed (v1.32.2), but it has no cluster to talk to.
>
> - There is no `~/.kube` directory and no current context (`current-context is not set`).
> - With no context, `kubectl` falls back to `http://localhost:8080` and that connection is refused.
> - `minikube` and `kind` are not installed, and this project has no Kubernetes config.

Prompt 2 (2026-11-03 22:17 +08:00):

```text
if i want to implement kubernetes, how will it be done?
```

Key response 2:

> Kubernetes for Friend on Campus is a translation of the existing Docker Compose stack, not a rewrite of the services. The Dockerfiles, health checks, Alembic migrations, and service DNS names in `compose.yaml` already define the runtime. A cluster would run those same images under Kubernetes objects.

Prompt 3 (2026-11-03 22:19 +08:00):

```text
implement this
```

Key response 3: not quoted, because the final message was progress narration. See the outcome above.

Prompt 4 (2026-11-03 22:22 +08:00):

```text
Run FoC on a local kind cluster

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 4:

> Friend on Campus is running on a local kind cluster named `foc`. The same host URLs as Docker Compose are live.

Prompt 5 (2026-11-03 22:43 +08:00):

```text
push the kubernetes changes as a new PR
```

Key response 5:

> The Kubernetes changes are in pull request https://github.com/AY2627S1-CS3219-P8/FoC/pull/35, based on `main`.
>
> The pull request adds the Kustomize manifests, `scripts/k8s-up.sh`, `scripts/k8s-down.sh`, the Unix certificate script, and the README section. Your other local edits, including the Compose, credit, and order changes, are still uncommitted on `demo/live-order-kafka`. `--demo` is documented but not runnable from this branch, because `demo-console/` is not on `main`.

Prompt 6 (2026-11-03 22:47 +08:00):

```text
1 line overview of the architecture
```

Key response 6:

> Friend on Campus runs as one kind namespace where Compose services become Deployments, workers, and StatefulSets that keep the same DNS names, with one-shot migration Jobs starting first and NetworkPolicies hiding each database from the other services.

Prompt 7 (2026-11-03 22:48 +08:00):

```text
1 line overview of the kubernetes architecture
```

Key response 7:

> A local kind cluster runs the Compose stack in the `foc` namespace: one-shot Jobs migrate the databases, then Deployments run the APIs and Kafka workers behind the same service names and host ports.

Prompt 8 (2026-11-03 22:48 +08:00):

```text
1 line overview of the kubernetes architecture. explain simply
```

Key response 8:

> One local kind cluster runs the same FoC containers as Docker Compose: databases and Kafka start first, one-shot Jobs migrate them, then the APIs and workers talk to each other by their existing service names.

</details>

#### 2026-11-03: AsyncAPI contract update

- Refactoring and documentation improvements: added `order.opened`, `order.rejected` and the rejection `reason` to `contracts/asyncapi.yaml`, and the Notification consumer note to `contracts/README.md`.
- Also in this chat, a re-sent plan prompt made the AI rebuild and re-check the existing demo console broker panel.
- Outcome: Opened as [PR #34](https://github.com/AY2627S1-CS3219-P8/FoC/pull/34), still open.

<details>
<summary>Exact prompts and key responses (7)</summary>

Prompt 1 (2026-11-03 21:46 +08:00):

```text
"can u update the order service asyncapi contract to include order.opened and order.rejected events as well? functionally idt it will affect anything if not listed, but just for notification service i plan to have it consume order.opened, order.rejected, order.accepted, order.picked_up, order.completed, order.cancelled and order.expired events
so i think good to have it documented"
```

Key response 1: not quoted, because the final message was progress narration. See the outcome above.

Prompt 2 (2026-11-03 21:53 +08:00):

```text
summarize in 1 line. both the ask and the plan
```

Key response 2:

> You asked to have `order.opened` and `order.rejected` documented in the order AsyncAPI contract for Notification Service, and the plan adds both events to the `event_type` list in `contracts/asyncapi.yaml` plus the `reason` field that rejected orders carry.

Prompt 3 (2026-11-03 21:54 +08:00):

```text
Animated event broker view on the demo console

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 3:

> The animated broker panel is live at http://127.0.0.1:8091. It was already in the demo console, so I rebuilt that service and ran the scenes in the browser.
>
> The panel draws Frontend, Order API, Order DB and its outbox, the worker, Kafka, and Credit Service. Notification Service stays dashed and labeled "not built". Inside the broker, `order.events` and `credit.events` are three partition rows each. A cell is one record. The bar is the consumer group's committed offset, and the number beside it is that partition's lag.

Prompt 4 (2026-11-03 22:06 +08:00):

```text
what was done. 1 line. what are the problems. 1 line
```

Key response 4:

> The animated broker panel on the demo console was rebuilt and checked in the browser: dots follow real HTTP and Kafka records, and the partition lag matched `credit-service-order`.
>
> While Kafka was stopped, the console process crashed with exit code 139, so that scene had to be continued after a restart.

Prompt 5 (2026-11-03 22:08 +08:00):

```text
the ask was for order.opened and order.rejected documented in the order AsyncAPI contract for Notification Service. why was the demo panel rebuilt? 1 line
```

Key response 5:

> A later message in this chat attached the broker-panel plan and told me to implement that instead, so the AsyncAPI contract was never updated.

Prompt 6 (2026-11-03 22:09 +08:00):

```text
Document order.opened and order.rejected in the AsyncAPI contract

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 6:

> `order.opened` and `order.rejected` are now in the order event list in `contracts/asyncapi.yaml`, and `OrderPayload` includes the `reason` field that a rejection carries. `contracts/README.md` records that Notification Service will consume `order.opened`, `order.rejected`, `order.accepted`, `order.picked_up`, `order.completed`, `order.cancelled`, and `order.expired`.

Prompt 7 (2026-11-03 22:12 +08:00):

```text
open a PR to https://github.com/AY2627S1-CS3219-P8/FoC.git  only for changes made in /Users/a65945/.cursor/plans/document_order.opened_and_order.rejected_c0b92cb3.plan.md
```

Key response 7:

> The pull request is https://github.com/AY2627S1-CS3219-P8/FoC/pull/34. It is based on `main` and contains only `contracts/asyncapi.yaml` and `contracts/README.md`: `order.opened`, `order.rejected`, the rejection `reason`, and the Notification Service consumer note. The other local changes stayed uncommitted.

</details>

#### 2026-11-05 to 2026-11-06: PR #33 inline review comments

- Code review (outside the course categories): posted inline comments, first on the template repo's PR #33 by mistake, then two on the team's PR #33.
- Outcome: Two comments remain on the team PR #33.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-11-05 11:48 +08:00):

```text
review PR 33. add inline comments. comments should be 1 line, simple to understand
```

Key response 1:

> Left 11 one-line comments on [PR 33](https://github.com/CS3219-AY2627S1/FoC-Template/pull/33#pullrequestreview-5779633196).
>
> The two that will break things first:
>
> - CI lists a `pkg` module that is not in the repo, so that job fails before tests run.
> - `POST /api/auth/create` is public and trusts the Firebase uid from the request body.

Prompt 2 (2026-11-05 11:52 +08:00):

```text
leave only the most important 2 comments. delete the rest
```

Key response 2:

> Deleted the other nine. Two comments are still on [PR 33](https://github.com/CS3219-AY2627S1/FoC-Template/pull/33#pullrequestreview-5779633196):
>
> - CI lists a `pkg` module that is not in the repo, so that job fails before tests run.
> - `POST /api/auth/create` is public, so anyone can create a user for a Firebase uid they do not own.

Prompt 3 (2026-11-06 13:29 +08:00):

```text
the comments are not on the PR33 "Frontend order credit integration"
```

Key response 3:

> The earlier notes were on the template repo's PR 33. I removed them and left two comments on [Frontend order credit integration](https://github.com/AY2627S1-CS3219-P8/FoC/pull/33#pullrequestreview-5796183037):
>
> - The idempotency key lives only in memory, so a refresh after a timeout can post the same errand twice.
> - The balance reloads before Credit Service moves the credit, so the sidebar can still show the old amount.

</details>

#### 2026-11-08: Courier cancellation and order status history

- Learning support: how expiry works and whether couriers could cancel.
- Writing implementation code: courier cancellation (reopening the order) and an `order_status_history` table in `order-service/app/models.py`, `routes/orders.py`, `schemas.py`, `services/orders.py` and `order-service/alembic/versions/20261108_0003_order_status_history.py`, with a pytest suite (`order-service/tests/`, `pytest.ini`, `requirements-dev.txt`). The AI drafted the plan, and Ewen approved it.
- Refactoring and documentation improvements: `order-service/README.md`, `contracts/asyncapi.yaml` and `contracts/README.md`. It also updated `credit-service/tests/test_worker.py` and `demo-console/app/static/broker.js`.
- Outcome: Opened as [PR #37](https://github.com/AY2627S1-CS3219-P8/FoC/pull/37), now closed; the work is on Ewen's local branch, not on `main`.

<details>
<summary>Exact prompts and key responses (4)</summary>

Prompt 1 (2026-11-08 15:28 +08:00):

```text
are these
- how are orders considered expired and how does it work?
- what if couriers need to cancel their own orders?
- is order change state history added to db?
```

Key response 1:

> **Only `PENDING_CREDIT` and `OPEN` orders expire, one hour after creation.** A courier cannot cancel an order. State changes are written onto the order row and into `outbox_events`; there is no separate status-history table.
>
> On create, `expires_at` is set to now plus one hour (`ORDER_TTL` in `order-service/app/messaging.py`). `order-worker` sweeps every 10 seconds (`EXPIRY_SWEEP_SECONDS`) and calls `expire_overdue_orders`.

Prompt 2 (2026-11-08 15:29 +08:00):

```text
- add courier cancellation and make the db store state history too
```

Key response 2: not quoted, because the final message was progress narration. See the outcome above.

Prompt 3 (2026-11-08 15:31 +08:00):

```text
Courier cancellation and order status history

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.
```

Key response 3:

> The assigned courier can now cancel an accepted or picked-up order, and every status change is stored in `order_status_history`.
>
> **Courier cancellation.** `POST /orders/{id}/cancel` still cancels the order for the requester (before pickup) and for an admin (until the order is closed). When the assigned courier calls it, the order goes back to `OPEN`: the courier is unassigned, the accept and pickup timestamps are cleared, and `expires_at` starts over at one hour. The requester’s credit hold stays in place. [...]

Prompt 4 (2026-11-08 15:39 +08:00):

```text
push to new PR
```

Key response 4:

> The pull request is open at https://github.com/AY2627S1-CS3219-P8/FoC/pull/37.
>
> It targets `demo/live-order-kafka` and contains only the courier-cancellation and status-history commit. That base branch was not on the remote yet, so it was pushed as well; otherwise the pull request would have included the whole order and credit history.

</details>

#### 2026-11-09: PR #36 integration review

- Code review (outside the course categories): checked Notification Service PR #36 for integration issues. No file changed.
- Outcome: Review findings reported in chat.

<details>
<summary>Exact prompts and key responses (1)</summary>

Prompt 1 (2026-11-09 16:18 +08:00):

```text
review "Add Notification Service" PR 36. check if there are any serious integration issues.
```

Key response 1:

> I found no serious integration issues: [PR #36](https://github.com/AY2627S1-CS3219-P8/FoC/pull/36) should work against what is on `main` today. The real risks come from other open PRs that change the same contracts. The main one is that once [#37](https://github.com/AY2627S1-CS3219-P8/FoC/pull/37) merges, a requester whose courier drops out gets no notification.

</details>

#### 2026-11-10: D4 Order Service and Kubernetes slides in Canva, script and Q&A

- Refactoring and documentation improvements: 4 Order Service slides and 1 Kubernetes slide in the team's Canva deck, also exported to `order-service/docs/d4-order-service-slides.pptx`, built by `tmp/order-slides/` scripts.
- Design discussion: drafted the presentation script for slides 7 to 11 and likely Q&A answers, including design justifications such as why Kafka is used.
- Outcome: Slides saved in Canva; the `.pptx` and build scripts are local only.

<details>
<summary>Exact prompts and key responses (8)</summary>

Prompt 1 (2026-11-10 10:41 +08:00):

```text
https://canva.link/q04xyg29c258n1m

I need 4 slides on the order service. make the slides in the theme of the current slides
```

Key response 1:

> I made the 4 Order Service slides in your deck's theme and saved them as a PowerPoint file you can import into Canva: `order-service/docs/d4-order-service-slides.pptx`.
>
> I could only view your Canva link, not edit it, so I couldn't add the slides to the deck directly. I copied the theme from the view-only page: cream `#F4EDE2` background, navy `#303870` text, the rounded navy tab on the right, heavy uppercase headings and outlined pill shapes. Slides 2 and 3 follow the layouts of your "Idea Analysis" timeline and "Conceptual Framework" grid.

Prompt 2 (2026-11-10 10:54 +08:00):

```text
why cant u edit in canva directly?
```

Key response 2:

> Because I only had view access. When I opened your link, Canva showed "Viewing" with a "Sign up" button, which means the browser I control isn't signed in to any Canva account. An edit link only works for a signed-in account that the deck has been shared with as an editor, so I could look at the slides but not change them.

Prompt 3 (2026-11-10 11:03 +08:00):

```text
the canva mcp is added
```

Key response 3:

> The 4 Order Service slides are saved in your team's Canva deck as pages 13–16: Order Lifecycle, Errand Flow, Database & Patterns, and Events & Kafka. They're built from copies of your deck's own pages, so fonts and styling match exactly. Pages 1–12 are unchanged.

Prompt 4 (2026-11-10 11:14 +08:00):

```text
- make order lifecycle a flowchart
- make the 4 slides aesthetically easy to understnad and not ai-generated, add shapes and diagrams to enhance understandability
- add pictures from this repo if possible
```

Key response 4:

> I saved the redesigned slides to your Canva deck, on pages 2–5 where you'd moved them. Each one now uses a diagram instead of text blocks, drawn in the deck's cream and navy:
>
> - **Order Lifecycle:** now a flowchart. It shows the main path to completed, the loop back to open when a courier backs out, and what causes rejected, expired and cancelled, with a key for the box styles.
> - **Errand Flow:** uses the seeded Printer @ COM2 photo from `data/images`. Next to it is a 7-step sequence diagram of Alice getting her printouts delivered to PGP by Bob. [...]

Prompt 5 (2026-11-10 21:43 +08:00):

```text
add 1 slide on kubernetes
```

Key response 5:

> The Kubernetes slide is saved in the Canva deck as page 11, right after Events & Kafka. It uses the same theme and diagram style as the order service slides, and the deck now has 27 pages.

Prompt 6 (2026-11-10 21:56 +08:00):

```text
write the script for each slide 7-11. total time taken must be less than 6mins.
```

Key response 6:

> Here's a script for slides 7–11. It comes to about 720 words, which is roughly 5 minutes 10 seconds at a normal presenting pace of 140 words per minute. That leaves about 50 seconds of buffer under your 6-minute limit for clicking through and pausing.

Prompt 7 (2026-11-10 22:00 +08:00):

```text
write the most often asked QnAs
```

Key response 7:

> These are the questions you're most likely to get on slides 7–11. Each answer is short enough to say out loud in 15–30 seconds, and I checked them against the code in `order-service/app`.
>
> ---
>
> **Q: Why use Kafka between Order and Credit instead of calling Credit over HTTP?**
> > Loose coupling and availability. If Credit is slow or down, Alice can still post an errand. It just stays in Pending Credit until Credit catches up. With a synchronous call, a Credit outage would break order creation entirely.

Prompt 8 (2026-11-10 22:06 +08:00):

```text
for "Q: Who expires errands, and when?
The worker sweeps every loop and expires Open or Pending errands older than one hour (ORDER_TTL). It publishes order.expired, and Credit releases the hold."

what is the loop? 1 line
```

Key response 8:

> The worker repeats one loop forever: it polls Kafka for up to 0.5 seconds, relays the outbox to Kafka, and runs the expiry sweep, but only when 10 seconds have passed since the last sweep (`EXPIRY_SWEEP_SECONDS = 10` in `order-service/app/messaging.py`).

</details>

#### 2026-11-10: Logging pipeline slide in Canva

- Refactoring and documentation improvements: a logging pipeline diagram from Ewen's outline (`tmp/order-slides/diagrams/logging.py`), saved on the Canva deck's Logging slide.
- Outcome: Saved in Canva; script local only.

<details>
<summary>Exact prompts and key responses (3)</summary>

Prompt 1 (2026-11-10 22:04 +08:00):

```text
application code
    ↓
log_event(...)
    ↓
Python creates a LogRecord
    ↓
JSON formatter adds standard fields
    ↓
stdout
    ↓
Docker logs
    ↓
Vector collector
    ↓
Loki
    ↓
Grafana

generate a slide with these in the theme bubbles
```

Key response 1:

> I made the slide in the same cream-and-navy bubble style as your Order Service deck.
>
> ![Logging pipeline slide](/Users/a65945/FoC/tmp/order-slides/diagrams/logging_slide.png)
>
> The nine steps are numbered bubbles that snake across the slide. The first four (application code, `log_event(...)`, LogRecord, JSON formatter) sit inside a "Python service" panel. `stdout` and Grafana are filled navy: one marks where logs leave the app, the other where they end up. Docker logs, Vector and Loki sit in a dashed "observability stack" box.

Prompt 2 (2026-11-10 22:08 +08:00):

```text
is it in canva? put in canva if no
```

Key response 2:

> It wasn't in Canva before. The diagram is now placed as a draft on your existing "Logging" slide, which is page 6 of the team deck and was empty apart from its title. The preview above shows it sitting under the title, clear of the navy side tab.
>
> Nothing is saved yet. The open draft covers the whole deck, so saving would also commit any other edits made in this editing session. The only change I made is adding this one image.

Prompt 3 (2026-11-10 22:10 +08:00):

```text
save
```

Key response 3:

> The logging diagram is now saved on page 6, the "Logging" slide, of the team D4 deck in Canva. [Open the deck](https://www.canva.com/d/_h5ob6S2fVUP_iK) to see it.
>
> It's a single picture, so the text in it can't be edited in Canva. To change a label or caption, edit `tmp/order-slides/diagrams/logging.py`, re-run it, and swap in the new `logging.png`.

</details>

#### 2026-11-10: DLQ behaviour questions

- Learning support: how both DLQs work and what happens when services recover. No file changed.
- Outcome: Answers in chat only.

<details>
<summary>Exact prompts and key responses (2)</summary>

Prompt 1 (2026-11-10 22:34 +08:00):

```text
how does the DLQ work
```

Key response 1:

> There are two dead-letter queues (DLQs), one in each service. Each one catches messages its service couldn't process from the other service's topic. Both follow the same rule: **the consumer only commits a Kafka offset after the message has either been applied to the database or been confirmed written to the DLQ.** That way a failing message never blocks its partition, and it is never silently dropped.

Prompt 2 (2026-11-10 22:46 +08:00):

```text
once service is back up what happens?
```

Key response 2:

> The answer depends on which dependency was down. Nothing in the DLQs is ever replayed automatically. Recovery only happens for messages that were held back: parked in Postgres, or left uncommitted in Kafka.
>
> **Order Service catches up on its own.** Its worker never stopped. Each loop it kept trying two relays, both failing and logging `relay_failed`:
> - the outbox relay, which publishes order events;
> - `relay_parked_once`, which moves parked rows onto the DLQ.

</details>

#### 2026-11-10: Course AI declaration requirements

- Learning support: what the slides must contain under the course AI policy. Later prompts in this chat only maintained these disclosure records and are not listed, per the project's disclosure rule.
- Outcome: Answers in chat only.

<details>
<summary>Exact prompts and key responses (2)</summary>

Prompt 1 (2026-11-10 23:04 +08:00):

```text
what AI declaration must be in the slides?
```

Key response 1:

> I couldn't find any rule in the repo for what an AI declaration on slides has to contain. It most likely comes from your course or assignment brief, which isn't in the workspace.
>
> What I checked:
> - **The disclosure skill** (`.agents/skills/disclosure/SKILL.md`) only covers code-file header comments, the README "AI Use Summary" sections, and the `ai/usage-log.md` files. It says nothing about slides.
> - **The four slide decks** in `order-service/docs/` and `docs/`: none of them has an AI declaration yet. [...]

Prompt 2 (2026-11-10 23:05 +08:00):

```text
check this
```

Key response 2:

> The brief asks for two AI-related things in the slides: the signed declaration from Appendix 1 as the last slide, and a link to the README's AI disclosure. The prompts, logs and per-file attribution comments go in the repository, not on the slides.
>
> **1. The signed declaration (Appendix 1, page 14), as the last slide.** The brief says it "should be printed, completed, scanned, and attached to the slide deck submitted on Canvas as the last slide." The team signs these statements:

</details>
Supplier image setup, portable seed keys, local Nginx, and CloudFront build
configuration are documented in [data/images/README.md](data/images/README.md).
