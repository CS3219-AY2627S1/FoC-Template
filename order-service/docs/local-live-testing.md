# Local Docker: real services with the Pub/Sub emulator
CHANGE-128: local Compose pins courier-penalty-addition-local-v1 and
courier-penalty-deduction-local-v1; private init creates both. Existing two Credit
push subscriptions remain unchanged; no User penalty subscriber is fabricated.
Rebuild Order and rerun pubsub-init after pulling this change. Published penalty
does not imply applied score until User implements FEEDBACK-014.
Bootstrap contract tests: py -3 order-service/deploy/local-emulator/test_init.py
from repo root. No ADC/cloud credentials needed for local emulator.

CHANGE-105 / ADR-036, Vincent, 2026-10-11 supersedes ADR-029's local ADC/Google
Pub/Sub/tunnel setup only. Old cloud resources are not removed.

## Commands

CHANGE-106 adds durable manual repost/V8. After matching rebuild and healthy
local services, run from the Compose root:
`powershell -NoProfile -ExecutionPolicy Bypass -File order-service\scripts\Test-ManualRepostIntegration.ps1`.
This extends the actual full-stack regression with fresh fixture expiry/refund,
manual command/legacy replay, new-ID reservation and linked-original list hiding.
It changes only that newly created fixture's Order expiry via SQL; it does not
modify peer databases, reset volumes or use cloud resources. Fixtures remain.
Runtime is pending after the local Docker engine returned500 during this task;
syntax/isolated real Credit recovery tests passed, not this all-peer smoke.

From the root containing compose.yaml:

```powershell
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml build
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml up -d --remove-orphans
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml ps
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml logs --tail=100 pubsub-init order-service credit-service
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml down
```

Base Compose selects actual HTTP peers and the emulator too. Overrides make this
explicit. --remove-orphans stops retired nginx/tunnel helpers in this Compose
project, not databases/cloud resources.

ONLY for an intentional fresh reset:

```powershell
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml down --volumes --remove-orphans
docker compose -f compose.yaml -f compose.http-peers.yaml -f compose.local-live.yaml up -d --build
```

**down --volumes erases local PostgreSQL/MongoDB/Firebase volume data including
accounts/orders. This task does not execute it.** A normal restart retains volumes.

Open http://localhost:8080 (gateway), http://localhost:4000 (Firebase emulator UI),
http://localhost:8080/api/orders/docs (Swagger).
No gcloud/ADC/LOCAL_TEST_ID/tunnel needed. Ignored private .env files are preserved;
explicit local Compose values ignore their old cloud transport/topics.

## Real versus emulated

Order/Credit/User/Supplier are actual applications with real HTTP calls,
databases and financial logic. Firebase Auth/Firestore and Pub/Sub are emulated.
Order's Spring prod profile enables JWT checks; FOC_ENVIRONMENT=local still
selects local resources, not cloud production topics/credentials.
Register/sign in locally and complete User/Credit provisioning: login alone
does not create a missing Credit account.

| Topic in demo-foc-local | Recipient |
| --- | --- |
| open-order-refund-local-v1 | Credit typed refund push |
| order-completion-local-v1 | Credit typed completion push |
| courier-penalty-addition-local-v1 | User score addition; consumer pending |
| courier-penalty-deduction-local-v1 | User score deduction; consumer pending |

pubsub-init creates four topics/two Credit subscriptions idempotently after
broker/Credit health checks; it exits 0 before Order starts.
Unsigned push requires explicit local-emulator mode plus both Firebase Auth and
Pub/Sub demo/emulator settings. Other Credit APIs still require user JWTs.
Cloud push retains Google signature/issuer/audience/service-account validation.
User's penalty-topic consumer is absent: publishing does not prove penalty
processing. Do not subscribe Credit to that topic as a workaround.

The emulator is volatile: recreation loses topics/messages. Recreate pubsub-init
with it. Already-PUBLISHED outbox messages lost by broker reset are not
automatically replayed; test fresh orders rather than claiming cloud durability.

## Workflows and recovery

Test creation/reservation, cancel/refund, OPEN expiry/refund, acceptance,
ACCEPTED-only abort/reopen or abort/expiry/refund, completion/transfer.
Automatic repost/delegated credentials remain deferred. Manual repost is not
part of this three-operation durable command protocol.

CREATE/ACCEPT/ABORT command APIs AND legacy routes use durable commands. Keep one
immutable key/input/candidate across uncertain replies. Legacy success returns
Order JSON; unresolved returns HTTP 202/saved command status. Pending commands
block competing transitions. No JWT is stored. Tokenless HTTP recovery asks the
owner for fresh authorization; Continue resumes the same key.

The minute job runs recovery -> OPEN expiry -> DELIVERED completion at/after
48 hours. Immediate after-commit publication uses a bounded executor (two
workers/queue 50); the 15-minute scan retries pending/due events. Ten failed
attempts retain FAILED evidence. ADMIN inspection/redrive:

```text
GET  /api/orders/internal/outbox/failed?limit=20
POST /api/orders/internal/outbox/{eventId}/redrive
```

Redrive commits PENDING/returns 202 with the same event ID/payload. Publication
ACK is not completed refund/transfer: inspect Credit balance/reservation/ledger.

From order-service with Java 21 and Docker:

```powershell
.\mvnw.cmd -B -ntp "-Dtest=LiveCreditCommandRecoveryIntegrationTest" test
```

Actual Credit, two isolated PostgreSQL databases and real emulator exercise lost
replies/local rollback/candidate replay/provider restart/concurrent claims/expiry
compensation/abort reset/refund/completion. User/Supplier validation uses fixtures
in that harness. Full Compose evidence is recorded separately in CHANGE-105.

## Reproducible local checks

From the project root, check configuration without changing application data:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File order-service/scripts/Test-LocalEmulatorConfiguration.ps1
```

With the stack running, exercise actual peer HTTP calls and refunds/transfers:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File order-service/scripts/Test-LocalEmulatorIntegration.ps1
```

The second script creates fresh local test users and orders, retained afterward.
It refuses non-local gateways; it does not reset databases or call cloud resources.

## Cloud (not deployed by this task)

Order deploy/env.yaml selects cloud transport and interpolates topics/project from
the staging/production deployment environment. Cloud rejects emulator settings
and uses ADC/service identity. service.conf sets min-instances=1 and
--no-cpu-throttling (approved extra cost) to run idle timers. External lifecycle
HTTP hooks are disabled; the local public fallback is not cloud authentication.
Local tests do not verify cloud IAM/OIDC/delivery/rollout.
See ADR-036 and concurrency/credit-local-emulator-security-interference.md.
