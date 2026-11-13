# Durable dispute coordination — version 1

This replaces the synchronous dispute **writes** in `dispute-review-contract.md`.
Approved by Darryl on 10 November 2026. Single implementation/shared editor: this Admin task.
Owners: Darryl (Admin/User), XueTing (Order), Eldridge (Chat/Credit), Jun Hui (Kafka/infrastructure).
Implementation approval is not affected-owner review or production acceptance. AWS deployment,
publication, commit and merge are outside this task. Existing evidence, conversation creation,
current-account authorization and unrelated producer APIs retain their owners and behavior.

## Timing and authority

Submitting a report commits an Admin preparation and command outbox, returning HTTP 202.
It does not promise that the errand is already paused. Order freezes under its own order lock
when it processes the command. Ordinary actions committed before that boundary remain valid;
actions after it are blocked locally, including expiry. Chat independently commits its barrier.
Admin accepts the statement and enables assignment only after both owner confirmations.
The UI calls the interval **Preparing review** and polls the private local status.
The report-context endpoint returns `REPORT_REQUEST_AVAILABLE` for a new request without asserting
reporting eligibility or disclosing an existing case. It requires no Chat lookup. This is the
canonical replacement for the former PREPARATION_AVAILABLE spelling; consumers accept that former
spelling during rollout, while new producers emit REPORT_REQUEST_AVAILABLE. Pending private
status (PREPARING_REVIEW) reveals only the caller's saved preparation until Order verifies
membership, and takes precedence over general verified-participant navigation.

Admin authenticates the original HTTP user and records only their UUID and effective role.
No JWT, bearer credential, password, private key, report description or decision text enters
Kafka. Producer-owned topics and SASL ACLs identify the requesting service. Consumers validate
the topic/producer/type and all operation identities; each owner rechecks current User account
authorization before opening its local mutation transaction. Order verifies requester/current
or historical courier membership itself. ADMIN freeze commands support older-case reconciliation;
actual claiming and decisions still require an independent reviewer and complete current evidence.
Order independently rejects settlement requested by a requester or historical courier reviewer.
Chat also reads Admin's existing case-access API to verify the current reviewer, order and closure
operation before draining private conversations; this read happens outside its mutation transaction.

## Wire envelope

All records use the errand UUID as Kafka key and UTF-8 JSON values:

```json
{
  "eventId": "00000000-0000-4000-8000-000000000001",
  "eventVersion": 1,
  "type": "PrepareReview",
  "producer": "admin-service",
  "operationId": "00000000-0000-4000-8000-000000000002",
  "caseId": "00000000-0000-4000-8000-000000000003",
  "orderId": "00000000-0000-4000-8000-000000000004",
  "actorId": "00000000-0000-4000-8000-000000000005",
  "actorRole": "REQUESTER",
  "occurredAt": "2026-11-10T06:00:00Z",
  "data": {"intent": "REPORT"}
}
```

UUID fields are required; role is REQUESTER, COURIER or ADMIN. Version is exactly 1.
An output preserves operation/case/order/actor/role from its command. Operation IDs come from
the original HTTP idempotency key; they survive restart, timeout and redelivery. The first request
binds its actor/body/revision permanently. An event ID is deterministic per producer/type/operation.
The original serialized envelope and timestamp are stored, never regenerated on transport retry.

| Producer/topic | Type | Consumers | Data and outcome |
| --- | --- | --- | --- |
| Admin / `admin.dispute.commands` | `PrepareReview` | Order, Chat | `intent`: REPORT or LEGACY; no private statement text |
| Order / `order.dispute.events` | `OrderReviewFrozen` | Admin, Chat | `orderId`, `caseId`, `requesterId`, nullable `courierId`, lifecycle `state`, nullable `creditStatus`, `resolved`, complete historical `participants` UUID array |
| Chat / `chat.dispute.events` | `ErrandReviewPrepared` | Admin | `readOnly: true`, `orderConfirmationId` matching the frozen event |
| Admin / `admin.dispute.commands` | `PrepareResolution` | Order, Chat | `disposition`: RETURN_TO_REQUESTER, PAY_COURIER or KEEP_EXISTING; ADMIN role |
| Chat / `chat.dispute.events` | `CaseClosurePrepared` | Admin, Order | `readOnly: true`; all in-flight private-case message/upload transactions drained |
| Order / `order.dispute.commands` | `SettleDisputeCredits` | Credit | authoritative `requesterId`, nullable `courierId`, original `disposition`; ADMIN role |
| Credit / `credit.dispute.events` | `DisputeCreditsSettled` | Order | `operationId`, `caseId`, `orderId`, `requesterId`, nullable `courierId`, `disposition`, `reservationStatus`, `complete: true` |
| Order / `order.dispute.events` | `OrderDisputeFinalized` | Admin | frozen-review fields plus `disposition`, `creditConfirmationId`, `resolved: true` |

Chat waits for both the Admin intent and the matching Order fact before freezing errand chat.
Order waits for both Admin's decision intent and Chat's closure confirmation before asking Credit.
Credit alone mutates reservations, accounts and ledger; its effect, receipt and outcome outbox
share one database transaction. Order finalizes only after the matching Credit confirmation,
preserving the existing terminal-state and `CreditEffect.NONE` rules. Admin closes only after
matching Chat and Order confirmations. No consumer substitutes timeouts or empty results for facts.

Admin checks the chosen credit disposition against its committed Order freeze confirmation before
creating the immutable closure preparation. Because Order has frozen the errand and rejected
unconfirmed credit effects, this is an authoritative local validation, not a synchronous write.
Order and Credit independently revalidate at consumption.

Admin validates complete fresh evidence, reviewer independence and settled prior actions when
accepting the decision. This immutable acceptance snapshot is retained. Final closure records its
revision/coverage and the actual owner-confirmation envelopes separately; it does not fabricate a
new fresh timeline. The closure preparation blocks subsequent Admin writes. Current account
authorization and reviewer/case/operation identity are checked again when outcomes are applied.

## Delivery, duplicates, conflicts and recovery

Each service owns `dispute_inbox`, `dispute_operations`, `dispute_outbox`, and
`dispute_quarantine` in **its own database**. No service reads another database.

* Kafka offsets are acknowledged only after the raw validated inbox or metadata-only quarantine
  commits. Database failures keep the offset unacknowledged with unlimited bounded-backoff retry.
* Inbox workers claim bounded, expiring leases. Current-account HTTP reads happen before opening
  the mutation transaction. Owner effects, immutable stage records, outcome outbox and completion
  marker commit together. An operation advisory lock serializes out-of-order stages across replicas.
* Event-ID replays must be byte-identical. A different event ID cannot change the stage fingerprint.
  Conflicting/malformed input never changes domain facts. Invalid broker input is quarantined;
  invalid/conflicting owner operations remain visibly pending with an error code for reconciliation.
  Valid shared-topic types intended for another logical consumer are marked done without
  authorization calls or domain effects, rather than becoming retrying commands.
* Command outboxes republish their original envelopes every minute until matching confirmations.
  Duplicate commands replay recorded owner outcomes without repeating effects. Expired publisher
  leases recover after crashes. A lost Kafka acknowledgement never counts as business completion.
* No automatic unfreeze, decision substitution, credit outcome selection, key rotation or database
  reset occurs. Authorization outages/denials, domain conflicts and incomplete outcomes remain
  pending. An operator investigates the retained operation and original request before resuming.
  Existing pending HTTP-era preparations require explicit reconciliation; they are not silently
  treated as completed, deleted, or reauthorized under a different actor.

## Broker and runtime

The five topics have three partitions and seven-day retention under the existing local convention.
Only Admin writes `admin.dispute.commands`, Order writes its commands/events, Chat writes its
events and Credit writes its events. Consumers receive only their listed reads and their own
`{service}-disputes` group. Kafka UI retains inspection-only access. Applications cannot create topics.
The initializer adds these ACLs idempotently without replacing broker credentials or volumes.

The obsolete Admin→Order and Order→Credit write URLs, dedicated HTTP controllers/security chains,
and exclusively used trust pins/network edges are removed. Existing service identities and pins
needed by current-account authorization, evidence reads and private conversation APIs remain.
Applied migrations are retained; forward migrations add coordination storage.

## Observability and acceptance

Logs contain operation/event UUIDs, type and stable failure codes, never payloads or credentials.
Inspect pending inbox attempts, lease expiry, `last_error`, oldest active outbox age, quarantine
metadata and Admin preparations by operation/case/order UUID. Published outboxes alone do not
prove owner completion. The retained original request and confirmations support reconciliation.

Verification must cover duplicate/concurrent and out-of-order delivery, conflicting identities,
crash recovery, account revocation/outage, freeze/action serialization, Chat writer draining,
Credit exactly-once ledger effects, and no premature Admin acceptance/closure. Affected-owner
review remains required before merge and shared deployment; local preview is the user-authorized
test target only. No production integration acceptance is claimed here.
