# Credit Service

Owner: Eldridge. Own accounts, reservations, immutable ledger records, balance arithmetic,
compensation rounding and credit-operation authorization; also Chat/Translation as separate
N2H iterations. User owns activation/identity and Order owns lifecycle decisions.

## Invariants

- Allocate 10 available credits at most once per activated User UUID, including retries/replays.
- Reserve only positive whole-credit rewards covered by available balance; link each hold to its
  order. Keep account, reservation and ledger changes atomic and available balances non-negative.
- Reward increases reserve the difference only if affordable; decreases release the difference.
  Reject insufficient-fund adjustments without changing the existing reservation.
- Release the full reservation on OPEN-order expiry or cancellation without compensation.
  Completion transfers the full reservation to the assigned courier.
- On compensation-required requester cancellation, transfer `ceil(reserved * 20 / 100)` to the
  courier and release the remainder to the requester.
- Make allocation, reservation, adjustment, release and settlement idempotent with durable
  operation identities. Preserve acknowledged transactions across recoverable restarts.
- Only approved platform operations/administrators mutate credits; reject direct user-to-user
  transfers. Consume approved User/Order facts without deciding Order state.

## Implementation

Use Java 17, Spring Boot, Maven Wrapper, PostgreSQL, JPA transactions/locking, Flyway,
validation, Actuator, OpenAPI and User-contract RS256/JWKS validation. Never edit applied
migrations. Resolve Chat privacy/retention independently from ledger work.

Read [README](README.md) architecture/verification sections as needed and the relevant
[checklist](IMPLEMENTATION_CHECKLIST.md) item when scoping D3 work.

Admin N2H handoffs: [correction commands](../docs/integration/admin-command-contract.md) and
[Chat timeline/conversation contract](../docs/integration/chat-admin-contract.md). Eldridge owns
both Credit's authoritative ledger adapter and Chat's separate projection; keep their databases
and responsibilities separate. Review proposed interfaces before independent implementation.

Eldridge's [Chat blueprint](../chat-service/README.md) covers messaging, images, translation and
timeline work. Implement it in `chat-service/`, not inside Credit.

Credit frontend work also follows the root [product design contract](../design.md), including the
shared shell and requirement that Credits remain part of the main application journey.
