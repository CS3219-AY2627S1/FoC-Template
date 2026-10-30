<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-25 (Asia/Singapore).
Scope: Documented the human-finalized six-RPC credit contract, authentication, REST-only history, generated-file attribution, and bounded Credit client retries. Implemented/documented the human-decided plaintext-only Credit gRPC transport; service-token and REST JWT authentication retained. Documented agreed shared client/validation integration;
Author review: I reviewed and edited for style.
Prompts and key responses: ../../credit-service/ai/usage-log.md, entries 007–012, 014, 016, 018, 021–022, 024–027, 029, 031, 035.
-->

# Shared gRPC contracts

The internal `@foc/grpc` workspace supplies generated TypeScript contracts,
Promise clients, metadata, finite deadlines, and server lifecycle helpers.

| Service | Default gRPC port | RPCs | Contract |
| --- | ---: | --- | --- |
| User | 50051 | GetPublicProfile | user-service/proto/user.proto |
| Order | 50053 | GetOrder | shared/grpc/proto/order.proto |
| Credit | 50054 | GetBalance, ReserveCredits, UpdateReservation, ReleaseCredits, SettleCredits, GetReservation | shared/grpc/proto/credit.proto |
| Supplier | 50052 | GetSupplier, IsOpen | shared/grpc/proto/supplier.proto |

Credit contract/client/types follow the agreed teammate feature branch. Order
uses per-call x-credit-service-token metadata and versioned receipts. Supplier
exports grpcsupplierSchema, isOpenResponseSchema and parseSupplierId. Zod is an
explicit shared-package dependency. No Credit ledger implementation is added here.

User, Supplier and Credit implement their gRPC handlers in their own services;
Credit's six handlers authorize only Order Service. Order's gRPC `GetOrder` still
returns UNIMPLEMENTED; Order's features are served over REST.

## Credit contract alignment

Initialization is an internal user.created allocation callback; RabbitMQ startup belongs to teammates.
Frontend balance and own-history reads use authenticated REST on port 3004.
No gRPC history messages/client wrappers remain.
```bash
npm ci
npm run build
npm run build --workspace user-service
npm test
```

- GetBalance takes user_id and returns user_id, total_credits, reserved_credits,
  and computed available_credits. user_id is restored at field 1; timestamp fields
  remain reserved.
- ReserveCredits takes order_id/requester_id/amount; UpdateReservation takes
  order_id/amount/expected_version; ReleaseCredits takes order_id; SettleCredits
  takes order_id/courier_id. Each returns Reservation: order_id, requester_id,
  amount, status, optional courier_id, reservation_id, version.
- GetReservation takes order_id and returns the same full Reservation message
  as mutation calls, including order/requester/reservation IDs and optional courier.
  The separate GetReservationResponse message/generated type is removed.
- External amount maps to SQL credit_amount. Status values are RESERVED,
  RELEASED, SETTLED. Settle uses the existing transfer idempotency operation.
- Credit computes its operation-scoped lookup keys and SHA-256 request hashes
  from the human's definitions; callers supply no idempotency key. Matching
  completed retries return the stored response before current-state checks.
  Mutation replies describe state immediately after their operation. A saved
  reserve retry after an update still returns the original snapshot; it can also
  describe RESERVED after a later release or settlement. Call GetReservation
  for the full current reservation. Missing-result recovery fallbacks
  remain as specified in the credit-service documentation.
- Existing retained field numbers and enum values are preserved, following the
  [Protobuf update guidance](https://protobuf.dev/programming-guides/proto3/#updating).

## Calling Credit from Order Service

Credit uses plaintext gRPC, with the same configured secret on both services:

```typescript
import { Metadata } from '@grpc/grpc-js';
import { createCreditClient } from '@foc/grpc';

const credit = createCreditClient('localhost:50054'); // 1,300 ms overall budget.
const metadata = new Metadata();
metadata.set('x-credit-service-token', process.env.CREDIT_ORDER_SERVICE_TOKEN!);
try {
  const balance = await credit.getBalance({ userId: 'student-id' }, { metadata });
  console.log(balance.availableCredits);
} finally {
  credit.close();
}
```

Reuse clients across requests and close them at shutdown. Credit accepts only
plaintext gRPC. The shared Credit client's default credentials already use
plaintext; callers should not supply TLS credentials for Credit. The generic
ClientConfig.credentials option remains available for other service connections.
Missing or unknown secrets return UNAUTHENTICATED; known unauthorized service
identities return PERMISSION_DENIED. Identity comes from the matched secret.
Business error reasons are returned in x-credit-error-reason trailing metadata.
Only Credit's explicit ValidationError maps to INVALID_ARGUMENT. Unexpected
errors such as ordinary TypeError return generic INTERNAL details and are logged
server-side. Existing business/authentication/transient mappings are preserved.

Per-call options accept metadata, timeoutMs, and an upstream deadline. The client
preserves error codes/details/trailers and uses the earlier deadline. See
[gRPC deadlines](https://grpc.io/docs/guides/deadlines/) and
[credit-service setup](../../credit-service/README.md).

### Credit client retries

All six Credit RPC wrappers use an application retry loop. Only UNAVAILABLE,
ABORTED, and DEADLINE_EXCEEDED are retried. The built-in settings are:

| Client/per-call option | Default | Meaning |
| --- | ---: | --- |
| timeoutMs | 1300 | Overall budget, including attempts and backoff |
| maxAttempts | 3 | Total attempts, including the initial call |
| initialDelayMs | 50 | Base delay before the first retry |
| backoffMultiplier | 2 | Growth factor for each later base delay |
| maxDelayMs | 500 | Cap on the base delay before jitter |

For each retry, the delay is `base / 2 + Math.random() * base / 2`. The base starts
at `min(initialDelayMs, maxDelayMs)` and grows up to maxDelayMs. Default retry
delays therefore fall between 25–50 ms and 50–100 ms.

Client config overrides the defaults; per-call options override individual client
settings. Set maxAttempts to 1 to disable application retries for that call/client.
Attempts must be positive safe integers. Delay settings accept integer milliseconds
from 0 through 2147483647; backoffMultiplier must be finite and at least 1.

```typescript
const credit = createCreditClient('localhost:50054', {
  timeoutMs: 1300,
  maxAttempts: 3,
  initialDelayMs: 50,
  backoffMultiplier: 2,
  maxDelayMs: 500,
});

const reservation = await credit.getReservation(
  { orderId },
  { metadata, deadline: incomingDeadline, maxAttempts: 1 },
);
```

One absolute deadline is calculated when the call starts. Every attempt uses all
remaining time under that deadline; there is no separate per-attempt cap. An earlier
upstream deadline wins. A server's early DEADLINE_EXCEEDED can retry only if time
remains after the delay. A timeout that consumes the entire budget cannot retry.
If the delay consumes the remaining budget, no wait or retry begins. The deadline
is checked again after waiting to account for late timers. When attempts or time
run out, the last error object is thrown unchanged, preserving its code, details,
and metadata. If the upstream deadline is already expired before any attempt,
the wrapper rejects with DEADLINE_EXCEEDED without invoking the transport.

Requests and supplied metadata are reused across attempts. Mutation retries replay
saved operation snapshots; use GetReservation for current state. Other service
clients retain their existing single-attempt behavior and 3,000 ms default timeout.
An explicit timeoutMs, including one passed through createPeerClients from a
service's GRPC_TIMEOUT_MS configuration, overrides Credit's 1,300 ms default.

## Build and verify

From the root with Node.js 20+:

```sh
npm ci
npm run grpc:generate
npm run build
npm test
```

The 51 shared checks passed after adding Credit retries, including deterministic
deadline/backoff/error checks and real gRPC transport coverage. Credit's
PostgreSQL/REST/authentication tests run separately in its workspace.
Credit source lives under credit-service/src/{domains,repos,services,grpc,rest,events},
with env.ts/index.ts in src and its package/test/scripts at the service root. The
existing @foc/credit-grpc package identifier is retained.

### Run services locally (without Docker)

To run the full stack, use `docker compose up` from the root (see the
[root README](../../README.md#run-the-whole-stack-docker)). To run individual gRPC
services on the host instead:

```bash
npm run dev --workspace @foc/order-grpc
npm run dev --workspace @foc/credit-grpc
yarn --cwd supplier-service dev:grpc
```

Follow each service README for startup and env configuration. Credit now connects
to PostgreSQL and exposes REST as well as gRPC. User Service retains its existing
startup; no User Service publisher or shared messaging startup was added here.

## Regenerating contracts

Fields are snake_case on the wire and camelCase in JavaScript. Enums decode as
strings, int64/uint64 as decimal strings, and protobuf timestamps as seconds/nanos.
Regenerate/build/test after proto changes and retain generated files alongside
the proto. Credit files regenerated during usage-log entries 007, 009–012, 016,
and 021 carry attribution headers. Regeneration overwrites these; restore them
and record later assistance in the service-local log. Retired generated history
and initialization files were removed.

The loader reads the existing User Service proto in place; retain repository
layout when packaging. Other service contracts and startup ownership remain in
their existing folders.

## AI disclosure for shared dependency integration

ChatGPT (Codex), 2026-10-25: imported agreed Credit contracts/client/tests and
Supplier validators. Added Zod to shared/grpc/package.json and regenerated the
root lockfile. JSON attribution in this README and order-service/usage-log.md
was approved by the human. 
