# ADR-023: Hourly transactional-outbox recovery scan

> Superseded recovery cadence/settings: ADR-026 / CHANGE-083 runs every
> 15 minutes with immediate after-commit dispatch retained.

- Status: Accepted by explicit user direction; configuration and documentation updated; automated tests not run
- Date: 2026-10-08
- Owner: Order Service
- Related change: CHANGE-078
- Supersedes: the five-minute pending-event recovery interval in ADR-022/CHANGE-077; preserves ADR-013 immediate after-commit dispatch

## Context

The transactional outbox records event intent atomically with the Order transition. After the database commits, OrderOutboxAfterCommitListener immediately asks the dispatcher to publish that event. The separate OrderOutboxScheduler scans durable pending rows and expired leases to recover publication attempts that failed or were interrupted. The immediate listener is event-triggered; it does not run periodically.

## Decision

Set ORDER_OUTBOX_RECOVERY_CRON to 0 0 * * * * by default: run the recovery scan at the start of each hour. Keep immediate after-commit dispatch unchanged. Keep OPEN-order expiry every 15 minutes and delivered-order auto-completion every minute. Retry timestamps, exponential backoff, leases, database selection, and outbox retention are unchanged.

## Consequences and trade-offs

This reduces periodic database scans based on the user's expectation that publish failures are uncommon. When an immediate publication fails, the stored outbox event remains eligible for recovery, but its next attempt may wait nearly an hour for the next top-of-hour pass while the service is running, in addition to any delay from scheduler load or an active lease. The database transaction and order transition are not rolled back for a publish failure.

Cloud Run currently scales to zero and uses request-based CPU; an in-process Spring scheduler is not guaranteed to run while the instance is idle. Recovery may therefore take longer than an hour until the service receives traffic or is otherwise running. This decision does not change the deployment execution model.

## Scope

Order Service configuration and documentation only. Event schemas, APIs, consumers, persistence schema, and frontend behavior do not change.
