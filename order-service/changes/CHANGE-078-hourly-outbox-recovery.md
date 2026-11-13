# CHANGE-078: Hourly outbox recovery poll

- Date: 2026-10-08
- Owner: Yao Xiang, Developer 1
- Status: Implemented; static checks complete; automated tests not run
- Approval: User asked to run the failed-publication scheduler hourly
- Decision: ADR-023

## Behavior

OrderOutboxAfterCommitListener still invokes the dispatcher immediately after a successful transaction commit. OrderOutboxScheduler independently polls for due/unpublished outbox rows once per hour using 0 0 * * * *. The scheduler is recovery for failed or interrupted attempts, not the normal event trigger. Existing outbox leases/retry timestamps remain unchanged. Expiry remains on its 15-minute cadence and automatic completion remains on its one-minute cadence.

A failed publish may wait nearly an hour for the next pass while the service is running. Cloud Run scale-to-zero/request-based CPU can delay recovery further while idle. The decision does not change Order status behavior, delivery guarantees, peer consumers, database schema, APIs, or frontend code.

## Changed artifacts

- Scheduler annotation and application fallback.
- Root .env.example, root compose.yaml, staging/production environment values.
- Existing scheduler cadence test hourly boundary expectations (not executed).
- Architecture, sequence, requirement/traceability, README, active-sprint and handoff records.
- ADR-023 and architecture-evolution/AI usage records.

## Verification

Source/configuration/reference inspection and git diff --check only. Maven tests and container/cloud scheduling were not run. No deployment or cloud operation was performed.
