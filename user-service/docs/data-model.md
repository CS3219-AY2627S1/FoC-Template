# user-service Data Model

Data model of **user-service** only. For how this service fits among the
others, see the repo-root [`docs/architecture.md`](../../docs/architecture.md);
for the API contract see [`api-contract.md`](./api-contract.md).

## Data model

### Title: user-db entity-relationship diagram

Every column below is taken directly from the ORM models in `app/models/`.
`user-db` holds three tables; the service owns this database and never reads
another service's data (DB-per-service).

```mermaid
erDiagram
    users ||--o{ email_otps : "has"
    users {
        string   id              PK "primary key: uuid4 hex"
        string   email              "not null, unique, indexed"
        string   password_hash      "not null (bcrypt)"
        boolean  email_verified     "not null, default false"
        string   display_name       "not null, <= 50 chars"
        string   contact_number     "nullable, <= 8 chars"
        string   role               "not null, default client (admin|client)"
        boolean  is_suspended       "not null, default false"
        datetime created_at         "not null"
    }
    email_otps {
        string   id              PK "primary key: uuid4 hex"
        string   user_id         FK "not null, indexed, -> users.id (ON DELETE CASCADE)"
        string   purpose            "not null (email_verification|password_reset)"
        string   code_hash          "not null (hashed OTP)"
        int      attempts           "not null, default 0"
        datetime expires_at         "not null"
        datetime consumed_at        "nullable (set when the OTP is used)"
        datetime created_at         "not null"
    }
    event_outbox {
        string   id              PK "primary key: uuid4 hex"
        string   event_type         "not null, indexed"
        string   aggregate_id       "not null, indexed (logical ref to users.id, no FK)"
        text     payload            "not null (serialized event JSON)"
        int      attempts           "not null, default 0"
        string   last_error         "nullable"
        datetime created_at         "not null"
        datetime published_at       "nullable (null until broker ack)"
    }
```

### Legend

| Notation | Meaning |
| --- | --- |
| `PK` | Primary key. |
| `FK` | Foreign key. |
| `indexed` | Column has a database index (`index=True` on the `mapped_column`). |
| `users \|\|--o{ email_otps` | One user has zero or more OTP codes. |

### Explained elements

- **OTP lifecycle.** `email_otps` serves both email verification and password
  reset, distinguished by `purpose`. A code is hashed at rest (`code_hash`),
  rate-limited via `attempts`, expired by `expires_at`, and single-use via
  `consumed_at`. Rows cascade-delete with their user.
- **Transactional outbox.** `event_outbox` decouples the registration write
  from RabbitMQ publication. `UserRegistered` is written to the outbox in the
  same transaction as the user row; a background worker publishes unpublished
  rows (`published_at IS NULL`) and records `attempts` / `last_error` on retry.
  `aggregate_id` holds the user id as a value, not a database foreign key.
- **No cross-database foreign keys.** The credit balance lives in
  `credit-service`; it is referenced by user id over events/HTTP, never by a
  cross-DB FK, keeping services independently deployable.
