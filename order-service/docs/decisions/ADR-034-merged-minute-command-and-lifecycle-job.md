# ADR-034: Recovery-first shared minute scheduler

Effective integration follow-up: ADR-035 / CHANGE-104 enables the actual HTTP
Credit gateway without changing phase order or cadence. Tokenless HTTP recovery
defers to user-assisted authorization; original mock-only references are history.

- Date / approver: 2026-10-10 / Vincent, explicit scheduler merge request and
  confirmation of `sprint-2-3-credit-service-concurrency-update-event-payload`.
- Status: APPROVED; implementation/verification tracked by CHANGE-102.
- Classification: approved internal orchestration design refinement.
- Supersedes: ADR-033's separate command timer and ADR-026's two-phase minute
  job only. All underlying recovery/deadline/transaction/outbox rules remain.

## Effective sequence and responsibilities

One nontransactional `OrderLifecycleScheduler.processDueOrders()` is scheduled
by `order.lifecycle.cron` / ORDER_LIFECYCLE_CRON (default `0 * * * * *`).
Within one invocation it synchronously executes:

1. `OrderCommandService.recoverDue()` (existing mode/flag/gateway gate).
2. `LifecycleProcessingService.expireDue(now)`.
3. `LifecycleProcessingService.autoCompleteDue(now)`.

Capture one lifecycle time after recovery and share it between checks 2/3.
Catch/log RuntimeException independently around each phase, so an unavailable
recovery scan or expiry pass does not suppress later phases or the next tick.
Remove the independent OrderCommandRecoveryScheduler. `order.commands.cron`
no longer controls a job; use the lifecycle cron to disable the merged timer.
Keep command enabled/lease/retry/batch settings and the HTTP recovery hard gate.
No new transaction wraps the tick/batch. Each item's existing transaction,
order lock, pending-command guard and lease/generation fencing remain.

Recovery resolves a command, not necessarily a successful acceptance. At/after
deadline it must preserve ADR-033 compensation/fencing policy; unresolved work
continues to block expiry. Sequential orchestration is NOT protection against
browser requests or another replica; the durable guards remain mandatory.

## Alternatives and operational limits

Separate jobs permit independent cadence/executors; merging gives explicit
recovery-before-expiry order and simpler minute scheduling. Slow recovery can
delay lifecycle checks. Existing recovery batch and network timeouts remain;
no unapproved new batching, parallelism, lease renewal or throughput guarantee.
Cloud Run idle/scale-to-zero behavior still needs operational review. No cloud
cost/execution change, no tokens persisted, no unattended live authorization.

Outbox remains independently scheduled every 15 minutes with immediate
after-commit publication. Automatic repost/background retry changes are outside
this slice. No endpoint, event/topic, peer, schema or frontend change.

## Traceability, tests and rollback

F3/F4.1.1/F13 acceptance; F4.1.8/F10 expiry; F4.1.5/F5.1 completion;
ADR-020/026/033; NFR3/NFR4. Verify one timer, phase order,
captured lifecycle time, independent failures/repeated ticks, existing due/lease/
guard/compensation PostgreSQL regressions and unchanged HTTP gate.
Effective class/sequence: scheduler -> command coordinator -> lifecycle expiry
worker -> lifecycle completion worker; existing data model/contracts unchanged.
Rollback: restore separate scheduler/constructor and its prior cadence tests;
retain all commands/orders/outbox records. No database rollback is needed.
