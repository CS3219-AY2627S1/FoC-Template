# CHANGE-068: Credit courier assignment contract stub

- Date: 2026-10-06
- Status: Order-side stub implemented; Credit integration remains open
- Approval: The user requested synchronous Credit assignment before acceptance and authorized the Order-side mock/contract stub to be replaced when Credit's real endpoint is ready.
- Scope: Order Service only. No Credit Service or frontend files changed.

## Behavior

When a courier accepts an Order, Order Service verifies the courier and validates the locked `OPEN` Order before calling `CreditServicePort.assignCourier`. It waits for Credit success and rechecks the expiry boundary. Only then does it mark the Order `ACCEPTED` and persist its checkpoint, Order state, and command receipt. A Credit failure leaves the Order `OPEN` and writes none of those acceptance records.

The local `MockPeerAdapters` implements an idempotent in-memory assignment against an active reservation. The HTTP adapter targets the proposed `PUT /api/credits/orders/{orderId}/courier-assignment` route, sends typed request data, requires `200 OK`, and validates the returned reservation identity, courier, amount, and `RESERVED` status. Separate request/response DTOs are used.

CHANGE-069/ADR-018 supersedes this paragraph's proposed request/response shape: the assignment request contains only `courierId` (with Order ID in the path) and requires `200 OK` without a response body. Hold/reset similarly uses only Order ID with no body. The Order-side stub now follows these minimal shapes and state-based idempotency rules.

## Contract boundary

The inspected Credit Service does not expose this route. FEEDBACK-004 remains `OPEN`; the HTTP adapter is only a proposal and the real provider must agree trusted service authentication, idempotency, error handling, and recovery if Credit succeeds before Order's database commit fails. The base Compose profile uses the mock adapter. `compose.http-peers.yaml` requires Credit to implement the proposed route.

No schema or event changes are included. Completion events continue to carry the resulting Order's courier ID for the future Credit consumer.

## Verification

- Tests were written first for Credit-before-Order ordering, failure with no Order writes, local mock assignment/idempotency/settlement, and HTTP request/response validation.
- `git diff --check`: passed; only an existing CRLF normalization warning was emitted for the handoff README.
- Focused Maven tests: two compile attempts stopped before test execution. The in-process compiler reported `Fatal Error: Cannot close compiler resources`; forked compilation failed without source diagnostics. No test result is claimed.
- Credit-side implementation and live HTTP integration: not verified.
