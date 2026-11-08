# Database schema

Drizzle owns the schema. `src/database/schema.ts` is the source; `npm run db:generate` writes migrations to `drizzle/`, and the migrate Job runs them before each deploy (ADR-0011). Migrations `0000` through `0003` produce the tables below; `0001` added `rating_grant.skipped_at`, `0002` added `deleted_user` and made `rating.rater_id` nullable, and `0003` added `rating_grant_pending_idx`. There are no foreign keys: order and user ids are plain UUIDs from other services.

`rating` is the record of what was submitted. `user_rating` is a running total derived from it, kept so a read is one row instead of an aggregate; it can be rebuilt from `rating` if needed.

## rating_grant

One row per `rating.permission.granted` from Order: this rater may rate this ratee for this order.

| Column | Type | Notes |
| --- | --- | --- |
| order_id | UUID | |
| rater_id | UUID | |
| rater_role | rating_role | `COURIER` or `REQUESTER` |
| ratee_id | UUID | |
| ratee_role | rating_role | |
| event_id | UUID | Order's `eventId`. Unique |
| granted_at | TIMESTAMPTZ | When Rating stored it |
| skipped_at | TIMESTAMPTZ | Set when the rater skips in the modal. Hides the grant from `/me/pending`; the grant can still be used |

Primary key `(order_id, rater_id)`. Together with the unique `event_id`, a redelivered or repeated grant inserts nothing. Partial index `rating_grant_pending_idx` on `(rater_id, granted_at)` where `skipped_at IS NULL` serves `GET /me/pending`, which looks grants up by rater; the primary key starts with `order_id`, so it can't. A grant with a matching `rating` row is used. Rows are deleted only when the rater or ratee deletes their account.

## rating

Every submitted rating, kept for disputes or recomputing.

| Column | Type | Notes |
| --- | --- | --- |
| rating_id | BIGSERIAL | Primary key |
| order_id | UUID | |
| rater_id | UUID | Null once the rater deleted their account; the score still counts |
| rater_role | rating_role | Copied from the grant |
| ratee_id | UUID | Copied from the grant |
| ratee_role | rating_role | Copied from the grant |
| score | SMALLINT | Check `rating_score_range`: between 1 and 5 |
| comment | TEXT | Null when blank |
| created_at | TIMESTAMPTZ | |

Unique `rating_order_rater_unique` on `(order_id, rater_id)`: one rating per grant. Postgres treats nulls as distinct, so anonymised ratings never collide. Index `rating_ratee_idx` on `ratee_id`.

## user_rating

One row per rated user: the running sum and count behind the unified average. Updated in the same transaction as the `rating` insert, by one upsert that adds to the stored values.

| Column | Type | Notes |
| --- | --- | --- |
| user_id | UUID | Primary key |
| rating_sum | INTEGER | Check `>= 0` |
| rating_count | INTEGER | Check `>= 0` |
| updated_at | TIMESTAMPTZ | |

The average is `rating_sum / rating_count`, rounded to 2 decimal places when read. A user with no row has a null average.

## outbox

Delivery buffer for Kafka. Written in the same transaction as the rating, so a message is published only for a rating that committed.

| Column | Type | Notes |
| --- | --- | --- |
| outbox_id | BIGSERIAL | Primary key. Relay order |
| topic | TEXT | `foc.user.rating` |
| message_key | TEXT | The ratee's user id |
| payload | JSONB | `user.rating.updated` |
| created_at | TIMESTAMPTZ | |
| sent_at | TIMESTAMPTZ | Null until the broker accepts the record |

Partial index `outbox_unsent_idx` on `outbox_id` where `sent_at IS NULL`. Rows sent more than `OUTBOX_RETENTION_HOURS` (default 7 days) ago are deleted every `OUTBOX_PURGE_MS` (default hourly). Unsent rows are never deleted.

## deleted_user

Users whose account was deleted (`UserDeleted` on `foc.user.status`). Their grants, received ratings and `user_rating` row are removed and the ratings they gave are anonymised; this row stays so a late or replayed grant naming them is ignored.

| Column | Type | Notes |
| --- | --- | --- |
| user_id | UUID | Primary key. A repeated `UserDeleted` is a no-op |
| deleted_at | TIMESTAMPTZ | When Rating applied the deletion |

## Enums

| Type | Values |
| --- | --- |
| rating_role | `COURIER`, `REQUESTER` |
