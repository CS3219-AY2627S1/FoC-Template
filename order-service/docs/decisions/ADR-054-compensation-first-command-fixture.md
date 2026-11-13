# ADR-054: Compensation-first command recovery, fixture milestone

- Date/approver: 2026-10-26 / Vincent, explicit branch, ABORT restoration and
  contract-fixture choices. CHANGE-156; FEEDBACK-017.
- Status: APPROVED fixture milestone, live compensation integration DISABLED.
- Supersession: opt-in `order.commands.recovery-policy=compensate` replaces
  forward retry for newly registered fixture commands only. Default/live `retry`
  and historical ADR-035 commands are not reinterpreted or deleted.

## Safety rules

1. Commit immutable command/key/candidate/policy/deadline before peer I/O.
2. Use one initial keyed Credit operation. After uncertainty, never replay it
   to force success or to create a missing binding just for compensation.
3. Persist Credit SUCCESS separately as an observation. It is not final success.
4. All required local Order/checkpoint/receipt/outbox writes and terminal command
   SUCCESS commit together. Function return/response delivery is not the boundary.
5. Finalize and choose compensation under the same command row lock. A compensation
   decision revokes owner/generation before outbox enqueue in that same transaction.
   Once chosen it is absorbing; late workers/responses cannot finalize success.
6. Timeout, lost result or local commit failure requests compensation durably.
   If commit acknowledgment was lost, reread the authoritative row first: an
   already committed SUCCESS must never be compensated.
7. The minute sweep compensates overdue unresolved commands with expired/no lease;
   never steals active work. It retries compensation delivery, never the original
   financial effect. An observed SUCCESS with pending local finalization also expires.
8. Credit's matching result is required before FULLY_COMPENSATED. Broker publish/ACK
   alone is not financial proof. An authoritative no-effect failure may close
   directly; RECONCILIATION_REQUIRED stays unresolved and blocks competitors.
9. Original key K remains; compensation ID C and result event ID R are separate
   stable IDs. Late HTTP executes must lose to a Credit tombstone even if no
   original Credit record existed. Generation alone is insufficient.
10. CLEAR_COURIER requires a saved exact prior assignment and conditional revision
    restoration; never blindly reassign by UID. This capability is missing today.

One remote step has PENDING/SUCCESS/FAILED/COMPENSATED. Finalization has
PENDING/SUCCESS/FULLY_COMPENSATED; the latter also closes confirmed no-effect
rejections without pretending a financial undo occurred. Keep existing public
PENDING/COMPLETED and SUCCESS/REJECTED so saved browser keys and polling work.

## Communication choice

User selects hybrid: synchronous initial Credit request, durable compensation
request and result via Pub/Sub. Polling remains for frontend status. Internal
events only wake a durable outbox; they cannot cross a process crash. Pure HTTP
compensation requires user authorization after a crash and was explicitly replaced
for this slice. Pure query cannot reverse/fence anything. Durable broker adds two
channels, result inbox, Credit outbox, IAM and DLQ/redrive operational cost.

Push is at least once; design assumes duplicates and arbitrary ordering. Both
services atomically deduplicate with their business writes and outgoing intents.
Financial states never become terminal merely because delivery retries exhaust.

## Live gate and rollout

Compensate policy is permitted only in explicitly selected mock/contract-fixture
mode. HTTP mode fails closed before creating a command or calling Credit. No new
public unauthenticated push endpoint is exposed. Real Pub/Sub producer/consumer,
dedicated Google OIDC chain, environment topics and Credit verification remain a
separate activation gate. Do not enable a live fixture or delete old HTTP result/
compensation endpoints while earlier commands exist. V15 is additive; preserve
V1-V14 and existing financial/penalty outboxes. Automatic legacy repost is refused
under compensate policy; delegated original-request authorization remains deferred.

Full schemas, algorithms, races, rollout and provider work:
[handoff](../../concurrency/compensation-workflow-handoff.md).
Current class responsibilities: [diagram](../diagrams/compensation-first-commands.mmd).
