# credit-service Data Model

Data model of **credit-service** only. For how this service fits among the
others, see the repo-root [`docs/architecture.md`](../../docs/architecture.md);
for the API contract and events see [`../README.md`](../README.md).

## Entity-relationship diagram

Every column below is taken directly from the ORM models in `app/models/`.
`credit-db` holds four tables; the service owns this database and never reads
another service's data (DB-per-service).

```mermaid
erDiagram
    credit_accounts ||--o{ credit_reservations : "holds"
    credit_accounts {
        string   user_id          PK "one account per user (= user-service user id)"
        int      available_balance   "not null, default 0, CHECK >= 0"
        int      reserved_balance    "not null, default 0, CHECK >= 0"
        datetime created_at          "not null"
        datetime updated_at          "not null, onupdate"
    }
    credit_reservations {
        string   id               PK "uuid4 hex"
        string   user_id          FK "not null, indexed, -> credit_accounts.user_id"
        string   order_id            "not null, indexed, UNIQUE (one reservation per order)"
        int      amount              "not null, CHECK > 0"
        string   status              "not null, default reserved (reserved|transferred|released)"
        datetime created_at          "not null"
        datetime updated_at          "not null, onupdate"
    }
    credit_transactions {
        string   id                   PK "uuid4 hex"
        string   user_id                 "not null, indexed (account whose balance changed)"
        string   counterparty_user_id    "nullable (other associated user, if any)"
        string   reservation_id          "nullable (value ref, no FK)"
        string   order_id                "nullable (value ref, no FK)"
        string   kind                    "not null (allocation|reservation|amendment|transfer|release)"
        int      amount                  "not null, signed (+ income, - outflow, 0 settlement)"
        datetime created_at              "not null, indexed"
    }
    credit_task_results {
        string   task_id          PK "Order Service task id (idempotency key)"
        string   kind                "not null (release|amend|transfer)"
        string   reservation_id      "not null, indexed"
        string   order_id            "not null, indexed"
        string   requester_id        "not null"
        string   outcome             "not null (released|release_failed|amended|amend_rejected|transferred|transfer_failed)"
        int      amount              "nullable"
        string   reason              "nullable"
        datetime created_at          "not null"
        datetime updated_at          "not null, onupdate"
    }
```

### Legend

| Notation | Meaning |
| --- | --- |
| `PK` | Primary key. |
| `FK` | Foreign key. |
| `indexed` | Column has a database index. |
| `credit_accounts \|\|--o{ credit_reservations` | One account holds zero or more reservations. |

## Reservation lifecycle

A reservation is created `RESERVED` when an order is placed, then moves to a
single terminal state. The status set is fixed by `ReservationStatus`
(`app/models/reservation.py`); the unique `order_id` makes completion handling
idempotent (Credit F3.2.1).

```mermaid
stateDiagram-v2
    [*] --> RESERVED : reserve on order created (available to reserved)
    RESERVED --> TRANSFERRED : order completed / approved (reserved to courier available)
    RESERVED --> RELEASED : order cancelled / expired / deletion (reserved to available)
    TRANSFERRED --> [*]
    RELEASED --> [*]
    note right of RESERVED
        Courier withdrawal is a no-op: credits stay RESERVED (F4.1.2)
    end note
```

## Explained elements

- **Balances as invariants.** `available_balance` and `reserved_balance` each
  carry a DB `CHECK >= 0` (Credit N1.1.1). A reservation moves credits from
  available to reserved; a transfer moves them from the requester's reserved
  to the courier's available; a release returns them to available.
- **No cross-database foreign keys.** `user_id`, `order_id`, and
  `counterparty_user_id` are values owned by other services, referenced by id,
  never by a cross-DB FK. Only `credit_reservations.user_id -> credit_accounts.user_id`
  is a real foreign key, because both tables live in `credit-db`.
- **Idempotency by `task_id`.** `credit_task_results` records the outcome of
  each Order Service task so a redelivered event republishes the stored reply
  instead of applying a second release, amendment, or transfer.
- **Signed transaction amounts.** `credit_transactions.amount` is signed:
  positive is income, negative is outflow, zero settles an already-recorded
  outflow. This gives a complete, append-only history (Credit F5).
