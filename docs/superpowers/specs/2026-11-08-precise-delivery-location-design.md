<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-08
Scope: Formatted the team's chat decisions of 2026-11-08 into a spec for precise delivery
       location. Every decision below is quoted or paraphrased from the team's chat answers;
       items the team did not decide are listed under "Not yet decided by the team". No
       requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# Precise delivery location — spec (approved by the team in chat, 2026-11-08)

**Branch:** `add-precise-delivery-location` (from `main`; the team asked for the name "add precise
delivery location", and git branch names cannot contain spaces). **Touches:** `order-service`,
`user-service`, `frontend`. **Size:** Big (schema changes in two services, new endpoints, changed
order API contract).

Plan: [`../plans/2026-11-08-precise-delivery-location.md`](../plans/2026-11-08-precise-delivery-location.md). No open questions remain (§6).

## 1. Scope

On the request form, the "Deliver to" dropdown stays (system-defined locations, each with an id).
A free-text box below it lets the requester type the exact delivery details. The user-service
remembers each user's last submitted location id and details. A new request offers a one-click
prompt to reuse them. The details are shown wherever the location name is shown.

## 2. Team decisions

Source for every row: the team's chat answers, 2026-11-08. IDs are local to this spec.

| ID | Decision |
|---|---|
| P1 | `order-service` `requests` gets a new column `deliveryDetails`: free text, NOT NULL, maximum 250 characters. |
| P2 | Existing orders get the value `Nil` in the migration. `Nil` is also the column default. |
| P3 | `user-service` gets a new table `last_request`, keyed by the user's UUID like `user_bookmarks`. |
| P4 | `last_request` holds `last_req_del_loc_id` (INTEGER, nullable, same meaning as the order's `deliveryLocationId`) and `last_req_del_loc_details` (free text, NOT NULL, maximum 250 characters, same meaning as `deliveryDetails`), plus an updated-at timestamp like the bookmarks table's timestamp. The two fields are always used together. |
| P5 | The user-service owns the table and its endpoints. The order-service does not call the user-service and the user-service does not call the order-service. |
| P6 | Two new user-service endpoints: one reads the row, one updates it. Both follow the existing `user_bookmarks` conventions (the `/users/me/*` routes, `authenticate`, id taken from the token, never from the request). |
| P7 | An authenticated user can only read and update their own row. No role restriction beyond being authenticated. |
| P8 | If the row does not exist, read answers `200` with null values so no flow is blocked. A successful request submission populates the row. |
| P9 | The 250-character limit is enforced at the database level and in the API, in both services. The frontend also stops input after 250 characters. If that is bypassed, the API answers `400`. |
| P10 | `deliveryDetails` is compulsory on order create and on order edit. The location id is not re-validated by the update endpoint; the ids come from the form, which is filled from the real list. |
| P11 | The frontend reads the stored values when the new-request form opens. On submission it calls the update endpoint. Editing an existing order also calls the update endpoint. |
| P12 | The update call is asynchronous, runs in parallel with the order call, is unrelated to the order's outcome, and shows no error to the user. It goes ahead even if the order is rejected, so the stored row records the user's last submitted state and is a recovery if the order fails. |
| P13 | The reuse prompt is shown only on the new-request form, never on the edit form. It is not shown when the stored location id is no longer in the location dropdown. |
| P14 | Clicking the prompt's button prefills both the location selector and the free-text field. |
| P15 | Empty and whitespace-only values are blocked on the frontend. Leading and trailing spaces are trimmed before the value is stored in the database (P22). |
| P16 | Error codes and messages for `deliveryDetails` follow the existing order-service naming and message style (`MISSING_…` / `INVALID_…` in `constants/errors.ts`). |
| P17 | The order's `deliveryDetails` is displayed together with the location name everywhere the frontend uses `deliveryLocationId` to look up the name. |
| P18 | The prompt is a separate "tips" card on the new-request form, below the "Deliver to" label and above the "Choose a drop-off point" selector. Heading: "Delivering to the same location?". Body: the rendered location name and details. A "Confirm" button. |
| P19 | A `last_request` row is created at registration with the default values `Nil`. When the read endpoint returns `Nil`, the frontend treats it as no value and does not render the prompt. |
| P21 | `last_req_del_loc_id` is nullable and its default is null. The default row created at registration holds a null id and the details `Nil`. |
| P22 | Trimming applies to leading and trailing spaces. On edit, the update call is sent together with the `PATCH /orders/:id/edit` call, independent of its outcome, exactly as on create (P12). |
| P23 | The details are displayed below the location name. The name and the details are one field in the display. A value of `Nil` is displayed as `Nil`. |
| P20 | The endpoints are named by the `user_bookmarks` convention (§4.2). The team replied "confirm" to the question about them; the exact names in §4.2 are for the team to check at approval. |

## 3. Data

### 3.1 order-service (Prisma, PostgreSQL)

`requests` gains `deliveryDetails`: `VARCHAR(250) NOT NULL DEFAULT 'Nil'` (P1, P2, P9). The
migration is a new folder under `order-service/prisma/migrations/`. Existing rows take `Nil`.

### 3.2 user-service (`src/db/init.sql`, `CREATE TABLE IF NOT EXISTS`)

| Column | Type | Notes |
|---|---|---|
| `user_id` | `UUID NOT NULL PRIMARY KEY` | References `users (id)`, `ON DELETE CASCADE` (like `user_bookmarks`) |
| `last_req_del_loc_id` | `INTEGER NULL DEFAULT NULL`, `CHECK` positive when not null | Location id from supplier-service. No foreign key (other service). Null in the default row (P21). |
| `last_req_del_loc_details` | `VARCHAR(250) NOT NULL DEFAULT 'Nil'` | Free text, at most 250 characters (P9) |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | Set to now on every update |

A row is inserted for each user at registration (P19). Existing users are not backfilled: they have no row until their first update, and read answers null values for them (P8).

## 4. API

### 4.1 order-service

| Operation | Change |
|---|---|
| `POST /orders` | `deliveryDetails` is required (P10). Missing or empty after trimming: `400`, code `MISSING_DELIVERY_DETAILS`. Not text, or longer than 250 characters: `400`, code `INVALID_DELIVERY_DETAILS`. The stored value is trimmed (P15). |
| `PATCH /orders/:id/edit` | `deliveryDetails` is added to the editable fields and is required in every edit payload (P10). Same errors and trimming as create. |
| Order responses and events | `deliveryDetails` is included wherever the order is returned, including the realtime order events (P17). |

New message text, in the style of the existing entries: `MISSING_DELIVERY_DETAILS` →
"Request is missing delivery details."; `INVALID_DELIVERY_DETAILS` → "Delivery details must be
text of at most 250 characters." (named by convention, P16; for the team to check at approval).

### 4.2 user-service (any authenticated role; user id from the token)

| Operation | Success | Failure |
|---|---|---|
| `GET /users/me/last-request` | `200 { "last_req_del_loc_id": 4, "last_req_del_loc_details": "Level 2 lobby" }`. Both values are null when the row does not exist (P8). The default row at registration reads as id null, details `Nil` (P21). | `401` |
| `PUT /users/me/last-request` with body `{ "last_req_del_loc_id": 4, "last_req_del_loc_details": "Level 2 lobby" }` | `200 { "message": "Last request saved", "code": "LAST_REQUEST_SAVED" }`. Creates the row if it does not exist, otherwise replaces both values and sets `updated_at`. | `400 VALIDATION_ERROR` for a bad value (id missing, null, or not a positive whole number up to 2147483647; details not text, empty after trimming, or over 250 characters); `401` |

Names follow the bookmark endpoints (P20). The id is not checked against supplier-service (P10).

## 5. Frontend

- `CreateRequest.jsx`: a free-text field below the "Deliver to" selector, limited to 250
  characters, required, not submittable when empty or whitespace-only (P9, P10, P15).
- New-request form only: read `GET /users/me/last-request` when the form opens. When the
  stored location id is in the loaded location list and the values are not `Nil` (P19), show the
  card of P18; its "Confirm" button fills the selector and the text field (P13, P14).
- On submit (create) and on save (edit), call `PUT /users/me/last-request` in parallel with the
  order call, without waiting for it and without showing an error (P11, P12).
- Order displays (`activityShared.jsx`, `RequestBoard.jsx`, `AdminOrderTransactions.jsx`): show
  the details with the location name (P17). The details are on the line below the location name, in the same block, and `Nil` is shown as `Nil` (P23).

## 6. Not yet decided by the team

Nothing is open. The endpoint names (§4.2) and error names and messages (§4.1) were derived from the
bookmark and error-code conventions (P16, P20) and stand unless the team changes them at approval.

## 7. Out of scope

Bookmarked or saved multiple locations; any change to supplier-service locations; validating the
location id on update (P10); calls between order-service and user-service (P5); showing an error
when the update call fails (P12); changes to the request board's search or filters.
