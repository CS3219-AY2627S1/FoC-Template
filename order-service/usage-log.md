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


## 2026-10-30 (Asia/Singapore): administrator order status filters

Tool: ChatGPT (Codex). Modes: implementation, tests, documentation.
Human review and validation remain pending.

Exact user prompts:

> Great. Could we add another endpoint for administrator? They should be able to see all orders and also filter to currently ongoing orders.

```text
We will have one endpoint that accepts a filter as a query parameter.
All Orders
`GET /orders`
Ongoing
`GET /orders?status=ONGOING`
Unassigned
`GET /orders?status=UNASSIGNED`
Assigned
`GET /orders?status=ASSIGNED`
Picked Up
`GET /orders?status=PICKED_UP`
Delivered
`GET /orders?status=DELIVERED`
Cancelled
`GET /orders?status=CANCELLED`
```

Assistant clarification: “For status=ONGOING, which statuses should match, and should overdue orders awaiting expiry processing still appear?”

Exact user answer: “UNASSIGNED, ASSIGNED, PICKED_UP; include overdue orders”.

Key response: “ONGOING will include UNASSIGNED, ASSIGNED, and PICKED_UP, including overdue orders. I’ll verify the filters, administrator access checks, and existing user queries.”

Implemented the supplied status filter on the existing administrator endpoint,
keeping the existing USER scopes. Invalid filters and mixed scope/status queries
return 400. Added real PostgreSQL/HTTP regression coverage for exact statuses,
ongoing/overdue inclusion, role restrictions and query validation. Updated the
service README and final project README AI disclosure. No UI changes.

Verification: Order build passed; 16 unit/authentication/gRPC tests passed after
rerunning outside the sandbox (local listeners were blocked inside it). Existing
migrations applied to a temporary dedicated PostgreSQL test database.

Final verification: all 62 Order PostgreSQL/HTTP/gRPC integration tests passed,
including the new administrator filter test and existing USER scope regression
test. The initial sandboxed integration attempt could not reach PostgreSQL;
rerunning with local network access succeeded. `git diff --check` passed.
Temporary PostgreSQL test container removed after verification.


## 2026-10-30 (Asia/Singapore): remove current supplier opening-hours restriction

Tool: ChatGPT (Codex). Modes: implementation, regression tests, documentation.
Human review remains pending.

Exact user prompt: “Remove that check since it does not make sense if the supplier is not currently open but will be open in the other hours and the order can still be completed.”

Key response: “I’ll remove the supplier open-status checks from order creation, recovery, and editing, then update the tests and documentation. Supplier existence validation will stay in place.”

Removed calls to Supplier IsOpen from creation preflight, reservation recovery,
final publication validation and editing. Removed the unused Order adapter.
Supplier lookup, order expiry and credit reservation/compensation remain. Existing
COMPENSATING operations still complete their recorded refund workflow. Updated
regression tests: an accidental IsOpen call throws in the fixture, the real
gRPC adapter test exposes an unimplemented IsOpen RPC, and uncertain reservation
recovery now publishes without an opening-hours check or refund. Updated Order
README, manual testing and integration notes, plus the root AI disclosure.

Verification: Order build and all 16 unit/authentication/gRPC tests passed.

All 62 PostgreSQL/HTTP/gRPC integration tests passed, including creation/editing
with IsOpen unimplemented and recovery without current-opening-hours checks.
`git diff --check` passed. Temporary test container removed after verification.


## 2026-11-02: account deletion eligibility preparation (incomplete)

Tool: ChatGPT (Codex). Mode: implementation. Human review pending.

Exact user replies:

> For a race condition, prioritise the row lock to standardise across different operations. But also, if the user has any active orders (unassigned, assigned, picked_up) or is currently assigned as a supplier (order is assigned, picked_up), both will block the user from account deletion as they have an order in progress. Ensure that settlement is completed.

> That will be implemented by the user microservice owner. I only have infomration within the text given, any additional, i can check.

> DeletedUser. It is an async work flow so sub for the event

Relevant original requirement (verbatim):

> Block deletion if the user is requester or courier on an order with status UNASSIGNED, ASSIGNED, or PICKED_UP.
> Also block if an order has creditState of RESERVED, SETTLEMENT_PENDING, or REFUND_PENDING.

Key response: “I’ll use `DeletedUser` for scrubbed text and check the existing gRPC and messaging setup. Row locks will serialize Order operations, but the `user.deleted` handler still needs a defined outcome if it finds an active order after User has already deleted the account. I’ll confirm that gap while working on the eligibility check.”

Implemented only the internal blocking-order query in
`grpc/src/services/deletionEligibility.ts`. It matches either participant and
blocks active status OR unresolved credit state, including pending settlement on
a delivered order. It rejects a blank user ID. This is a point-in-time query,
not a deletion fence. It is not exposed over gRPC yet. No event consumer,
tombstone schema, scrubbing or lifecycle changes have been implemented.

Pending human confirmation: deletion-event race outcome; Order-local durable
marker/event tracking; exact gRPC response and access contract. No User or Credit
implementation changed. Verification: Order Prisma generation and TypeScript
build passed. Database/runtime behavior has not yet been tested.


## 2026-11-02: searchable destination catalogue

Tool: ChatGPT (Codex). Modes: implementation, tests and documentation. Human
review pending. File attribution for the unchanged CSV is in data/README.md.

Exact user prompts/replies for this work:

1. “Could we build a database with this for the destination and the user can type and it can find from this database when creating the order?”
   File: `/Users/euniceng/Downloads/nus_kent_ridge_locations.csv`.
2. “Postgres. Yes, for now, retain and use the format within the csv file. It can be changed later right?”
3. “It should be one of the buildings within this csv file. any additional details can be specified in their description”
4. “Order owns it. The order itself should store the display name and the locationID which should be unique. The search should also search aliases and names.”
5. Search contract supplied by the user (verbatim formatting):

```
GET /api/locations?query={searchTerm}&limit={limit}
`limit`: Optional, defaults to `20`, maximum `50`.
{\
&#x20; "locations": [\
&#x20;   {\
&#x20;     "id": "nus-com1",\
&#x20;     "name": "COM1",\
&#x20;     "code": "COM1"\
&#x20;   },\
&#x20;   {\
&#x20;     "id": "kr_002",\
&#x20;     "name": "COM2",\
&#x20;   }\
&#x20; ]\
}

bad request:
{\
&#x20; "error": {\
&#x20;   "message": "Search query must not be empty."\
&#x20; }\
}
```

Key assistant responses:
- “I’ll inspect the CSV and the current destination selector. A searchable list is possible; I’ll check what fields the file contains so you can confirm the storage and API choices required by your course policy.”
- “Confirmed: Order owns the PostgreSQL catalogue, each order stores the unique location ID and display name, and search matches names and aliases.”
- “I’ll add the CSV-backed catalogue, the agreed search endpoint, and a searchable selector in the create form. I’ll also validate the selected location on create and edit, then save its ID and catalogue name on the order.”

Implementation: preserved all 206 user-supplied CSV rows/columns in Order-owned
DestinationLocation; migration creates/seeds the catalogue and adds nullable
Order.destinationLocationId for historical compatibility. Names and aliases are
searched case-insensitively; literal wildcard characters are escaped. Query and
limit validation, stable ordering, empty results and the specified error shape
are implemented. UI searches are debounced and obsolete results are discarded;
users must select a result. Catalogue ID/name validation runs before reservation
or edit adjustment; durable creation/edit payloads retain the selected pair.
Exact catalogue names remain supported for existing clients and resolve to IDs.
Historical text and previously recorded recovery payloads are preserved. Updated
setup/API and manual test documentation. No changes to Supplier/Credit contracts.

Verification:
- Order Prisma generation and TypeScript build passed.
- UI production build and TypeScript check passed.
- All 16 Order unit/authentication/gRPC tests passed. Initial sandbox attempt
  could not bind test servers; rerun with local network permission passed.
- All 66 PostgreSQL/HTTP/gRPC integration tests passed, including CSV import,
  search defaults/max/validation, names/aliases, literal wildcards, invalid
  ID/name rejection before credit calls, stored IDs, durable edit recovery and
  pre-catalogue creation recovery.
- First migration attempt found an empty leftover directory from the user's
  reverted supplier snapshot rename. Removed that empty directory and applied
  migrations successfully. The premature integration run failed because the
  catalogue migration had not applied; subsequent full suites passed.
- Used a disposable dedicated PostgreSQL database, not the development database.
  UI interaction in a browser and a full Docker application build were not run.


## 2026-11-02: requester versus courier pickup/delivery authorization

Tool: ChatGPT (Codex). Modes: debugging, implementation, regression tests.
Human review pending.

Exact user prompt: “Can you check if there is a bug where the requester is able to mark picked up, delivered, which is only supposed to be done from the courier's side both frontend and backend?”

Key response: “The backend already rejects pickup and delivery unless the authenticated user is the assigned courier. I found a UI gap: the ‘Active Errand’ page shows those buttons without checking the viewer’s identity. I’ll fix that and add regression tests.”

Inspection: backend OrderLifecycle.pickup/deliver already compare JWT-derived
actor ID against courierId and explicitly exclude requesterId, within row-locked
transactions. Both routes require USER role. No backend authorization change was
needed. Same-origin tabs share localStorage tokens, so a stale requester UI can
send a courier token after another tab logs in; this is not evidence that the
backend authorized the requester identity. Session storage behavior is unchanged.

Changes: pass currentUserId from App to AcceptedOrderPage; hide and guard pickup
and delivery for non-couriers, explicitly excluding requesters even if both IDs
match. Mirror that exclusion and handler checks on OrderDetailsPage. Restrict the
courier credit-earned message on the active errand page to the courier.

Tests: added actual React server-rendered page checks for requester, outsider,
unknown viewer, requester/courier ID collision, eligible courier and status
transitions. Run from the repository root:
`TSX_TSCONFIG_PATH=ui/tsconfig.json node --import tsx --test ui/tests/courierActions.test.cjs`.
Added authenticated HTTP requester/outsider delivery assertions with checks that
status stays PICKED_UP and no settlement intent or Credit call is made. Existing
pickup HTTP test already verifies requester/outsider rejection and courier success.

Verification: all 4 UI rendering tests passed; UI production build and TypeScript
check passed. All 66 Order PostgreSQL/HTTP/gRPC integration tests passed against
a disposable dedicated database. The initial tsx CLI attempt was blocked from
opening its IPC socket; node --import tsx ran the same tests successfully without
that socket. No live user orders or balances were modified. No manual browser
interaction testing performed. Changes remain uncommitted.


## 2026-11-02: validate courier still exists before acceptance

Tool: ChatGPT (Codex). Modes: implementation, debugging and tests. Human review
pending.

Exact user prompt: “Check for this and if not present, implement that "Validate courier still exists before accepting an order"”

Key response: “Acceptance previously relied on the JWT and local order state; it didn’t check whether the courier still existed. I’ve added a User Service lookup before assignment. A missing user is rejected, and an unavailable or timed-out lookup leaves the order unassigned.”

Acceptance now uses User GetPublicProfile through the existing shared gRPC client
and existing startup-owned User connection (via directories). JWT determines the
queried user ID. NOT_FOUND returns 403 forbidden. Other RPC failures/timeouts or
a mismatched returned ID return 503 dependency-unavailable. Lookup occurs under
the existing order row lock after local eligibility checks; database expiry is
sampled again before assignment. No Credit account check or balance mutation was
added. This point-in-time existence check is not an atomic cross-service deletion
protocol, and does not replace the pending asynchronous deletion work.

App receives the configured acceptance service explicitly. Without that service,
the existing route returns 503 rather than bypassing lookup. Existing acceptance
fixtures now explicitly inject the test User lookup. Added live User gRPC + HTTP
coverage for deleted/missing courier, unavailable service, deadline expiry,
response identity mismatch, successful assignment and no mutations on rejection.
Added expiry-during-lookup coverage. Existing concurrent acceptance, cancellation
and edit race tests remain.

Verification: Order generation/build passed after rerunning with Prisma cache
access (initial sandbox attempt failed with EPERM touching the cached engine).
All 16 unit/authentication/gRPC tests passed. First full integration run had four
creation/recovery fixture failures (one new acceptance test failed during its
creation setup); the isolated acceptance run passed all 9 tests. A subsequent
complete run passed all 68 PostgreSQL/HTTP/gRPC integration tests. No claim is
made that the initial intermittent fixture failures were fixed. Tests used a
disposable dedicated PostgreSQL database, removed afterward. Existing demo
accounts/orders/credits and running containers were not modified. No migration
is needed for the acceptance check. Rebuild Order to activate it. Uncommitted.


## 2026-11-02: subscribe to user.deleted through RabbitMQ

Tool: ChatGPT (Codex). Modes: implementation, debugging, tests and documentation.
Human review pending. JSON/lockfile attribution is recorded here and in the
project README; Order package.json also has _aiAssistance metadata.

Exact user prompt: “Subscribe to `user.deleted` events through RabbitMQ”

Relevant prior human approval (verbatim): “if user.deleted arrives and an active order still exists, we will notify the user service that the user is unable to be deleted. so keep it active for completion. yes, we can store that.”
The storage approval answered the question about Order-local deleted-user markers
and processed event IDs surviving restarts. The notification contract remains
unconfirmed; no notification schema or endpoint was invented.

Key assistant responses:
- “I’ll check the existing RabbitMQ client and User event format, then wire Order to consume `user.deleted`. I’ll keep the subscription separate from deletion-conflict notifications, since their contract is still unconfirmed.”
- “Order’s shared User queue is `order.user-events`. I’m wiring the shared RabbitMQ client to record each deletion event durably before acknowledging it, using the event ID to make redelivery safe. Invalid deletion messages will go to the queue’s dead-letter queue.”
- “This step records receipt of deletion events. It does not yet scrub history or resolve deletion races.”

Implementation: added @foc/messaging dependency and builds, optional RABBITMQ_URL
configuration, shared-client startup/cleanup, handler validation and PostgreSQL
UserDeletionEvent receipts keyed by eventId, plus migration. Match broker
messageId when present. Duplicate deliveries do not duplicate receipts, and
conflicting reused IDs are rejected. Database failures propagate into the shared
three-retry/DLQ flow; ACK follows durable receipt. Created/restored messages have
no Order action. Shared user.deleted schema now matches the supplied contract:
no required purgeAfter, nonblank IDs and ISO timestamps. Added Docker source
allowlisting so the messaging package is actually built/included. Root lockfile
change is only the new Order messaging dependency; no Credit entries removed.

Scope: receipt/subscription only. No scrubbing, old-token rejection based on the
inbox, active-order cancellation, Credit mutation, eligibility RPC or conflict
notification added. User's direct-to-queue outbox publisher must target
order.user-events; publishing only to credit.user-events does not fan out to
Order. The consumer does not invent an exchange binding or modify User/Credit
business functionality. Documentation explicitly distinguishes receipt from
completed deletion processing.

Verification:
- Shared messaging and Order generation/build passed; Credit TypeScript build
  checked for shared contract compatibility.
- All 19 Order unit/authentication/gRPC tests passed, including malformed
  events, event-ID mismatch, ignored unrelated events and propagated DB errors.
- Final complete suite: all 69 PostgreSQL/HTTP/gRPC/RabbitMQ integration tests
  passed, zero skipped. Live broker tests cover five concurrent duplicates,
  restart/offline queued redelivery, invalid/conflicting events in DLQ and a
  simulated database outage exhausting retries without a receipt.
- Initial suite had a legacy recovery fixture count failure. Scoped the two
  catalogue recovery tests to their saved operation IDs, avoiding unrelated
  fixture work. A subsequent run had widespread transient creation failures;
  no production creation behavior was changed and no root cause is claimed.
  Final full run passed. Synthetic diagnostic creation used only the disposable
  test database and fake credits.
- Built foc-order-events-test Docker image successfully. Started an isolated
  Order container with the disposable database/broker; startup logged its
  subscription, and a synthetic user.deleted reached UserDeletionEvent through
  the startup-wired consumer. Stopped that consumer before the final broker
  integration run to avoid a second consumer on the test queue.
- git diff --check passed. All runtime tests used disposable containers on
  PostgreSQL port 55450 and RabbitMQ port 5679; no demo queues, accounts or
  balances were changed. Test containers removed afterward.


## 2026-11-02: active-order deletion consistency and safe-history scrubbing

Tool: ChatGPT (Codex). Modes: implementation, debugging, tests and documentation.
Human review pending. JSON package-script attribution is recorded here and in
README. Generated gRPC files are attributed and trace to the approved proto.

Exact user prompt: “Handle deletion of requester/courier on active orders.”

Exact clarification question:
“Your earlier rule was to keep raced active orders for completion and notify User Service that deletion is blocked. I still found no notification contract. What event name, payload and destination queue—or RPC—has the User owner agreed to receive? Since user.deleted means the account is already deleted, please also confirm how User will restore access so an affected courier can finish their order.”

Exact human answer:

> Thanks for flagging this. You're correct that we have not agreed on a notification contract or account-restoration mechanism with the User Service owner.
> Please do not invent an event, queue, RPC or restoration workflow.
> For now, follow these decisions:
> 1. CheckDeletionEligibility is the synchronous pre-deletion safeguard. User Service must reject deletion when Order Service reports blocking orders.
> 2. The user.deleted event is a post-deletion notification, not a request for Order Service to approve or reject deletion.
> 3. If a user.deleted event arrives while the deleted user still has an active order, treat this as an exceptional consistency failure. Preserve the affected order and its credit state rather than automatically completing, reassigning or cancelling it without an agreed recovery contract.
> 4. Do not assume User Service can restore the deleted account or reactivate its JWT. No such mechanism has been confirmed.
> 5. Implement the confirmed functionality first: courier existence validation on acceptance, RabbitMQ consumption, idempotent processing and personal-data scrubbing for safely completed/cancelled orders.
> 6. For unexpected active orders, ensure the failure is recorded and observable, and use the existing retry/dead-letter mechanisms where appropriate. Do not endlessly retry an inconsistency that requires manual intervention.
> 7. Identify the deletion-versus-order-creation/acceptance race and document that User Service and Order Service must coordinate to prevent new order activity while deletion is in progress.
> Please leave the active-order recovery workflow pending agreement with the User Service owner rather than implementing speculative behaviour.

Previously approved RPC contract:
`CheckDeletionEligibility(user_id) -> { eligible: boolean, blocking_orders: string[] }`,
blocking requester/courier active orders and unresolved credits, with existing
internal gRPC access conventions and failure closed. No new endpoint token.

Key assistant responses:
- “I’ll follow that contract: preserve active orders and unresolved credits, record them for manual review, and acknowledge the event without endlessly retrying it. Safely completed or cancelled orders can have their personal data scrubbed using `DeletedUser`.”
- “The cross-service race remains as you specified: User and Order still need an agreed way to prevent new activity between the eligibility check and deletion.”

Implementation:
- Added the approved eligibility RPC/shared client and wired the existing Prisma
  connection. Includes both participants, active/credit states, unresolved durable
  operations/edits and preallocated pending/compensating creation IDs. Blank input
  gives INVALID_ARGUMENT; unavailable database gives UNAVAILABLE, never eligible.
- Added recorded RECEIVED/PROCESSED/MANUAL_REVIEW_REQUIRED outcomes with blocker
  IDs, error code and completion timestamp. Locks event and Order rows; active
  and unresolved work is preserved without deletion-triggered Credit/lifecycle
  mutations. Logs the consistency failure and ACKs the recorded manual-review
  result instead of endlessly retrying it.
- Scrubs only confirmed DELIVERED/SETTLED or CANCELLED/REFUNDED history without
  unresolved intents. Deleted participant name, destination, request details,
  referenced destination ID and free-text JSON copies are scrubbed. Counterpart
  name, public Supplier snapshots, original IDs, status and financial audit data
  remain. Resolved error text is replaced. Confirmed failed creations without
  unresolved funds are also scrubbed. Related JSON request/target shapes remain
  valid objects. No cascades or restoration/reassignment behavior added.
- Scrubbing and processing outcome commit atomically. Storage failure rolls back
  the scrub and propagates to existing broker retry/DLQ behavior. Old receipt-only
  events are processed at subscriber startup. Manual-review rows are not
  automatically replayed. Existing ordinary lifecycle/recovery workers remain.
- Integration files run sequentially because subscriber startup scans the shared
  test inbox; independent test processes must not process one another's fixtures.
- Documented User's required synchronous call and pending coordination to stop
  new create/accept activity during deletion. This implementation is not an
  atomic cross-service deletion fence, a User restoration mechanism, or an active
  recovery contract. No notification event/queue/RPC invented.

Verification:
- Shared gRPC generation/build and Order Prisma generation/build passed.
- All 20 Order unit/authentication/gRPC tests passed.
- All 51 shared gRPC regression tests passed. Initial shared run could not load
  an ungenerated local User Prisma client; generated it and built Credit test
  modules, then reran successfully. No User/Credit database changes were made.
- Final complete run: all 81 PostgreSQL/HTTP/gRPC/RabbitMQ integration tests
  passed, zero skipped. Covers each active requester/courier case, duplicate and
  replay handling, partial-history scrubbing, nested JSON, destination reference
  removal, pending creation/settlement/refund/edit work, rollback on write failure,
  saved-inbox recovery, fail-closed eligibility transport and waiting for an
  in-flight lifecycle row lock. Initial full run passed 80 before adding the
  final explicit row-lock test.
- Docker image foc-order-deletion-test built. An isolated runtime smoke test
  exercised the startup-wired RPC and actual RabbitMQ consumer with synthetic
  active/history orders: eligibility=false; MANUAL_REVIEW_REQUIRED persisted;
  active order/name/RESERVED credits unchanged; cancelled/refunded history
  scrubbed and destination reference removed.
- Used only disposable PostgreSQL (55450), RabbitMQ (5679) and an isolated runtime
  container (HTTP 33014). No live demo orders, users, balances or queues changed.
  Test containers removed after verification. git diff --check passed.


## 2026-11-03: review User deletion PR #101 for Order integration

Tool: ChatGPT (Codex). Modes: code review, debugging and documentation.
Human review pending. No User/Order service implementation was modified or merged
as part of this review. Existing local changes were preserved.

Exact user prompt: “Lets start by reviewing my teammate's PR on user delete so we can also get any relevant information we need for it”

Reviewed source: https://github.com/AY2627S1-CS3219-P22/FoC/pull/101,
branch origin/F2.7-user-account-deletion, fetched head
6ffe05ff4a4f1b560b07abeef924815f934ab454. Compared its diff against origin/main
and the current uncommitted Order implementation. Attached PR to this chat.

Key responses:
- “I found PR #101, on F2.7-user-account-deletion. Its code does publish user.deleted directly to Order’s queue, which matches our consumer.”
- “I confirmed the protobuf mismatch with a focused check: decoding our ID-list response using their count contract fails. I also reproduced an edge case where the archive purge removes a row during restoration; registration then throws an unhandled P2025 instead of returning a controlled response.”

Findings / integration facts:
- Shared field 2 differs: PR int32 blocked_order_count versus our approved repeated
  string blocking_orders. The User client reads blockedOrderCount, so retaining
  our generated types requires corresponding User-side alignment. The two wire
  types are not interchangeable. Direct serializer/deserializer checks showed
  ID-list response -> count contract throws a decoding error; count response ->
  ID-list contract produced a bogus empty-string list item.
- PR Order eligibility helper checks active statuses, top-level credit states
  and pending/compensating creations. It does not inspect separate unresolved
  credit/edit records. Integration must preserve the stronger existing checks
  from the confirmed Order requirements rather than taking the incoming helper
  wholesale. This is an integration coverage difference, not a claim that the
  PR fails to compile independently.
- Restoration reads ArchivedUser before its transaction and later unconditionally
  deletes that snapshot's email row. A focused test of the actual PR register
  function, transpiled in a sandbox with mocked Prisma and clock, let the archive
  expire and be purged between those steps. It threw uncaught P2025; fake user and
  event were rolled back. The catch handles duplicate P2002 only. No live database
  reproduction or automatic fix was performed.
- PR user.deleted builder emits the exact required IDs/ISO timestamps, omits
  purgeAfter and enqueues directly to order.user-events inside the deletion
  transaction. Its generated payload was accepted by the current Order schema.
- Hard deletion means User GetPublicProfile returns NOT_FOUND, compatible with
  the existing courier-existence validation before acceptance.
- PR user.restored adds previousUserId and routes only to Credit; Order should
  keep its no-op behavior. A focused schema check confirmed our old restored
  schema currently strips previousUserId, so retain that PR field while merging
  shared messaging and our stronger deletion validation.
- User uses ORDER_GRPC_ADDR, with order-service:50053 for the shared network and
  host.docker.internal:50053 in the standalone Compose override. No new service
  token is introduced.
- Existing known limitations remain: User/Order check-then-delete race needs
  agreed coordination; active orders remain manual review on Order. Restoration
  lacks ownership verification and Credit restoration support is required. These
  acknowledged limitations were not treated as newly discovered bugs.

Validation limits: no new automated deletion/restoration test files are included
in the PR diff (existing User tests are outbox/user.created). Ran focused wire,
event-schema and mocked archive-purge race checks only, using temporary files
under /tmp/foc-pr101-review. No production accounts/credits/events were touched.
CI tool requested a GitHub account connection; CI results could not be inspected.
The combined User+Order full-stack deletion flow was not run during this review.


### 2026-11-03 — Order destination route and database separation
Tool: ChatGPT (Codex). Mode: refactor/debug/document.
Exact prompt: “it is an order call. rename the route to /order also make sure the abstraction between db query and route is enforced. also double check that i am not creating a second db or prisma client”
Key response/implementation: Moved lookup to GET /order/locations through an Order router; controller validates HTTP query and formats response; destination service performs Prisma queries using existing src/db.ts singleton. Updated UI client, Vite proxy, nginx proxy, README and existing integration request path. Existing /orders lifecycle endpoints unchanged. No new database, schema or Prisma client.
Verification: Temporary isolated HTTP test exercised actual router/controller/service with mocked singleton storage: success, empty/invalid queries, limits, alias configuration, literal wildcard escaping and old route 404 passed. git diff --check passed. Production source has one new PrismaClient, in src/db.ts. Full PostgreSQL integration suite and full builds were not rerun (worktree dependencies absent). Author review pending.


### 2026-11-03 — Match the single Order router from the UI
Tool: ChatGPT (Codex). Mode: refactor.
Exact prompt: “I changed it to orders/locations instead and i mounted it to the existing router. I ONLY WANT ONE ROUTER. Can you make sure the UI changes its route accordingly? Preserve the proxy”
Implementation: UI search now calls /orders/locations through /backend/orders/locations. Preserved Vite proxy target/rewrite and nginx Order proxy, aligned both prefixes to /backend/orders. Backend router files unchanged. Checked client-to-proxy URL matching and git diff whitespace; no full build rerun. Human review pending.


### 2026-11-03 — Validate existing worktree before commit
Tool: ChatGPT (Codex). Mode: debug/test/document.
Exact prompt: “Check and make sure code works and let me know how to term my latest commit.”
Updated location integration test to use an authenticated USER JWT after the human moved the endpoint into the existing authenticated Order router; added unauthenticated 401 assertion.
Verification in /Users/euniceng/Desktop/FoC: shared gRPC/messaging and Order builds passed; Order unit tests passed; shared gRPC 51 tests passed. UI build and TypeScript check passed with installed Node 22.22.0 (default Node 20.10.0 is too old for this Vite version). Fresh disposable PostgreSQL migration and integration run: 80 passed, 0 failed, 1 RabbitMQ-dependent test skipped because no test broker configured. No live database touched. Test container removed. No commit or staging performed; test/log edits remain unstaged over the user's existing staged changes.


### 2026-11-03 — Align deletion eligibility with User PR #101
Tool: ChatGPT (Codex). Mode: implementation/refactor/test/document.
Exact prompts: “Can we follow the convention in my teammate's PR?”; clarification: “Do you mean the User deletion PR #101 convention, specifically changing CheckDeletionEligibility to return { eligible, blocked_order_count } instead of { eligible, blocking_orders }?”; answer: “Yes”.
Implementation: proto field 2 is now int32 blocked_order_count; TypeScript response uses blockedOrderCount. Handler counts existing blocker results. Existing active-order, requester/courier, unresolved credit/edit and pending creation checks retained. Generated response type, RPC integration expectations and current docs aligned. This supersedes earlier ID-list contract log entries; deploy matching clients/server together because field 2 wire type changed. Author review pending.

Verification: shared gRPC/messaging and Order builds passed; shared gRPC 51 tests passed; fresh PostgreSQL migration + Order integration suite 80 passed, 0 failed, 1 broker-dependent test skipped. Real gRPC integration assertions cover count 0/1, requester/courier blockers, pending creations, invalid IDs and unavailable database fail-closed behaviour. Disposable database removed; no live records touched. git diff --check passed. Nothing staged or committed.


### 2026-11-03 — Postman deletion eligibility checks
Tool: ChatGPT (Codex). Mode: documentation/test instructions.
Exact prompt: “can we have some postman tests for this?”
Added order-service/postman/deletion-eligibility.md: manual gRPC request setup, zero/count response, invalid IDs, requester/courier active states, idempotent creation, settlement/refund eligibility and fail-closed downtime. Does not change existing demo collections or invoke account deletion. Current User checkout lacks DELETE /users/me; full User integration explicitly deferred until that PR is integrated. Reviewed against current handlers and DTO; these manual steps were not executed in Postman. Author review pending.


### 2026-11-03 — Single-order API and frontend details
Tool: ChatGPT (Codex). Modes: implement/refactor/test/document. Author review pending.
Exact initial prompt: “Lets implement a GET /orders/:id for the api with frontend/”
Initial clarification answer: “Requester, assigned courier, or administrator only; existing order fields”. This was superseded before implementation by the following exact prompt:

Please implement `GET /orders/:id` with these access rules:

1. Authentication is required.
2. The requester, assigned courier and administrator may retrieve the order.
3. Other authenticated users may retrieve an `UNASSIGNED` order, but only with the same limited fields exposed by the existing `scope=open` listing.
4. Other authenticated users cannot retrieve orders in `ASSIGNED`, `PICKED_UP`, `DELIVERED` or `CANCELLED` states unless they are the requester, assigned courier or administrator.
5. Return `{ "order": {...} }`, reusing the existing order-listing field names, types and serializers.
6. Do not expose internal credit operations, creation payloads, edit-operation records or other sensitive metadata.
7. Use the existing authorization conventions. Return 401 for missing/invalid authentication, 403 for unauthorized access and 404 for nonexistent orders.
8. Add tests for requester, assigned courier, admin, unrelated authenticated user viewing an open order, unrelated user viewing a non-open order, missing authentication and nonexistent order.

Please keep the implementation consistent with our existing `GET /orders?scope=open`, `requested` and `assigned` behaviour.

Key implementation: existing single router, locations route before parameter route, authentication before lookup; controller validation and serialization; service uses existing singleton and listing projection. Unrelated users cannot view overdue UNASSIGNED orders, matching open listing. No internal relation payloads selected. UI API client and useOrder fetch latest details on open, disable actions until loaded and show load errors instead of stale controls. No new router, database, Prisma instance, public proxy or gRPC GetOrder implementation.

Validation: Order build and 20 unit tests passed. UI build, TypeScript check and 4 existing courier-control render tests passed using Node 22. Fresh PostgreSQL migrations applied to isolated order_service_test_details. Initial full run had 34 creation-related failures returning pending, while the new single-order test passed. Isolated creation check passed; full reruns under default Node 20 and Node 22 each passed 81 tests, 0 failures, 1 RabbitMQ-dependent test skipped. Initial issue did not reproduce; no unrelated creation source was changed. Temporary diagnostic instrumentation was applied only to generated dist output and restored immediately. Test container removed. No live data, commits or staging changes. Full browser interaction not exercised. git diff --check passed.


### 2026-11-04 — Supplier coordinate pickup snapshot
Tool: ChatGPT (Codex). Mode: implementation/debug/test/document.
Exact initial prompt: “Change getSupplier in order control to use longtitude and latitude instead. What is it currently using”
Exact clarification answer: “Keep pickupLocation string: \"latitude, longitude\"”.
Implementation: shared Supplier response validated as before, then adapter formats pickupLocation from latitude and longitude. Creation and edit snapshots use that property rather than locationDescription/fallback. No schema, RPC lookup parameter, router, database or Prisma instance changed. Existing saved history and durable historical recovery payloads unchanged. Actual current edit preflight re-fetches Supplier for every edit, so successful edits save the latest coordinate snapshot even if supplierId is unchanged. Regression fixtures and real Supplier gRPC integration expectations updated. Human review pending.

Verification: Order build and 20 unit tests passed. Real Supplier gRPC adapter + PostgreSQL tests confirm creation and edit pickupLocation equals "1.3, 103.77". Full integration rerun: 81 passed, 0 failed, 1 RabbitMQ-dependent test skipped. Initial fresh-container run returned widespread pending creation responses; isolated creation/real-Supplier checks and subsequent full run passed without changing creation logic. Initial environment/setup issue not conclusively diagnosed. Temporary dist-only diagnostic instrumentation restored immediately. Disposable database removed, no live data changed. git diff --check passed. No commit or staging performed.

## 2026-11-06 — Courier-name fix and lifecycle completeness review

Tool: ChatGPT (Codex). Modes: debug/implement/refactor/test/document. Human review pending.
Exact prompt: “Resolve this issue. After, check for any incomplete work like this. Thoroughly.”
Context: acceptance explicitly wrote courierName=null after checking User existence; human requested completion of the previously explained first/last-name snapshot with username fallback.

Changes: acceptance now saves a trimmed display name from the verified profile and fails closed without assignment for missing display identity. HTTP/list query projection includes the already-stored destinationLocationId. UI API mapping preserves creditState and completion feedback reports received funds only for SETTLED. Creation time options, validation and hints enforce the existing one-hour minimum. Removed misleading opening-hours rejection copy. Added persistence/name/fallback and frontend contract regression tests; wrote COMPLETENESS_REVIEW.md with reviewed files/paths and remaining confirmed scope. No new schema, database/client, speculative recovery, cache or gRPC GetOrder implementation; historical accepted orders not backfilled. Existing contracts and human decisions retained.

Verification: Order build and 20 unit tests passed. UI build, TypeScript and 7 UI tests passed with Node22. Disposable PostgreSQL and RabbitMQ full integration suite: 83 passed, no failures or skipped tests. No live data changed. Startup found Docker stopped; started Docker Desktop to run disposable tests. Test containers cleaned up after verification. No staging, commit or push performed. Browser end-to-end and combined teammate User deletion PR flow not exercised.

Final audit follow-up: fixed InvalidSupplierError to carry the existing INVALID_ARGUMENT gRPC code; previously out-of-safe-integer local IDs appeared as unavailable-service failures. Added adapter-error classification test. Strengthened actual User gRPC acceptance HTTP assertion for courierName. Final rebuild and rerun: 21 Order unit tests, 51 shared gRPC tests, 83 PostgreSQL/RabbitMQ integration tests and 7 UI tests passed; no skips in final integration run. UI build/typecheck passed. Existing database rows were not backfilled. Test PostgreSQL/RabbitMQ containers removed; Docker Desktop left running after tests.


## 2026-11-07 — Merge main into order-endpoints
Tool: ChatGPT (Codex). Modes: merge conflict resolution, debugging, testing, documentation. Human review pending.
Exact prompts: “Could you resolve any merge conflicts before I merge to main?”; prior steering “what abt this? happy to help with the ui/pages/CreateRequestPage.tsx conflict when you merge main in. Just keep main’s newRequestKey() (it’s the http fix)”.
Resolved README disclosures, Order Dockerfile, Dockerfile-specific ignore and CreateRequestPage conflicts. Retained main runtime/migrate stages and root ignore file; included shared messaging workspace install, compilation and runtime dist. Kept newRequestKey HTTP fallback, idempotency reuse, destination catalogue and one-hour deadline validation. Preserved no Supplier IsOpen call; removed stale shared-client test for removed method. Root Compose points Order at shared broker; standalone override uses host broker. Order CI path filter includes its messaging dependency. Updated Order setup/docs.
Verification: clean npm ci under Node22; builds for shared gRPC/messaging and Order/User/Supplier/Credit; UI build and typecheck, 7 UI tests; 21 Order unit and 50 shared gRPC tests (User Prisma generation required first); 83 PostgreSQL/RabbitMQ integration tests passed with no skips; Docker runtime and migration images built, migration applied to a separate disposable DB, first runtime smoke caught non-root RabbitMQ log directory EACCES; Dockerfile creates a node-owned logs directory. Rebuilt final image, reran container migrations on fresh disposable PostgreSQL, and confirmed HTTP 200 /health plus RabbitMQ subscription ready under the non-root user. No live stack restart, no database volume changes. Resolutions staged; no commit or push. Existing whitespace in incoming main files and original CSV line endings were left intact.
