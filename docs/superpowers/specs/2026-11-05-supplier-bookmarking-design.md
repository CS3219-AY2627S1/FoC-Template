<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
Scope: Formatted the team's chat decisions of 2026-11-05 into a spec for supplier bookmarking.
       Every decision below is quoted or paraphrased from the team's chat answers; items the team
       did not decide are listed separately under "Not yet decided by the team". No requirements,
       architecture, schema, or API decisions were made by the AI tool.
Author review:
-->

# Supplier bookmarking — spec

**Branch:** `supplier-bookmarking` (from `main`). **Touches:** `user-service`, `frontend`, and
a small part of `supplier-service`. **Size:** Big (new capability, new table, new endpoints) — see
the `maintaining-project-state` skill.

Plan: [`../plans/2026-11-05-supplier-bookmarking.md`](../plans/2026-11-05-supplier-bookmarking.md).

## 1. Scope

Users can bookmark supplier cards. Bookmarking suppliers is this change; bookmarking locations is
a separate, later change (B1). All roles (`user`, `admin`, `super admin`) can bookmark. A bookmark
belongs to one user and never affects anyone else (B2). The earlier idea of a pinned section at
the top of the home page is dropped; the Bookmarked filter is the whole feature (B14).

## 2. Team decisions

Source for every row: the team's chat answers, 2026-11-05. IDs are local to this spec.

| ID | Decision |
|---|---|
| B1 | This change bookmarks supplier cards. Locations are a later change. |
| B2 | Bookmarks are per user. No universal field is added to suppliers. |
| B3 | Bookmarks are stored in a new table in the user-service. |
| B4 | There is no `isBookmarked` flag in supplier-service responses. The frontend draws the icon by comparing a supplier's id with the user's own bookmark list. |
| B5 | Maximum 20 bookmarks per user. The 21st add returns `422` with a user-oriented message (wording tightened in §4). |
| B6 | One icon: clicking it when not bookmarked bookmarks; clicking when bookmarked unbookmarks. The frontend calls a different endpoint depending on the icon's current state. |
| B7 | Add and remove are explicit endpoints on the user-service, following the existing `/users/me/*` route convention. Both are safe to repeat. |
| B8 | Filtering by bookmarked: the frontend sends the user's bookmarked supplier ids to the **existing** supplier list endpoint (`GET /api/v1/suppliers`), which returns the matching suppliers. The other list filters still apply on top. |
| B9 | The supplier-service returns an extra array, `unavailable`, for ids it will not list. Each entry is `{ id, status }` with `status` `"hidden"`, `"deleted"` or `"invalid"`. |
| B10 | An id that does not exist is reported as `"deleted"`. |
| B11 | `unavailable` ignores the other list filters: every hidden or deleted id from the request is listed in it. |
| B12 | When the frontend sees a `"deleted"` entry it calls the user-service unbookmark endpoint, so the bookmark is cleared. A `"hidden"` bookmark is kept. |
| B17 | A malformed id in `ids` (not a positive whole number) is reported as `"invalid"` and handled like `"deleted"` (the bookmark is removed). It does not block the valid ids in the same request. Such ids only arise from hand-edited requests. |
| B18 | A soft-deleted supplier that is also inactive is reported as `"deleted"` (deleted takes precedence). |
| B19 | The response `code` names are `BOOKMARK_ADDED`, `BOOKMARK_REMOVED`, `BOOKMARK_LIMIT_REACHED`. |
| B20 | An empty `ids` list returns an empty payload (`data: []`, `unavailable: []`); the frontend renders it as "No bookmarked suppliers.". |
| B21 | The filter's label is "Bookmarked". |
| B22 | The `user_bookmarks` key is the pair `(user_id, supplier_id)`. `GET /users/me/bookmarks` returns ids oldest first. |
| B23 | A malformed supplier id never blocks a call. On the supplier-service it is returned as `invalid` (B17); on the user-service `DELETE` it is a no-op that answers `200`, so the frontend can drop the record without an error. |
| B24 | The Bookmarked control is a checkbox under a "Bookmarks" heading in the suppliers page filter panel; the team may amend the UI later. The empty state reads "No bookmarked suppliers.". `unavailable` lists well-formed ids first, then malformed ones. |
| B26 | The landing page was removed on `main` because the suppliers page serves the same purpose (stage 22), so the Bookmarked chip that was planned for it is dropped; the filter lives on the suppliers page only (team, chat, 2026-11-05). |
| B25 | `PUT /users/me/bookmarks/:supplierId` with a malformed id returns `400 VALIDATION_ERROR`. |
| B13 | Hidden bookmarks count toward the 20 cap. Deleted ones count until the next Bookmarked-filter load clears them. |
| B14 | No pinned section; the Bookmarked filter is enough. Ordering is the existing per-location grouping the supplier page already applies. |
| B15 | The supplier-service and the user-service do not call each other. The supplier-service only learns the ids from the request. |
| B16 | The frontend loads and holds the user's bookmark ids and renders the icon state from them. |

## 3. Data (user-service, PostgreSQL)

New table `user_bookmarks` (name, columns and the unique pair confirmed by the team):

| Column | Type | Notes |
|---|---|---|
| `user_id` | `UUID NOT NULL` | References `users (id)`, `ON DELETE CASCADE` |
| `supplier_id` | `INTEGER NOT NULL` | The supplier-service's id. No foreign key (other service). |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

The `(user_id, supplier_id)` pair is unique. Applied through `src/db/init.sql` (`CREATE TABLE IF
NOT EXISTS`).

## 4. API

### 4.1 User-service (all require a valid access token; any role)

| Method and path | Success | Failure |
|---|---|---|
| `GET /users/me/bookmarks` | `200 { "supplier_ids": [3, 7, 12] }` | `401` |
| `PUT /users/me/bookmarks/:supplierId` | `200 { "message": "Supplier bookmarked", "code": "BOOKMARK_ADDED" }`. Adding an id already saved is a harmless repeat and returns the same `200`. | `400 VALIDATION_ERROR` for a bad id; `401`; `422 BOOKMARK_LIMIT_REACHED` on the 21st |
| `DELETE /users/me/bookmarks/:supplierId` | `200 { "message": "Bookmark removed", "code": "BOOKMARK_REMOVED" }`. Removing an id that is not saved, or a malformed id (nothing to remove), is the same `200`. | `401` |

`422` message (tightened from the team's draft): `You can bookmark up to 20 suppliers. Remove
one before adding another.`

### 4.2 Supplier-service: `GET /api/v1/suppliers`

New optional query parameter `ids`: comma-separated supplier ids, at most 20 values,
e.g. `?ids=3,7,12`. Duplicates and empty values (`3,,7`, a trailing comma) are ignored. More than
20 values, or `ids` sent more than once, is `422` in the existing error envelope with
`field: "ids"`. A value that is not a positive whole number does **not** fail the request (B17).

When `ids` is sent:

- `data` holds only the visible suppliers (not deleted, active) whose id is in `ids` **and** that
  match the other filters (`search`, `location_id`, `category_id`, `isOpen`, `sortOrder`, `page`).
- The response gains `unavailable`, listing every requested id that is hidden, deleted, does not
  exist, or is malformed. Entries for well-formed ids come first, in the order sent; entries for
  malformed values (`status: "invalid"`, `id` is the value as sent) come after them. The array is
  always present (possibly empty) when `ids` is sent, and absent otherwise.
- An empty `ids` returns `200` with `data: []`, `totalRecords: 0` and `unavailable: []` (B20).
- Status rule for well-formed ids: not found or soft-deleted → `deleted` (even if also inactive);
  otherwise inactive → `hidden`; otherwise listed in `data` (subject to the other filters).

Roles: unchanged (`user`, `admin`, `super admin`).

## 5. Frontend

- A `BookmarksProvider` loads `GET /users/me/bookmarks` once the user is logged in and holds the
  ids (B16).
- `SupplierCard`'s existing bookmark icon (top-right of the image, filled when bookmarked, outline
  when not; `MockupBlueprint.md` §7.2) reads its state from the provider and calls `PUT` or
  `DELETE` according to the current state (B6). A failed add shows the server's message in a toast.
- A "Bookmarked" filter on the suppliers page sends `ids` (B8, B21, B26). When
  the response has `unavailable` entries with status `deleted` or `invalid`, the frontend calls
  `DELETE` for each id it actually holds (B12, B17). `hidden` entries are ignored and show nothing
  (B9, B11).
- If the user has no bookmarks, the filter shows "No bookmarked suppliers." The frontend's request
  helper drops empty query values, so it does not send an empty `ids` (that would list every
  supplier); it shows the empty state itself, which matches what the service returns for `ids=`.

## 6. Not yet decided by the team

Nothing is open. The 2147483647 cut-off for a well-formed id is an implementation detail: a larger
value is reported as `invalid`, which leads to the same bookmark removal as `deleted`.

## 7. Out of scope

Location bookmarks; any pinned section; any `isBookmarked` field; calls between the two services;
bookmark counts or analytics; changes to the admin supplier list.
