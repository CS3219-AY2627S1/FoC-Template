<!-- ChatGPT (Codex), 2026-10-30: Updated opening-hours behavior; human review pending. -->
<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-25 Asia/Singapore.
Scope: Document completed shared contract integration and validation facts.
Human review pending; exact prompts/results: usage-log.md. -->
# Order functionality integration

Main at 2c8a068 is merged. Lockfile conflicts are resolved and npm ci works.
The later human instruction to complete the remaining merge prerequisites
extended scope to the missing agreed shared contracts and dependency metadata.

## Completed build prerequisites

- Shared Credit protobuf, generated types, client and tests imported from
  origin/feat/credit-implementation at 006d5a7.
- Six RPCs: GetBalance, GetReservation, ReserveCredits, UpdateReservation,
  ReleaseCredits, SettleCredits; versioned receipts, totalCredits, bounded
  transport retry/deadline support and per-call metadata.
- Supplier validators/ID parser imported from order-supplier-gRPC and exported
  by @foc/grpc. Zod explicitly declared in shared package.
- Existing Credit scaffold extended with two UNIMPLEMENTED entries to compile
  against the agreed contract. No Credit business implementation imported.
- Normal repository build, Order tests and Docker build use tracked sources
  directly. No temporary dependency checkout or module override is needed.

## Runtime prerequisites

The teammate's implemented Credit runtime is still required for real credit
operations. This branch's Credit scaffold intentionally returns UNIMPLEMENTED.
User event/outbox and Supplier GetSupplier come from main. Use the same
JWT public key, Order/Credit token and configured gRPC addresses across services.
Apply Credit's own migrations using its README when that implementation lands.

Order owns the lifecycle APIs, state/ownership rules, PostgreSQL schema,
durable creation/edit/refund/settlement recovery and pickup. Creation validates
Supplier existence; pickup/delivery use saved snapshot. Missing Supplier
description is "-"; destination remains a string. No schema change was needed
for the later integration port or pickup addition.

No demo Postman folders or synthetic database fixtures are included in this PR.
Untracked postman 2 remains untouched. Peer service implementations and database
contents were not imported from d3-demo.

## Verification

Normal npm ci, repository build and User build passed. Shared gRPC tests 51,
Order units 16 and Order PostgreSQL integrations 61 passed with this branch's
actual contracts. Integration tests use real PostgreSQL with test-only peer
handlers; they do not certify the deployed Credit ledger. Docker check and
cleanup results are recorded in usage-log.md.

PR body and reproducible reviewer steps: [PR_DESCRIPTION.md](PR_DESCRIPTION.md).
