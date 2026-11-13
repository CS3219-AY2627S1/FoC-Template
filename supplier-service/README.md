# supplier-service

The campus supplier catalogue of Relay (Friend on Campus): the stores, facilities and landmarks where errands are picked up. It is a standalone HTTP API with its own PostgreSQL database. The web client and the order-service call it, and it needs neither to run. Requirements F2.1 to F2.5 and N2 of the backlog.

Before you change anything, read `AGENTS.md`. Who may do what is decided by the user-service, never here. For the milestone demo, see `DEMO.md`.

## Stack

TypeScript on Node 24, which runs the `.ts` files directly (no build step), Fastify 5, PostgreSQL 17 through `pg`. Tests use `node:test`, and `tsc` only checks types. Walking routes run on a map built from OpenStreetMap data that ships in the image.

## Running it

| What | Command | Address |
| --- | --- | --- |
| Everything, in containers | `docker compose up --build` in the repository root | http://localhost:3002, or http://localhost:8080/api/supplier/suppliers through the gateway |
| The service on your machine, with live reload | `docker compose up -d supplier-db user-service`, then `npm ci` and `npm run dev` in `supplier-service/` | http://localhost:3002 |

Compose has a default for every variable, so the containers need no `.env`. On your machine the service reads the root `.env`, so copy `.env.example` to `.env` first. If the container is running, stop it (`docker compose stop supplier-service`) so the port is free. The tables are created and the seed data is loaded on first start. The database is on `localhost:5433`.

Every route except `/health` needs the `relay_session` cookie that the user-service sets. Log in as the first administrator (`admin`, password `change-me` unless `ADMIN_PASSWORD` is set):

```bash
curl -s -c cookies.txt -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" -d '{"identifier":"admin","password":"change-me"}'
curl -b cookies.txt "http://localhost:3002/suppliers?q=coffee"
```

| Script | Does |
| --- | --- |
| `npm run dev` | runs the service and restarts it on file changes |
| `npm start` | runs the service |
| `npm run typecheck` | checks the types |
| `npm test` | runs all tests, see Tests |

## Why PostgreSQL

The backlog names every field (F2.1.1), so the data has a fixed shape and gains nothing from a document database. What it needs is what a relational database does well:

- Filters, keyword search, sorting and paging with a total (F2.4) are `WHERE`, `ILIKE`, `ORDER BY`, `LIMIT` and `count(*)`.
- The database enforces the rules itself: the status, the opening times, and coordinates as a pair.
- Concurrent edits are serialized by a row lock, and a change that fails halfway is rolled back as a whole.

The catalogue is small and mostly read. The 100 ms bound (N2.1.1) comes from one indexed query per read and the caches below, not from the choice of database.

## Data

| Table | Holds |
| --- | --- |
| `suppliers` | name, type, zone, building, address, and optional description, coordinates, phone and email. Status `Active` or `Inactive`. Who created and last changed it. |
| `supplier_hours` | one row per open weekday (Monday is 0), with times as minutes after midnight. A weekday without a row is closed. A closing time before the opening time runs past midnight. |
| `supplier_photos` | one photo and a square thumbnail per supplier, kept apart so that lists never read them |
| `supplier_favorites` | the favorites of each account, keyed by the `accountId` that the user-service returns |
| `seed_runs` | which one-time seed steps have run |

The SQL is in `src/migrations/`. The service applies new files at start-up.

Type, zone and building are free text. An administrator can add a new type, and `Food/Coffee` is a type of its own, not part of `Food`. Whether a supplier is open is never stored. It is worked out on every request from the hours, on the campus clock (`SUPPLIER_TIMEZONE`), in `src/domain/availability.ts`.

## API

Bodies are JSON. Through the gateway, every path starts with `/api/supplier`.

| Method and path | Who | What |
| --- | --- | --- |
| `GET /health` | anyone | 200 when the database answers, 503 when not |
| `GET /suppliers` | member | search and list, see below |
| `GET /suppliers/filters` | member | the types, zones and buildings in use, for filter menus |
| `GET /suppliers/{id}` | member | one supplier, also an Inactive one |
| `GET /suppliers/{id}/availability` | member | open or closed at a time, and whether a new errand may use it |
| `POST /suppliers/{id}/route` | member | the walk from the supplier to a point, such as an errand's drop-off |
| `GET /suppliers/favorites` | member | the ids of your own favorites |
| `PUT`, `DELETE /suppliers/{id}/favorite` | member | add or remove a favorite, 204 |
| `GET /suppliers/{id}/photo` | member | the photo, or `?size=thumbnail` |
| `PUT`, `DELETE /suppliers/{id}/photo` | administrator | add, replace or remove the photo |
| `POST /suppliers` | administrator | create, 201 with a `Location` header |
| `PATCH /suppliers/{id}` | administrator | change any field except `id` and `createdAt` |
| `DELETE /suppliers/{id}` | administrator | deactivate: the status becomes Inactive and the record stays |

**Search.** `GET /suppliers` takes `q` (every word must match the name, type, building, zone or address), `type`, `zone`, `building`, `status` (`Active` by default, `Inactive` or `all`), `favorites=true`, `openNow=true`, `near=latitude,longitude` (fills in `distanceMeters`), `sort` (`name` by default, or `distance`, which needs `near`), `page` and `pageSize` (1 to 20). The answer is `{ items, page, pageSize, total, totalPages }`. `openNow` checks at most 2000 matches, because open or closed is worked out in code. The service log shows `near=hidden`, and the web client rounds the position to about 110 m before it sends it.

**A supplier** has the stored fields, `contact` (`phone`, `email`), `hours` as `[{ "day": "monday", "opens": "09:00", "closes": "16:00" }]`, `photo` (null, or the paths of the photo and the thumbnail), `availability` (`open`, `closesAt`, `nextOpensAt`, worked out per request) and `distanceMeters`.

**Availability** is for the order-service, which must refuse an errand whose supplier is Inactive or closed at the needed-by time (F3.1.3). `at` must carry a UTC offset and defaults to now. `orderable` is true only when the supplier is Active and open at `at`.

**Create and update.** Creating needs `name`, `type`, `zone`, `building`, `address` and `hours`. Optional: `description`, `latitude` with `longitude`, `contact`, and `status`. An update takes any subset, and a new `hours` list replaces the old one. A blank or `null` optional field clears it. Times are `HH:MM`, and closing at `24:00` or after midnight is allowed.

**Photos.** `PUT` takes `{ "photo": "data:image/jpeg;base64,...", "thumbnail": "data:image/jpeg;base64,..." }`. Each must be JPEG, PNG or WebP, at most 1 MB and 256 KB, and the type is checked from the file's first bytes. The web client shrinks the images before it sends them. A photo path carries a version `v`, so the browser keeps it for a year.

**Walking routes.** `POST /suppliers/{id}/route` with `{ "to": { "latitude": 1.2908, "longitude": 103.7809 } }` answers:

```json
{ "from": { "latitude": 1.2967866, "longitude": 103.7732677 }, "metres": 1424, "seconds": 1095, "estimated": false, "mapVersion": "2026-11-09" }
```

- The service finds the walk itself, with A\* on `map/nus-walk.graph` (about 6 x 6 km around NUS), and asks no outside service. A walk takes a few milliseconds at most.
- `seconds` is `metres` at 1.3 m/s.
- A point more than 150 m from a mapped path is off the map. A walk to it, or any walk while the map is missing, is the straight line times 1.3, with `"estimated": true` and `"mapVersion": null`.
- It is a POST so that the point, which may be where a student lives, stays out of URLs and access logs. The service does not log or store it.
- A supplier without coordinates gets 422 `NO_LOCATION`.
- To rebuild the map, about once a semester, run `node dev/build-walk-map.ts` in `supplier-service/`. It downloads the area from the Overpass API, writes both files in `map/` and prints a few known walks to compare with the last map. Commit both files together. The licence is in `map/README.md`.

**Errors** look like `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": [{ "field": "hours[0].opens", "message": "..." }] } }`. `fields` names every invalid field, so a form can show them all at once.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED`, `BAD_REQUEST` | invalid fields or query, malformed JSON |
| 401 | `UNAUTHENTICATED` | no session cookie |
| 403 | `FORBIDDEN` | the user-service did not confirm the request |
| 404 | `NOT_FOUND` | no such supplier or route |
| 413 | `BAD_REQUEST` | a body over 64 KB, or about 1.75 MB for a photo |
| 422 | `NO_LOCATION` | a walking route from a supplier without coordinates |
| 500 | `INTERNAL_ERROR` | a bug, with no detail given |

## Access control

For every request the service asks the user-service through `POST /internal/authorize` (the contract is in `user-service/README.md`). The role each operation needs is in `src/auth.ts` (F1.5.4): an administrator creates, changes and deactivates suppliers and their photos, and any member reads them and keeps favorites.

- The check runs before the body is read or the database is touched, so a refused caller learns nothing about which suppliers exist (N1.1.1).
- A request without a cookie is a 401. Anything the user-service does not confirm is a 403.
- It fails closed (N1.1.2): a timeout of 2 seconds, a network error or an unexpected answer is a 403, and the log says the user-service could not be asked.
- `created_by` and `updated_by` keep the `accountId` from the answer.
- The automated tests use `dev/fake-user-service.ts` in place of the user-service. It is not in Compose or the image.

## Speed

N2.1.1 and N2.2.1 ask for every read within 100 ms, also with 1000 clients at once. Two short caches make that possible:

| Cache | Remembers | Variable, default | Trade-off |
| --- | --- | --- | --- |
| Authorization | that a session may read | `SUPPLIER_AUTH_CACHE_SECONDS`, 5 | an ended session or a suspended account can still read until the answer expires. Changes are always checked. |
| Search results | the rows a search found | `SUPPLIER_READ_CACHE_SECONDS`, 2 | a change made through another instance takes up to 2 seconds to show |

They never keep a refusal, an error, a write, favorites, open or closed, or an availability answer. A change clears the search cache of its own instance at once. `0` turns a cache off.

`loadtest/search.js` is a [k6](https://k6.io) script: 1000 clients that each search about once a second, with 50 real sessions from the user-service. Run it from the repository root while the system is up:

```bash
docker run --rm -i --network relay_edge \
  -v "$PWD/supplier-service/loadtest:/scripts:ro" \
  -e BASE=http://supplier-service:3002 -e USER_URL=http://user-service:3000 \
  grafana/k6 run --summary-trend-stats "avg,med,p(95),p(99),p(99.9),max" /scripts/search.js
```

The result on one laptop, with one instance of each service:

| | requests | failed | median | p95 | p99 |
| --- | --- | --- | --- | --- | --- |
| Caches on (the default) | 38,095 | 0 | 0.7 ms | 3.3 ms | **7.8 ms** |
| Caches off | 31,672 | 39 (0.12%) | 101 ms | 937 ms | 1.67 s |

Without the authorization cache every read waits for the user-service, which cannot answer about 600 lookups a second.

## Seed data

When the `suppliers` table is empty at start-up, the service loads `../data/csv/supplier-seed-data.csv` (F2.3.1). It never seeds a table that has rows, so a restart keeps every change an administrator made.

- The type is kept exactly as written. The zone comes from the building (`src/seed/suppliers.ts`), and an unknown building gets `Other` and a warning in the log.
- The file's one opening and closing time applies to all seven days. `0000hrs` to `2359hrs` means open around the clock.
- The file is Windows-1252, not UTF-8, and is decoded as such.
- 6 suppliers have a photo. Shrunk copies in `data/images/resized` are added once per database, and `seed_runs` makes sure a photo that an administrator removed does not come back.

## Deploying

A merge into `dev` is all it takes. CI runs the tests, publishes the image to GHCR (job `publish` in `.github/workflows/ci.yml`) and rolls it out to the cloud. New migrations run at start-up under a database lock, so instances that start together run them once.

- In the cloud the service runs up to 4 instances under load (N6.3). It can, because it keeps no state apart from the two caches.
- It uses about 45 to 55 MiB of memory with the walking map loaded. The map is in the image, so the service needs no internet access. Without the map it still starts, and every route is an estimate.
- The gateway lets 2 MB through on the supplier routes for photo uploads (`web-client/nginx/templates/routes/supplier.conf.template`).
- Browsers share a position only over HTTPS or from localhost. Elsewhere, "Nearest to me" says it cannot ask.

## Tests

```bash
docker compose up -d supplier-db
cd supplier-service
npm test
```

The API tests run the real routes and SQL against the `supplier_test` database that Compose creates, and they empty it each time. They need `SUPPLIER_TEST_DATABASE_URL` from `.env`, whose database name must end in `_test`. Without it they are skipped, and the summary says so. The other tests need nothing. One group gives the service a database that fails the test if it is queried, which proves that a refused or invalid request never reaches it.

## Troubleshooting

| You see | Usually |
| --- | --- |
| `Missing environment variables` at start-up | the service runs on your machine without a `.env`. Copy `.env.example` to `.env` in the repository root. |
| 403 for every request | the session ended, or the user-service is down. The log says "The user-service could not be asked" when it is the second. |
| skipped tests in the summary | there is no `SUPPLIER_TEST_DATABASE_URL`, or `supplier-db` is not running |
| `"estimated": true` for a point on campus | the point is more than 150 m from a mapped path, or the map did not load. The log at start-up says which map loaded. |
| 422 `NO_LOCATION` on a route | the supplier has no coordinates. Set them on the map in the admin supplier form. |
| a change to the seed file does not show | the seed runs only into an empty table. `docker compose down -v` deletes the local data. |
| 404 JSON for `/api/supplier/health` | expected. Only `/api/supplier/suppliers/...` is open through the gateway. |

## Declaration of AI-assisted work

This section covers the supplier-service, the supplier parts of the web client (the supplier and admin supplier pages, `web-client/src/api/supplier/`, and the drop-off map and walk on the errand pages), and the walking route that the order-service keeps with each errand.

**Tool:** Claude Code (Claude Opus and Sonnet models).

**How Claude was used:**

- **Explain:** Claude was used to explain Fastify, PostgreSQL, TanStack Query and Leaflet while the first steps of the service were typed by hand.
- **Generate:** Once the patterns were established, Claude was used to write the remaining steps, the supplier screens and the nice-to-have features (photos, favorites, open now, nearest first, maps and walking routes) from a step-by-step plan. Each step became one commit, which was tested and committed by hand.
- **Check:** Claude was used to run the type check, the tests, the build and lint, and to check the pages in a browser at 320 px before each commit. Each page was then tested by hand.
- **Document:** Claude was used to help write this README, `AGENTS.md` and `DEMO.md`.

**Decisions:** The service's responsibilities, its API, the choice of PostgreSQL and which nice-to-have features to build were decided by the team, not by Claude. The reasons for PostgreSQL are in "Why PostgreSQL" above.

**Review:** Every change was reviewed and tested before it was committed. `AGENTS.md` holds the rules that both teammates and coding agents follow in this folder.
