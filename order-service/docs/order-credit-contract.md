<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Summarised the Order → Credit message contract agreed by the Order Service author,
       matching the fields validated by credit-service/src/messages.ts on origin/branch_credit.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
Scope: Added credit.results.dlq and how Order Service handles redelivered and unusable replies;
       marked the Credit Service changes as done.
Author review of additional changes: Reviewed and approved by @phuc
-->

# Order ⇄ Credit Message Contract

Order Service tells Credit Service when to hold, pay out or release an errand's credits. Every
message goes through Kafka. Order Service writes each message to its outbox in the same
transaction as the errand change, so a committed state change always produces its message
(OS-F5.1.1, OS-NFR3.1).

| | Topic | Key | Producer | Consumer |
|---|---|---|---|---|
| Commands | `credit.commands` | `order_id` | Order Service | Credit Service |
| Replies | `credit.results` | `order_id` | Credit Service | Order Service |
| Unusable replies | `credit.results.dlq` | the reply's key | Order Service | people (inspection) |

## Message types sent by Order Service

| `type` | Meaning | Sent when the errand moves | Credit effect | `courier_id` | Reply |
|---|---|---|---|---|---|
| `ReserveRequested` | "Hold this much of the requester's credit for this errand." | created → `PENDING_RESERVATION` | available −X, reserved +X | not sent | `CreditReserved` or `CreditReservationRejected` |
| `OrderCompleted` | "The errand was delivered; pay the courier." | `DELIVERED` → `COMPLETED` (requester confirms, OS-F3.4)<br>`DELIVERED` → `COMPLETED` (confirmation deadline passes, OS-F3.5)<br>`DISPUTED` → `COMPLETED` (admin rules for courier, OS-F2.5.1) | **Capture:** requester reserved −X; courier available +X | **required**, ≠ `requester_id` | none |
| `OrderCancelled` | "The requester called it off; give the credits back." | `OPEN` → `CANCELLED` (OS-F2.1.1)<br>`ACCEPTED` → `CANCELLED` (OS-F2.2.1)<br>also sent for a late `CreditReserved` on a `RESERVATION_REJECTED` errand | **Release:** requester reserved −X, available +X | `null` | none |
| `OrderExpired` | "Nobody accepted it in time; give the credits back." | `OPEN` → `EXPIRED` (listing deadline passes, OS-F2.1.2) | **Release** | `null` | none |
| `OrderFailed` | "The dispute went to the requester; give the credits back." | `DISPUTED` → `FAILED` (admin rules for requester, OS-F2.5.2) | **Release** | `null` | none |
| `ReservationTimedOut` | "I gave up waiting for your reply to my `ReserveRequested`. If you hold credits for this errand, release them; if you don't, do nothing." | `PENDING_RESERVATION` → `RESERVATION_TIMED_OUT` (no reply within `RESERVATION_TIMEOUT_SECONDS`, default 30) | **Release** if a hold exists; otherwise none | not sent | none |

`OrderCompleted`, `OrderCancelled`, `OrderExpired` and `OrderFailed` are the **terminal
events** (OS-F5.1.2). `ReservationTimedOut` is the closing message for an errand that never
became visible. It's the only closing message that may be sent before `CreditReserved`, so it
must be harmless when no hold exists. Only these five messages move credits after the hold.

Non-terminal changes send nothing, and the hold stays in place:

- `OPEN` → `ACCEPTED` → `PICKED_UP` → `DELIVERED`
- `ACCEPTED` → `OPEN` (courier withdraws or misses the pickup deadline)
- any state → `DISPUTED`

## Fields

| Field | Type | `ReserveRequested` | Terminal events | `ReservationTimedOut` | Meaning |
|---|---|---|---|---|---|
| `type` | string | `"ReserveRequested"` | one of the four terminal types | `"ReservationTimedOut"` | Which credit operation to run |
| `schema_version` | integer | `1` | `1` | `1` | Message format version |
| `operation_id` | UUID | the errand's reservation operation ID | a new ID per terminal event | a new ID | Credit applies each operation once; a resent message keeps its ID |
| `order_id` | UUID | errand ID | errand ID | errand ID | Links the payout or release to the hold |
| `requester_id` | UUID | requester | requester | requester | Whose credits are held or released |
| `courier_id` | UUID or `null` | not sent | `OrderCompleted`: courier; others: `null` | not sent | Who is paid |
| `amount` | whole number | the errand's credit value | the same value | the same value | Must equal the held amount, if a hold exists |
| `occurred_at` | ISO-8601 string | time of the change | time of the change | time of the change | Logs and tracing only |

## Examples

```json
{ "type": "ReserveRequested", "schema_version": 1,
  "operation_id": "6f1c2a4e-8b1d-4f3a-9c2e-1a2b3c4d5e6f",
  "order_id": "0b7e9d10-3c4a-4e8f-a1b2-c3d4e5f60718",
  "requester_id": "a1111111-1111-4111-8111-111111111111",
  "amount": 10, "occurred_at": "2026-10-20T09:00:00Z" }
```

```json
{ "type": "OrderCompleted", "schema_version": 1,
  "operation_id": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
  "order_id": "0b7e9d10-3c4a-4e8f-a1b2-c3d4e5f60718",
  "requester_id": "a1111111-1111-4111-8111-111111111111",
  "courier_id": "b2222222-2222-4222-8222-222222222222",
  "amount": 10, "occurred_at": "2026-10-20T10:30:00Z" }
```

```json
{ "type": "OrderExpired", "schema_version": 1,
  "operation_id": "3e2d1c0b-9a8f-4e7d-a6c5-b4a392817f6e",
  "order_id": "0b7e9d10-3c4a-4e8f-a1b2-c3d4e5f60718",
  "requester_id": "a1111111-1111-4111-8111-111111111111",
  "courier_id": null,
  "amount": 10, "occurred_at": "2026-10-20T11:00:00Z" }
```

```json
{ "type": "ReservationTimedOut", "schema_version": 1,
  "operation_id": "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
  "order_id": "0b7e9d10-3c4a-4e8f-a1b2-c3d4e5f60718",
  "requester_id": "a1111111-1111-4111-8111-111111111111",
  "amount": 10, "occurred_at": "2026-10-20T09:00:30Z" }
```

## Replies sent by Credit Service (`credit.results`)

| `type` | Meaning | Order Service does |
|---|---|---|
| `CreditReserved` | The hold succeeded (`reservation_id` included) | `PENDING_RESERVATION` → `OPEN`. If the errand is already `RESERVATION_REJECTED`, sends `OrderCancelled` to release the hold. If it's already `RESERVATION_TIMED_OUT`, does nothing: the `ReservationTimedOut` already sent releases it. |
| `CreditReservationRejected` | No hold was made. `reason_code` is one of `INSUFFICIENT_CREDIT`, `ACCOUNT_NOT_FOUND`, `ACCOUNT_NOT_ACTIVE`, `INVALID_AMOUNT` | `PENDING_RESERVATION` → `RESERVATION_REJECTED`, reason stored. Ignored if the errand is already `OPEN` or `RESERVATION_TIMED_OUT`. |

Both replies carry `event_id`, `operation_id` (of the `ReserveRequested`), `order_id`,
`occurred_at` and `schema_version: 1`. The first outcome for an errand is final, whether that's
a reply or the timeout.

Order Service applies each `event_id` once: it records the `event_id` in the same transaction as
the reply's effect, so a redelivered reply changes nothing. It sends a reply to
`credit.results.dlq`, with the reason, when the reply is not valid JSON or fails the checks above,
when its Kafka key is not its `order_id`, when no errand has that `order_id`, when its
`operation_id` is not the errand's reservation operation, or when applying it fails 5 times in a
row for a reason other than an outage. A database or Kafka outage only delays the reply.

## Why the timeout can't strand credits

Every message for one errand uses `order_id` as its key, and each topic has one partition. So
Credit always reads an errand's `ReserveRequested` before its `ReservationTimedOut`, even if
Credit was down while both were queued, or Order's outbox sent them late. By the time Credit
handles the timeout, it has either made the hold, which the timeout releases, or rejected the
request, so the timeout has nothing to do. If Credit crashes after rejecting but before saving
its progress, it reads the `ReserveRequested` again and may now accept it. That's still fine:
the `ReservationTimedOut` comes after it and releases the new hold.

## Rules Order Service follows

1. **One `ReserveRequested` per errand.** Any resend reuses its `operation_id`. Credit allows one
   hold per `order_id`, and a new ID would get no reply.
2. **At most one closing message per errand**: one terminal event or one `ReservationTimedOut`,
   never both. The single exception is the `OrderCancelled` sent for a late `CreditReserved` on a
   `RESERVATION_REJECTED` errand. Credit treats a second, different closing message for a hold
   that's already finalised as a conflict and sends it to `credit.commands.dlq`.
3. **No terminal event before `CreditReserved`.** There's nothing to release yet, so an errand
   can't be cancelled while it's `PENDING_RESERVATION`. `ReservationTimedOut` is the only closing
   message allowed before a reply.
4. **`requester_id` and `amount` on a closing message match the `ReserveRequested`.** If they
   don't, Credit rejects the message and changes no balances.
5. **Messages for one errand are published in the order they were written.** One partition per
   topic plus the `order_id` key keep that order through Kafka.

## Changes needed in Credit Service (done)

Done in Credit Service (`credit-service/src/reservations.ts`, migration `0002`). The branch
`origin/branch_credit` handled everything above except `ReservationTimedOut`. Adding it took:

1. **`src/messages.ts`.** Accept `type: "ReservationTimedOut"` with `operation_id`, `order_id`,
   `requester_id` and `amount`, and no `courier_id`.
2. **A handler in `src/reservations.ts`**, in one transaction:
   - `SELECT … FROM credit_reservations WHERE order_id = $1 FOR UPDATE`.
   - **No reservation:** do nothing and commit the offset. Not an error, and nothing goes to the DLQ.
   - **`HELD`:** check `requester_id` and `amount` against the reservation, as for terminal events.
     Then release (requester reserved −X, available +X), write a `RELEASE` transaction row, and set
     `status = 'RELEASED'`, `closed_by = 'TIMED_OUT'`.
   - **Already finalised:** if this `operation_id` is already recorded, it's a duplicate and is
     ignored. Otherwise it's a conflict and goes to the DLQ, the same as for terminal events.
   - A redelivery in the no-reservation case simply does nothing again, so it needs no record.
3. **Migration `0002`.** Widen `credit_reservations.closed_by`'s `CHECK` to include `'TIMED_OUT'`.
   Today it allows only `COMPLETED`, `CANCELLED`, `EXPIRED` and `FAILED`.
