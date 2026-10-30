<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-21.
Scope: Generated this usage record. Team review pending. -->

# AI usage log

## 2026-10-21 (Asia/Singapore): branch setup and local Order database

Tool: ChatGPT through Codex. Model identifier is not exposed in this session.
Modes: repository operations, configuration generation, documentation.

### Exact user prompts

> Set up order-core to have the same code as main by pulling etc and then lets start building. Ask me architecture etc questions if that is required by the guidelines

> Lets start by setting up the database. I think Postgres SQL works well, so similar database type as my teammate + ACID + concurrency control
> We will also work with docker containerisation so maybe set that up too

The author also supplied the CS3219 AI Usage Policy as a constraint in this chat.

### Key responses and output

- Preserved previous order-core commits on backup/order-core-before-main-20261021 and aligned order-core with origin/main at f2cedb3. Preserved leftover generated files in /private/tmp/foc-order-core-before-main-20261021/.
- Inspected User Service's PostgreSQL 16 Compose setup.
- Generated order-service/compose.yaml with PostgreSQL 16, local credentials, localhost port 5433, a persistent volume and a readiness check.
- Generated setup documentation and the final README disclosure section.
- Asked the author for the approved fields, types, statuses, relationships, constraints, database/migration library and concurrency strategy before implementing them.
- Explained that PostgreSQL transactions/concurrency primitives do not alone implement business-level concurrency rules.

### Locations

- order-service/compose.yaml
- order-service/README.md
- README.md
- order-service/usage-log.md

### Verification and author review

Verification: Compose configuration validation and git diff --check passed.
The new container reported healthy; SQL connected to order_service on PostgreSQL
16.15, and BEGIN / SELECT 1 / ROLLBACK completed successfully.
Application-level concurrency has not been implemented or tested. Human author review, understanding,
and validation remain pending; no human review is claimed by this log.

## 2026-10-21 (Asia/Singapore): Prisma setup

Tool: ChatGPT (Codex). Modes: dependency setup, transcription, documentation.

### Exact author schema input

```prisma
model Order {
  id                 String              @id @db.Uuid
  creation           OrderCreation       @relation(fields: [id], references: [orderId], onDelete: Restrict)
  requesterId        String
  courierId          String?
  supplierId         BigInt
  pickupStore        String
  pickupLocation     String
  requesterName      String
  courierName        String?
  destination        String
  requestDetails     String
  credits            Int
  expiryTime         DateTime            @db.Timestamptz(3)
  status             OrderStatus         @default(UNASSIGNED)
  cancellationReason CancellationReason?
  creditState        CreditState         @default(RESERVED)
  createdAt          DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime            @updatedAt @db.Timestamptz(3)
  acceptedAt         DateTime?           @db.Timestamptz(3)
  pickedUpAt         DateTime?           @db.Timestamptz(3)
  deliveredAt        DateTime?           @db.Timestamptz(3)
  cancelledAt        DateTime?           @db.Timestamptz(3)

  @@index([status, expiryTime])
  @@index([requesterId, createdAt])
  @@index([courierId, createdAt])
}
```

### Exact subsequent implementation prompts

> Conditional update should work well for now since its simple and also ensures that only one courier gets the accepted order

```text
enum OrderStatus {
  UNASSIGNED
  ASSIGNED
  PICKED_UP
  DELIVERED
  CANCELLED
}
Go ahead with Prisma
```

### Key responses and output

- Installed Prisma CLI and @prisma/client 6.19.3 in existing @foc/order-grpc workspace, matching User Service.
- Preserved supplied model and enum in order-service/prisma/schema.prisma.draft.
- Requested OrderCreation, CancellationReason and CreditState definitions; no missing schema definitions were invented. No migrations or Order client generated.
- Recorded the author's conditional-update choice; no acceptance handler implemented.
- Updated order-service/grpc/package.json, package-lock.json, schema draft and README documentation. JSON files cannot contain attribution comments; package metadata and this log record their attribution.
- npm install completed and reported three high-severity dependency findings. No automatic dependency fixes were applied.

Human author review remains pending.

## 2026-10-21: Complete author schema implementation

Tool: ChatGPT (Codex). Modes: transcription, migration generation, documentation.

Exact supplied enum definitions and model prompt are archived below; formatting of Order is unchanged from its earlier supplied text.

### Enum prompt

```prisma
enum CancellationReason {
  REQUESTER
  EXPIRY
}

enum CreditState {
  RESERVED
  SETTLEMENT_PENDING
  SETTLED
  REFUND_PENDING
  REFUNDED
}
enum CreationState {
  PENDING
  SUCCEEDED
  COMPENSATING
  FAILED
}

enum CreditOperationType {
  RESERVE
  SETTLE
  REFUND
}

enum OperationState {
  PENDING
  PROCESSING
  SUCCEEDED
  PERMANENTLY_FAILED
}
```

### Model prompt

```prisma
model OrderCreation {
  orderId            String            @id @default(uuid()) @db.Uuid
  requesterId        String
  idempotencyKey     String
  requestFingerprint String
  payload            Json
  state              CreationState     @default(PENDING)
  createdAt          DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime          @updatedAt @db.Timestamptz(3)
  order              Order?
  creditOperations   CreditOperation[]

  @@unique([requesterId, idempotencyKey])
}

model Order {
  id                 String              @id @db.Uuid
  creation           OrderCreation       @relation(fields: [id], references: [orderId], onDelete: Restrict)
  requesterId        String
  courierId          String?
  supplierId         BigInt
  pickupStore        String
  pickupLocation     String
  requesterName      String
  courierName        String?
  destination        String
  requestDetails     String
  credits            Int
  expiryTime         DateTime            @db.Timestamptz(3)
  status             OrderStatus         @default(UNASSIGNED)
  cancellationReason CancellationReason?
  creditState        CreditState         @default(RESERVED)
  createdAt          DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime            @updatedAt @db.Timestamptz(3)
  acceptedAt         DateTime?           @db.Timestamptz(3)
  pickedUpAt         DateTime?           @db.Timestamptz(3)
  deliveredAt        DateTime?           @db.Timestamptz(3)
  cancelledAt        DateTime?           @db.Timestamptz(3)

  @@index([status, expiryTime])
  @@index([requesterId, createdAt])
  @@index([courierId, createdAt])
}

// Durable intents only in Phase 1; execution/recovery arrives in Phases 3–4.
model CreditOperation {
  id             String              @id @default(uuid()) @db.Uuid
  orderId        String              @db.Uuid
  creation       OrderCreation       @relation(fields: [orderId], references: [orderId], onDelete: Restrict)
  type           CreditOperationType
  payload        Json
  state          OperationState      @default(PENDING)
  attempts       Int                 @default(0)
  nextRetryAt    DateTime            @default(now()) @db.Timestamptz(3)
  leaseExpiresAt DateTime?           @db.Timestamptz(3)
  lastError      String?
  createdAt      DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime            @updatedAt @db.Timestamptz(3)

  @@unique([orderId, type])
  @@index([state, nextRetryAt])
}
```

### Key response and implementation

Complete schema supplied by author. Transcribed definitions without adding business constraints. Added Prisma scripts and service-specific client output, generated initial migration and client, and applied to the verified empty local Order Docker database. Added migration attribution; replayed initial migration on that newly created empty database to keep its recorded checksum consistent. No order business handlers or credit execution/recovery were implemented.

Affected files: .gitignore, order-service/grpc/package.json, order-service/prisma/schema.prisma, order-service/prisma/migrations/*, Order README and root README, and this log. Earlier entries are consolidated in this service-local log. Human author review remains pending.

Verification: prisma validate passed; migration applied and Prisma client generated. prisma migrate status reports up to date. SQL inspection confirmed all three tables and restrictive foreign keys; OrderCreation and CreditOperation inserts succeeded inside a rolled-back transaction. Generated migration includes author-specified unique indexes. git diff --check passed. Application concurrency remains unimplemented and untested.

## 2026-10-21: Order setup issue

Tool: ChatGPT (Codex). Mode: dependency installation and convention inspection.

### Exact user prompt

```text
Lets continue working on anything else missing in this Issue
### Description
Set up the Order Service project structure and development environment, following the existing microservice conventions used by the team.

### Tasks
- [ ] Initialize the Order Service with the team's existing backend framework and dependencies.
- [ ] Set up the project folder structure, following existing service conventions.
- [ ] Configure environment variables and application settings.
- [ ] Set up the database connection configuration for PostgreSQL.
- [ ] Configure the Order Service to run within the existing Docker environment.
- [ ] Implement a basic health check endpoint.
- [ ] Document setup and startup instructions in the README.

### Acceptance Criteria
- [ ] Order Service starts successfully without errors.
- [ ] Health check endpoint returns a successful response.
- [ ] Environment variables are loaded correctly.
- [ ] Service runs successfully within the existing Docker setup.
- [ ] Setup instructions are documented.
```

### Key response and output

Inspected User Service's Express/TypeScript, dotenv/Zod, Prisma, folder structure,
PostgreSQL-backed GET /health, and combined REST/gRPC startup conventions.
Installed Express 5.2.1 and @types/express 5.0.0 matching User Service in the
existing Order workspace (package.json and root package-lock.json affected).
Requested team confirmation of Order transport/folder conventions and whether
the existing workspace should move before implementing those structural changes,
as the supplied course policy reserves component boundaries/interfaces for the team.
Installation succeeded; human author review remains pending.

## 2026-10-21: approved application scaffold implementation

Exact user reply to the structure/health confirmation question: `Yes.`

Interpretation stated before work: use Express plus gRPC, src/api and src/grpc,
root env/db, database-backed health matching User Service; preserve the existing
workspace location at order-service/grpc. No workspace relocation performed.

Key response: “I’ll use the confirmed Express + gRPC structure and database-backed
`/health` endpoint. I’ll keep the workspace at `order-service/grpc` for this issue
and proceed with startup, environment configuration, Docker integration, and verification.”

Tool: ChatGPT (Codex). Modes: implementation/configuration/documentation generation.
Implemented PostgreSQL connection/probe, dotenv/Zod configuration, HTTP health,
combined startup/shutdown, Prisma build scripts, Dockerfile/context filter and
Compose app service. Updated .env.example and README instructions. Affected files
are order-service/grpc/src/{index.ts,env.ts,db.ts,api/app.ts}, grpc/package.json,
grpc/.env.example, order-service/{Dockerfile,Dockerfile.dockerignore,compose.yaml,
README.md}, root README and this log. Human author review remains pending.

Verification completed: shared gRPC and Order TypeScript builds passed; Compose
configuration validation passed; Docker build/startup/migration completed and both
containers healthy. HTTP health returned exact User Service-style JSON with 200
when PostgreSQL was available and 503 when stopped; restored database and app
health afterward. Temporary dotenv file loaded configured ports and DATABASE_URL;
invalid PORT=0, GRPC_PORT=65536 and HTTPS DATABASE_URL were rejected. Compiled host
startup on PORT=3013/GRPC_PORT=50063 returned health 200 and exited cleanly on
SIGTERM. git diff --check passed. No order business logic was implemented.

## 2026-10-21: Consolidate Order AI usage records

Tool: ChatGPT (Codex). Mode: documentation refactoring.

Exact user prompt:

> Combine the AI log into within order-service AI log as I prefer most files commited from order service to be within order service

Key response: Consolidated all entries in order-service/usage-log.md, removed the
duplicate root ai/usage-log.md, and updated README, file attribution and package
metadata references. Retained the historical log path inside the already-applied
initial migration's comment to preserve its checksum; its records now live here.
Human author review remains pending.

## 2026-10-21: minimize and verify shared lockfile

Tool: ChatGPT (Codex). Modes: debugging, dependency configuration and verification.

Exact user prompt: “Could you do that please?” This authorizes the preceding
proposal to preserve Credit's declared dependencies, minimize unrelated dependency
changes, and verify a clean install and affected services before merging.

Key exchanges: Explained that npm had regenerated the shared root lockfile while
adding Order dependencies, that active Credit dependencies remained under
credit-service/grpc, and that other branches remain unchanged until integration.
Confirmed original main lockfile is malformed: amqplib's engines/package objects
were missing their closing braces. Fetched origin/main; it remains f2cedb3.

Generated candidate in an isolated /private/tmp checkout from main's lockfile
with that syntax repair, using npm install --package-lock-only --ignore-scripts.
Adopted the candidate only after a clean npm ci passed. Every original package
entry and version is preserved, including Credit entries. Non-Order workspace
dependency ranges remain unchanged. Root lockfile diff reduced from 1767 added /
989 removed lines to 1388 added / 35 removed lines. Remaining edits include Order's
new dependency records, syntax repair and npm workspace/metadata normalization.
No Credit/Supplier manifests or source files were changed.

Verification:
- Clean root npm ci passed in isolated checkout.
- Installed User's own npm lock and Supplier's frozen Yarn lock in that checkout;
  generated User Prisma client and temporary keys only there.
- All five root workspace builds passed: shared grpc, Order, Credit, Supplier grpc,
  and shared messaging.
- Credit gRPC smoke check passed on ephemeral loopback port with expected
  UNIMPLEMENTED response from the existing scaffold.
- Root npm test remains blocked: shared/grpc/test/transport.test.cjs imports
  supplier-service/grpc/dist/grpc/server.js, but unchanged Supplier config emits
  grpc/dist/grpc/src/grpc/server.js. The test and Supplier configuration are
  unchanged. No all-tests-passing claim is made.
- Docker image rebuilt with minimized lockfile; Compose startup completed healthy, and HTTP /health returned 200 with {"status":"ok","db":"up"}.

Author review remains pending. Changes affect package-lock.json and this log;
originally staged content is preserved in the index until the author stages
these newer working-tree changes.

## 2026-10-22: Create/edit/cancel/expiry lifecycle implementation

Tool: ChatGPT through Codex; exact model identifier not exposed. Modes: implementation,
debugging, tests and documentation. Human author review remains pending.

### Prompts and key exchanges

- [Author lifecycle decisions](ai-prompts/lifecycle-decisions.md) archives user prompts,
  the final first-lock-wins approval, edit-operation schema and latest idempotency rule.
- [Pasted creation API contract](ai-prompts/creation-api-contract.md) archives the attached
  text used for the route/body/response implementation.
- Assistant checked this branch and corrected the assumption that a settlement/refund
  worker already existed: only persistence fields were present.
- Assistant asked for the durable edit representation and concurrent duplicate rule.
  Author supplied OrderEditOperation and explicitly removed five-minute content detection.
- Key implementation update: “I’ll follow your latest duplicate rule: the same key resumes
  the original creation, and a different key starts a separate request even if the body
  matches. I’ll also add the approved OrderEditOperation table so credit-changing edits
  retain their proposed changes and expected Credit version across restarts.”

### Locations and scope

Order grpc package/scripts, JWT authentication, API DTOs/controllers/routes/app,
User/Supplier adapters, local agreed Credit protobuf and client, creation/edit/lifecycle
services, worker startup/configuration, unit/gRPC/HTTP/PostgreSQL tests, Prisma schema
and new edit-operation migration, .env.example, opt-in compose.lifecycle.yaml,
Order README, root README disclosure, shared root package-lock.json, and these records.
The existing applied migration was not changed. Root package-lock additions preserve
all prior package versions; no teammate manifests, source or shared wire contracts changed.

Credit protobuf copied from origin/feat/credit-implementation; original attribution
comments retained. The source commit is recorded below. Generated code was reviewed
by the assistant, compiled and exercised in tests; no human review is claimed.

### Implemented behavior

POST /orders, PATCH /orders/:id, POST /orders/:id/cancel; USER JWT/ownership enforcement;
nonblank text, positive whole int32 credits, offset-bearing expiry at least one hour
at initial validation, current supplier-open checks; stable-key creation replay/conflict;
credit reservation reconciliation before publication; durable credit edits using
UpdateReservation/expectedVersion; history-preserving cancellation; expiry through pickup;
automatic durable recovery and compensation, initial attempt plus five bounded retries.
Unresolved states stay recorded for reconciliation and are not reported as paid/refunded.

### Verification and limits

Final checks: TypeScript/Prisma build passed; 8 unit/authentication/gRPC tests and
23 dedicated PostgreSQL/HTTP/gRPC lifecycle tests passed (31 total). Docker image
built, both containers healthy, /health returned 200, and Prisma reported both
migrations applied. Opt-in Compose configuration validated. All existing root
lockfile package keys and versions were preserved; git diff --check passed.
The disposable lifecycle test container was removed after verification; the normal
Order stack remains running. Test doubles exist only in tests.
Supplier GetSupplier and the checkout's old Credit RPC handlers remain stubs; the
suite does not certify a full deployed peer-service flow. Acceptance/pickup/delivery,
listing/history UI and operator reconciliation endpoints are not implemented here.

Credit contract source commit: 15bb4cde30de15822d2f4be3a06c85fc5f36edb5

## 2026-10-22: administrator all-orders endpoint

Tool: ChatGPT (Codex). Modes: implementation, tests and documentation.

Exact user prompts:

> Could you set up an endpoint with authorisation for administrators for the admin dashboard to view all orders? (Includes expired and completed orders too but can be filtered out if admin chooses in the view)

> GET /orders

> I think just supply information for now. I will work with the admin dashboard person to see if they will do the rest from their end

Key response: “I’ll add administrator-only GET /orders, returning all orders in
{ "orders": [...] } with the existing public order fields. I’ll leave filtering
and pagination to the dashboard for now.”

Implemented an ADMINISTRATOR role guard and GET route before the USER-only write
guard; added a read service with explicit public-field selection, controller JSON
mapping, and newest-first deterministic ordering. Includes every persisted status,
including DELIVERED and CANCELLED/EXPIRY. No pending internal creation records or
recovery payloads are returned. No schema or dependency changes.

Affected files: grpc/src/auth/authenticate.ts, grpc/src/api/routes/orderRoutes.ts,
grpc/src/api/controllers/orderController.ts, grpc/src/services/orderQueries.ts,
grpc/tests/lifecycle.integration.cjs, Order README, root README disclosure and this log.
Human author review remains pending. Verification: TypeScript/Prisma build passed;
all 24 dedicated PostgreSQL/HTTP/gRPC integration tests passed, including the new
administrator endpoint test. Verified ADMINISTRATOR and mixed-role access, USER
denial, missing-token denial, all persisted statuses, internal-field exclusion,
and unchanged USER-only write authorization. Docker rebuilt and both containers
are healthy; git diff --check passed. Disposable admin test container removed.

## 2026-10-22: ignore Prisma artifacts left after branch switch

Tool: ChatGPT (Codex). Mode: configuration fix/explanation.
Exact user prompt: “Do these need to be commited too or is something up”
The screenshot showed untracked order-service/src/generated/prisma output.
Confirmed current branch is order-functionality and its ignore rule covered only
grpc/src/generated/prisma. Added the other branch's generated output directory
to root .gitignore; no generated files were deleted or staged. Schema sources
and migrations remain tracked. Human review pending.

## 2026-10-22: previous-issue audit and cancellation/expiry verification

Tool: ChatGPT (Codex). Modes: review/debugging, implementation, tests and documentation.
Human author review remains pending.

### Exact user prompt

```text
Has the previous issues been completed? Do a check and if yes, lets work on this next
### Description
Implement cancellation and expiry functionality for errands according to the agreed Order Service lifecycle.

### Tasks
- [ ] Implement the Cancel Errand API endpoint.
- [ ] Allow requesters to cancel their own unassigned errands.
- [ ] Prevent unauthorised cancellation.
- [ ] Handle errands that have passed their expiry time.
- [ ] Update the order status according to the agreed cancellation and expiry rules.
- [ ] Integrate with Credit Service to release reserved credits for cancelled or expired errands.
- [ ] Handle unsuccessful credit-release operations.
- [ ] Add tests for cancellation and expiry scenarios.

### Acceptance Criteria
- [ ] Requesters can cancel eligible errands.
- [ ] Assigned errands cannot be manually cancelled by requesters under the current requirements.
- [ ] Expired errands are handled according to the agreed lifecycle.
- [ ] Reserved credits are released correctly.
- [ ] Invalid or unauthorised cancellation requests are rejected.
- [ ] Tests cover successful and unsuccessful operations.
```

### Key findings and changes

Confirmed current branch is order-functionality, with prior creation/edit/admin
and cancellation/expiry code present. Preserved earlier .gitignore/log edits.
The previously author-approved plaintext Credit change existed only on
feature/order-create; removed the remaining CA setting, createSsl choice and CA
file read from this branch too. Preserved readFileSync for User's public key;
service-token authentication unchanged. Updated .env.example and README.

Cancellation already commits CANCELLED/REQUESTER and REFUND_PENDING before the
Credit call. Fixed the immediate path to retain that durable pending response
when refund processing/receipt persistence fails, instead of returning HTTP 500.
Added tests for cancellation authorization/input/state errors, concurrent replay,
pre-commit release failure, explicit rejection, historical/wrong-owner receipts,
refund retry exhaustion, failed receipt persistence/crashed lease, and autonomous
expiry. Extended the real gRPC adapter integration test through cancellation and
confirmed release. No schema, dependency, or new API design changes.

Affected files: grpc/src/services/orderLifecycle.ts, grpc/src/dependencies/creditClient.ts,
grpc/src/env.ts, grpc/src/index.ts, grpc/.env.example, grpc/tests/credit.test.cjs,
grpc/tests/lifecycle.integration.cjs, Order README, root README and this log.

Verification: shared gRPC/Order builds passed; all 9 unit/authentication/gRPC tests
and 32 dedicated PostgreSQL/HTTP/gRPC integration tests passed (41 total).
Creation/edit/admin regression cases passed. Tests use an isolated database named
order_service_test_cancellation and test-only peer services. No deployed peer-service
end-to-end success is claimed. Remaining courier acceptance/pickup/delivery and
student-list/detail gaps identified earlier are outside this issue.

Docker rebuild/startup passed; both normal containers healthy and /health returned
200 with PostgreSQL up. Disposable cancellation test container removed after
verification. No database schema or lockfile changes; git diff --check passed.

## 2026-10-22: manual integration walkthrough

Tool: ChatGPT (Codex). Mode: documentation generation from inspected code/contracts.
Exact user prompt: “Write me up some manual testing steps like how to use with user, supplier and credit to create an order etc”

Inspected User registration/login, Supplier routes/stub/conflict markers, Credit
feature-branch Compose/environment/migration instructions and REST endpoints, and
Order runtime override. Generated MANUAL_TESTING.md with readiness checks, separate
working peer checkout setup, non-conflicting database ports, registration/login,
credit-account prerequisites, supplier checks, creation, replay, edit, cancellation,
admin view, recovery and expiry. Explicitly states current checkout cannot complete
live creation without implemented peer services/user.created initialization.
No live service setup or account/order mutation was performed for this documentation.
Added README link; human author review pending.

Documentation validation: all 20 shell command blocks passed bash -n syntax
checks; git diff --check passed. Commands were not executed against live peers.

## 2026-10-22: courier acceptance

Tool: ChatGPT (Codex). Modes: implementation, unit/concurrency/HTTP testing, documentation.
Human author review remains pending.

### Exact user prompt

```text
Lets work on this issue now
### Description
Implement errand acceptance according to the agreed Order Service lifecycle, ensuring that an unassigned errand can only be accepted by one eligible courier.

### Tasks
- [ ] Implement the Accept Errand API endpoint.
- [ ] Verify that the user is authenticated and eligible to accept the errand.
- [ ] Prevent requesters from accepting their own errands.
- [ ] Verify that the errand is currently `Unassigned`.
- [ ] Ensure concurrent acceptance attempts cannot assign multiple couriers.
- [ ] Persist the assigned courier and update the order status to `Assigned`.
- [ ] Handle unsuccessful acceptance attempts.
- [ ] Add unit and concurrency tests.

### Acceptance Criteria
- [ ] Eligible couriers can accept available errands.
- [ ] Requesters cannot accept their own errands.
- [ ] Already assigned errands cannot be accepted again.
- [ ] Only one courier can successfully accept an errand, including during concurrent requests.
- [ ] Successful acceptance persists the correct courier and status.
```

### Key response and output

Found the checkout on supplier-containerisation with only leftover ignored
Prisma artifacts. Switched the otherwise clean checkout back to order-functionality;
Supplier source was unchanged. Used the author's previously confirmed first-lock-wins
rule and existing /orders/:id/action convention. Implemented POST /orders/:id/accept
with USER JWT identity, self-acceptance rejection, current state/credit/expiry and
active-edit checks under the Order row lock. Persists courier ID, ASSIGNED and
acceptedAt in one transaction. No additional Credit call; courierName remains null.
Existing creation/edit/refund/expiry behavior retained.

Affected files: grpc/src/services/orderAcceptance.ts, grpc/src/api/app.ts,
grpc/src/api/controllers/orderController.ts, grpc/src/api/routes/orderRoutes.ts,
grpc/tests/acceptance.test.cjs, grpc/tests/lifecycle.integration.cjs,
Order README, MANUAL_TESTING.md, root README and this log.
No schema, dependency, shared contract or teammate-source changes.

Verification: shared gRPC/Order builds passed; all 13 unit/authentication/gRPC tests
and 38 dedicated PostgreSQL/HTTP/gRPC tests passed (51 total). Twelve simultaneous
couriers produced one successful command and one persisted courier. Tested
cancellation races, pending edits, expiry after lock wait, replay rejection,
role/ownership/UUID/body failures and JWT-derived assignment without Credit
configuration. Manual guide updated; live peer setup was not executed.

Docker build/startup passed and both normal containers report healthy. Removed
only the disposable acceptance test database. Manual shell snippets passed bash -n;
git diff --check passed. Changes remain uncommitted on order-functionality.


## 2026-10-22 — Relationship-based retrieval

Tool: ChatGPT (Codex). Modes: generate implementation, tests and documentation.
Human review remains pending.

Exact implementation request: "Lets complete this issue."

Exact user contract reply:
```text
for available errands: GET /orders?scope=open
for errands the user created GET /orders?scope=requested
errands assigned to user: GET /orders?scope=assigned

all return 200 OK with structure including order id, status, destination and credits
```

Key response/implementation: retained the public `{ "orders": [...] }` format,
newest-first ordering and unpaginated response. Scoped listings require USER and
use verified JWT subject. Open excludes own, non-UNASSIGNED and overdue orders.
Requested/assigned retain history; this history behavior was stated as an
implementation assumption rather than an explicit answer in the contract reply.
Unscoped GET remains ADMINISTRATOR-only. Invalid/empty/repeated scopes and unknown
query parameters return 400. Empty results return 200 with an empty array.
No schema or inter-service contract changes.

Affected files: grpc/src/services/orderQueries.ts,
grpc/src/api/controllers/orderController.ts, grpc/src/api/routes/orderRoutes.ts,
grpc/tests/lifecycle.integration.cjs, README.md, MANUAL_TESTING.md, this usage log,
and root README.md. Author review and final validation pending.

Verification: shared/Order builds passed; 13 unit/auth/gRPC tests and 39 real
PostgreSQL/HTTP integration tests passed (52 total). Retrieval coverage includes
open ownership/status/expiry filters, requester/courier history, empty results,
JWT identity, role separation and invalid/injected query fields. Used a dedicated
order_service_test_retrieval database; normal development data was not changed.

## 2026-10-22 — Credit lifecycle integration verification (in progress)

Tool: ChatGPT (Codex). Mode: inspect, generate integration tests and documentation.
Human review pending.

Exact user request:
```text
Lets work on this now
### Description
Implement the agreed gRPC communication between Order Service and Credit Service to support credit operations throughout the errand lifecycle.

### Tasks
- [ ] Configure the gRPC client using the team's agreed Credit Service interface.
- [ ] Integrate credit verification and reservation during errand creation.
- [ ] Integrate credit transfer upon successful errand completion.
- [ ] Integrate credit release when eligible errands are cancelled or expire.
- [ ] Handle Credit Service errors and unavailable-service scenarios.
- [ ] Verify that unsuccessful credit operations do not incorrectly complete the corresponding order workflow.
- [ ] Add integration tests for credit operations.

### Acceptance Criteria
- [ ] Order Service communicates successfully with Credit Service.
- [ ] Credits are reserved during successful errand creation.
- [ ] Reserved credits are transferred upon successful completion.
- [ ] Reserved credits are released for eligible cancelled or expired errands.
- [ ] Integration failures are handled without silently reporting incorrect results.
- [ ] Integration tests cover successful and failed operations.
```

Key response: the plaintext/token client and creation/release integration exist;
SettleCredits is exposed by the adapter but not called by an order completion
workflow. Asked the human for the completion route, caller, allowed source state
and pending-settlement lifecycle; these decisions remain pending.

Added test-only real gRPC transport wrapping the simulated ledger in
`grpc/tests/lifecycle.integration.cjs` alongside real Order PostgreSQL. Tests
exercise reservation, same-key replay, cancellation/expiry release, business
rejection, uncertain reservation, release recovery and token rejection. These
are contract/transport tests, not deployed Credit Service certification.
Compared local proto with local feat/credit-implementation: identical except
Order attribution comments. Restoring locked npm dependencies was necessary
because the Prisma executable was missing. Verification results follow below.


Exact user completion decision:
```text
POST /orders/:id/deliver
Only the assigned courier can mark it
PICKED_UP before delivery
DELIVERED for now
```

Key implementation response: delivery is recorded as DELIVERED with
SETTLEMENT_PENDING and returns 202 until matching current Credit settlement is
confirmed, then 200. Added a durable SETTLE operation using the existing schema,
lease and bounded retry policy; the existing worker now recovers settlements.
Only the assigned USER courier can deliver an unexpired PICKED_UP order with a
reserved hold. Replays do not transfer twice. Explicit business failures and
retry exhaustion preserve unresolved financial state. Stale or mismatching
receipts never mark settlement confirmed. No pickup endpoint was introduced.

Additional affected files: grpc/src/services/orderLifecycle.ts,
grpc/src/api/controllers/orderController.ts, grpc/src/api/routes/orderRoutes.ts,
README.md, MANUAL_TESTING.md and root README.md. Existing source attribution
headers apply to these AI-assisted implementation changes; human review pending.

Verification: locked npm ci completed; shared/Order build passed. 13 unit tests
and 48 PostgreSQL integration tests pass (61 total). Initial test expectations
were corrected: an invalid service credential after durable recording returns
202 rather than 503, with no published order. Tests exercise real plaintext gRPC
with test-only ledger handlers; no live deployed Credit end-to-end claim.
Settlement coverage includes before/after-commit failure, background recovery,
concurrent delivery, same-courier replay, role/ownership/state/expiry validation,
wrong/stale receipts, permanent failure/exhaustion and database receipt-write
failure followed by expired-lease recovery. No dependency lockfile changes.

Docker rebuild/startup succeeded with the existing alternate host ports
(PostgreSQL 55441, HTTP 33003, gRPC 55053); both containers healthy and /health
returned 200 with {"status":"ok","db":"up"}. Removed the disposable Credit test
container and volume. Documentation shell snippets and git diff --check passed.
Changes remain uncommitted on order-functionality.


## 2026-10-22 — Order editing issue verification

Tool: ChatGPT (Codex). Modes: inspect, generate tests/documentation.
Human review remains pending.

Exact user request:
```text
Work on this issue next
## [Order Service] Implement Order Editing with Credit Service Integration

### Description
Implement order editing functionality to allow requesters to modify their errands before they are accepted by a courier.

Order Service must communicate with Credit Service via gRPC when an edit changes the number of credits offered. Credit reservations must be adjusted safely, ensuring consistency between the order details and reserved credits.

### Tasks
- [ ] Implement `PATCH /orders/:id` to allow requesters to edit their orders.
- [ ] Restrict editing to the original requester while the order is `UNASSIGNED`.
- [ ] Validate updated order details, including supplier, destination, request details, credits, and expiry time.
- [ ] Integrate Credit Service's `UpdateReservation` gRPC method to adjust reserved credits when the credit amount changes.
- [ ] Verify sufficient available credits before approving an increase in the offered credits.
- [ ] Release excess reserved credits when the offered credit amount decreases.
- [ ] Ensure credit adjustments are atomic and idempotent to prevent duplicate deductions or releases.
- [ ] Prevent conflicting acceptance and editing operations using database concurrency control.
- [ ] Persist pending credit-edit operations to support recovery after failures or crashes.
- [ ] Handle Credit Service errors, timeouts, and unavailable-service scenarios.
- [ ] Implement retry and reconciliation mechanisms for uncertain credit adjustment outcomes.
- [ ] Add integration tests for successful edits, insufficient credits, concurrent requests, and Credit Service failures.

### Acceptance Criteria
- [ ] Requesters can edit their own `UNASSIGNED` orders through `PATCH /orders/:id`.
- [ ] Orders that have already been accepted, delivered, or cancelled cannot be edited.
- [ ] Edits that do not change credits do not trigger unnecessary credit adjustments.
- [ ] Increasing credits successfully adjusts the existing reservation when sufficient credits are available.
- [ ] Decreasing credits releases the excess reserved amount.
- [ ] Failed credit adjustments do not incorrectly update the order's credit amount.
- [ ] Concurrent editing and acceptance requests cannot produce inconsistent order or credit states.
- [ ] Pending or uncertain credit operations can be safely recovered without duplicate adjustments.
- [ ] Successful edits return the updated order using `{ "order": {...} }`.
- [ ] Integration tests cover successful, failed, and concurrent editing scenarios.

### Dependencies
- Credit Service must support the agreed `UpdateReservation` gRPC contract.
- Credit Service must provide atomic, idempotent reservation updates and sufficient information for reconciliation.
- Order Service must support durable tracking and recovery of pending credit-edit operations.
```

Key response: existing production editing already provides the required endpoint,
validation, row locking, durable intent and version reconciliation. Added missing
real gRPC transport coverage rather than rewriting the working implementation.
The test ledger now simulates insufficient available funds and pre-commit update
unavailability; Credit remains responsible for atomic balance enforcement.

Affected files: grpc/tests/lifecycle.integration.cjs, README.md,
MANUAL_TESTING.md, this usage log and root README.md. No production code, schema,
contracts or dependency changes. Author review remains pending.

Verification: all 55 PostgreSQL integration tests passed, including added tests
for increases consuming all available funds, insufficient credits, decreases,
unchanged credits without mutation, same-key parallel requests, first-lock-wins
acceptance races, unavailable preflight, terminal states, short expiry, invalid
supplier, before/after-commit recovery and receipt-write crash recovery. Tests
use production gRPC client plus test-only Credit handlers and a dedicated Order
database; no deployed Credit end-to-end certification is claimed.

Final verification: all 13 unit/auth/gRPC tests also passed (68 total).
Documentation shell syntax and git diff --check passed. Removed the disposable
edit test database container/volume; normal Docker service/data unchanged.
Changes remain uncommitted on order-functionality.

## 2026-10-24 Asia/Singapore — Order-only port from d3-demo
Tool: ChatGPT (Codex), mode: implementation port, debugging, tests/documentation.
Human review pending. Exact scope steering:
```text
Credit would have their own PR and merge. So just include the ones that would come under what is required from me
```
Exact task:
```text
Ok, I switched branch. Could you implement what is needed please. You can do one by one or all at once
```
Confirmed order-functionality, initially clean tracked tree; untracked postman 2
left intact. Ported only Order grpc source/tests from d3-demo: shared Credit
client/options, response validation and ACCOUNT_NOT_FOUND recovery, Supplier
shared validation/ID adapter/description placeholder and pickup route/controller/
row-locked service. Removed duplicate Order Credit protobuf/private transport.
No Order Prisma schema/migration differences. No teammate tracked implementation,
shared package, root package or lock changes. Did not port demo assets.
Updated Order Dockerfile and strict allowlist to accept peer manifest paths
before/after relocations using directory COPY filtered to package metadata.
Documented dependencies in INTEGRATION_NOTES.md and updated Order README/root
AI summary. Attribution headers preserved/added for transferred files.
Current branch's shared contracts lack GetReservation, UpdateReservation and
Supplier validation exports. A normal build was attempted and fails on these
missing agreed dependencies. Did not silently add teammate implementations.
Created isolated temporary git-archive of d3-demo shared grpc/User proto and
compiled it. Used an ignored Order-local node_modules link only for validation.
Order build, 16 units, 61 PostgreSQL integrations passed using those agreed
contracts. Disposable DB order_service_test_port on 55450. Docker check and
cleanup results follow. No live service/container deployment is claimed.

Final validation/cleanup: build and unit tests 16/16, PostgreSQL integrations
61/61 passed using agreed isolated contracts. Docker builds passed in TWO
isolated contexts: this branch's workspace layout and d3-demo's relocated peer
package layout, both using current Order files and agreed shared contracts.
No teammate tracked files changed in either validation. Removed temporary
Order-local dependency symlink and disposable PostgreSQL container. Ordinary
branch build still awaits teammate shared-contract PRs; no permanent override
left behind. git diff --check passed. No runtime app restarted, branch switched,
commit created, or changes pushed. Existing untracked postman 2 left untouched.

## 2026-10-25 Asia/Singapore — Merge main and prepare Order PR
Tool: ChatGPT (Codex), mode: merge/debugging, verification, PR documentation.
Human review pending. Exact prompt:
```text
Can we pull main and settle any merge conflicts before we PR? Anything else missing from the PR? Also give me a markdown for my PR of what has been implemented in order-functionality that main does not, and tests to check that everything is working well so the reviewer can check
```
Fetched origin/main at 2c8a068. Order-only port was still uncommitted; recording
it first to preserve work before the authorized merge. Existing untracked
postman 2 stays excluded. Latest main still lacks agreed Credit GetReservation/
UpdateReservation and shared Supplier schemas. These remain explicit dependent
PRs rather than silently importing teammate implementations. Actual merge,
conflicts, checks and reviewer instructions follow below.

Merge result: only conflict package-lock.json. Seeded main's lock and regenerated
against merged manifests; net diff from main is seven added Order dependency
entries. Clean npm ci --ignore-scripts passed. Included main's .npmrc in Order
Dockerfile/allowlist because main's Supplier dependency resolver requires it.
Normal shared build passed; normal Order build blocked by missing shared Credit
methods and Supplier exports, confirmed with compiler output. With temporary
agreed contract package: Order build, 16/16 units, 61/61 PostgreSQL integrations
passed after merge. Removed ignored dependency override afterwards.
Created PR_DESCRIPTION.md covering final diff to main, explicit blockers,
automated isolated-DB commands and live API/credit reviewer checks. No fake
claim of green standalone branch build or deployed cross-service verification.
Existing demo folders not included. Docker check and merge commit follow.

Final checks: clean npm install lock validation passed; normal shared build
passed, ordinary Order build remains blocked by dependency exports. With agreed
isolated contracts, build + 16 units + 61 PostgreSQL integrations passed, and
Order Docker image built using merged main workspace and .npmrc. Temporary
Order dependency override and disposable test database removed. Current diff
to origin/main has no Credit/User/Supplier/shared implementation changes.
`git diff origin/main --check` passed. Cached merge-parent whitespace check
reports only unchanged whitespace inherited from main; no unrelated cleanup.
Staged resolved lock and PR documentation. Authorized merge commit follows;
untracked postman 2 excluded. No GitHub PR created and no push performed.

## 2026-10-25 Asia/Singapore — Complete tracked shared integration prerequisites
Tool: ChatGPT (Codex), mode: contract integration, build/test fixes, documentation.
Human review pending. Exact task:
```text
Complete the portions that are missing before merge
```
Asked: "The shared Supplier schemas need Zod declared in the existing shared/grpc/package.json. May I record that JSON file’s AI attribution in shared/grpc/README.md and order-service/usage-log.md? Your repository policy requires an approved attribution method because JSON cannot contain comments."
Exact human approval:
```text
Yes, use README and usage log attribution
```
Fetched origin/feat/credit-implementation and origin/order-supplier-gRPC. Imported
only agreed shared Credit protobuf/client/generated types and contract/retry
tests from Credit commit 006d5a7; imported Supplier validator/ID helper exports
from Supplier branch. Added explicit Zod shared dependency, regenerated lock.
JSON attribution is recorded in shared README and this log as approved. Source
provenance/comments preserved and added current integration headers.
Extended existing Credit scaffold with UNIMPLEMENTED GetReservation and
UpdateReservation entries to remain type-compatible; no Credit business logic
or database implementation imported. Updated shared smoke test: implemented
User validates empty ID; all six Credit scaffold calls remain UNIMPLEMENTED.
Order private transport remains removed; no dependency overrides needed.
Updated PR_DESCRIPTION/INTEGRATION_NOTES/Order and shared READMEs to remove
resolved build blockers and distinguish separate full Credit runtime dependency.
Validation directly from tracked sources: repository npm run build passed;
existing User build passed; 51 shared gRPC tests, 16 Order units and 61 real
PostgreSQL integration tests passed. Normal Order Docker build passed from this
branch, without temporary source contexts. A dedicated disposable test DB was
used; no live demo services restarted. Normal npm ci result/cleanup follow.
Existing untracked postman 2 left untouched; no Postman assets added.

Final normal npm ci (including package install scripts) passed. All checks use
this branch's tracked shared contracts; no Order-local dependency link remains.
Disposable PostgreSQL container removed. git diff --check passed. PR Markdown
now documents 51 shared + 16 unit + 61 integration results and normal reviewer
commands, with live Credit runtime explicitly separate. Commit follows; no push.

## 2026-10-25 Asia/Singapore — Explain shared Zod usage and refresh PR
Tool: ChatGPT (Codex), mode: code inspection and factual documentation.
Human review pending. Exact prompt:
```text
Why is Zod needed? If you are sure, write me an updated PR
```
Confirmed shared Supplier schema module imports zod at runtime and Order's
Supplier adapter invokes its parse() functions on GetSupplier/IsOpen responses.
Explained existing direct dependency, not a new architecture choice. Updated
PR_DESCRIPTION.md with the runtime import/validation facts and corrected lock
scope to include shared Zod alongside Order dependencies. Retained actual
previously-run 51 shared/16 unit/61 integration and Docker results and reviewer
commands, clearly distinguishing separate full Credit runtime. Documentation
only; no tests rerun or new runtime verification claimed. git diff --check used.
