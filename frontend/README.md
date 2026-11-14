<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-10-01
Scope: Wrote the instructions for running the frontend locally, from the compose files, the service
       READMEs, the Vite proxy configuration and the problems met while running it. It describes what
       the code does today; no requirements, architecture, schema, or API decisions were made by the AI
       tool.
Author review: Congchen
-->

# FoC frontend

React 18 + Vite + Tailwind. It talks to two services through same-origin paths, and everything else is
still mock data:

| Area | Source today | Notes |
| --- | --- | --- |
| Login and session (User Service) | Real | Needs `user-db` and `user-service` running. |
| Suppliers, admin supplier management, photos (Supplier Service) | Real | Needs the supplier stack, the photo store and the seed. |
| Requests, activity, chat, credits (Order, Credit and Message) | Mock data inside the app | Those services are not called, so they do not need to run. |

There is no switch that mocks the supplier or user services: the supplier screens always call the API.
Registration is not connected yet (the button is disabled).

## A. Everything mocked, no backend

Use the original mockup in `foc-mockup/`, which makes no API calls:

```bash
cd foc-mockup
npm ci
npm run dev
```

Open http://localhost:5173. The Demo panel (bottom left) switches role and request status.

## B. Real user and supplier services, everything else mocked

### One-time setup

- The repository-root `.env` needs `SUPPLIER_DB_PASSWORD` (and optionally `SUPPLIER_DB_PORT`).
- `user-service/.env`, `supplier-service/.env` and the key pair in `user-service/keys/` must exist.
- Make `host.docker.internal` resolve to your own machine (see [Photos](#photos-and-hostdockerinternal)).
  Stored photo locations start with `http://host.docker.internal:9000`, so images do not load without it.

### Start the backends

From the repository root. Starting only these services avoids the order and credit databases:

```bash
docker compose up -d user-db user-service supplier-db supplier-redis supplier-service supplier-worker
docker compose -f supplier-service/compose.photo-store.yaml up -d
```

The photo store is a separate compose file, so a plain `docker compose up` does not start it. The worker is
only needed for the background jobs of soft-delete and photo cleanup; leave it out if you will not delete or
edit suppliers.

Check with `docker ps`; everything should be running or healthy. Published ports: 3001 (user service),
3004 (supplier service), 5436 (supplier database), 9000 and 9001 (photo store).

### Seed the supplier data (once)

A fresh supplier database already has the full schema from `init.sql`. Only a database created before the
outbox table existed needs `npm run migrate` first (see `supplier-service/README.md`). The seed is safe to
re-run.

```bash
cd supplier-service
npm ci --legacy-peer-deps
npm run seed
```

`--legacy-peer-deps` is needed because of an existing peer-dependency conflict between `vitest` and
`@types/node`. The seed reads `SUPPLIER_DB_PORT` and `SUPPLIER_DB_PASSWORD` from the root `.env`. Suppliers
whose image is missing or is `.webp` are created without a photo.

### Start the frontend

To start the frontend together with the Compose backend services, run this from
the repository root:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

Open http://localhost:5173. The frontend container proxies API requests to the
backend containers over the Compose network, and source changes are synced by
Compose Watch.

Alternatively, to run only the frontend directly on the host:

```bash
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/v1` to the supplier service (port 3004) and `/auth` and
`/users` to the user service (port 3001), so the browser only talks to one origin and no CORS is involved.

Log in with the super admin account from `user-service/.env`. **Manage suppliers** appears for `admin` and
`super admin` accounts.

## C. Real user service, mocked supplier

Not supported yet. With the supplier service down the supplier screens show "Could not load suppliers".

## Photos and host.docker.internal

The photo URLs stored in the database use the name `host.docker.internal`. The API container resolves it
through Docker, but your browser and the seed use the Windows hosts file
(`C:\Windows\System32\drivers\etc\hosts`). Docker Desktop writes your LAN address there, and that address
goes stale whenever the network changes, which makes every image disappear.

Pin the name to your own machine instead (MinIO's port 9000 is published on it). Run in an **elevated**
PowerShell:

```powershell
(Get-Content C:\Windows\System32\drivers\etc\hosts) -replace '^\s*\d+\.\d+\.\d+\.\d+\s+host\.docker\.internal\s*$','127.0.0.1 host.docker.internal' | Set-Content C:\Windows\System32\drivers\etc\hosts
```

Check that it works; this should print `200`:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://host.docker.internal:9000/minio/health/live
```

If the entry is rewritten again, turn off Docker Desktop → Settings → General → "Add the *.docker.internal
names to the host's /etc/hosts file", then re-add the `127.0.0.1 host.docker.internal` line yourself.
Containers are not affected by the hosts file.

## Verifying the data by hand

Use these to confirm that what the page shows is what is actually stored. They need the backends from
section B running.

### MySQL (supplier database)

Each command runs `mysql` inside the `foc-supplier-db` container, which already has the root password in
its environment, so you never type it. Replace a query's final `;` with `\G` to print one block per row
instead of a table.

Tables and row counts (expected after the seed: 14 seeded suppliers plus any older development rows):

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT (SELECT COUNT(*) FROM supplier) suppliers, (SELECT COUNT(*) FROM supplier_photos) photos, (SELECT COUNT(*) FROM supplier_hours) hours, (SELECT COUNT(*) FROM supplier_locations) locations, (SELECT COUNT(*) FROM supplier_categories) categories;"'
```

Suppliers with their location, faculty and status flags (this is what the admin list shows):

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT s.supplier_id, s.supplier_name, s.supplier_type, l.location, f.faculty, s.is_active, s.is_deleted, s.version FROM supplier s JOIN supplier_locations l ON l.location_id = s.location_id JOIN faculties f ON f.faculty_id = l.faculty_id ORDER BY s.supplier_name;"'
```

Categories per supplier:

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT s.supplier_name, GROUP_CONCAT(c.category_type ORDER BY c.category_type) categories FROM supplier s JOIN supplier_category_map m ON m.supplier_id = s.supplier_id JOIN supplier_categories c ON c.category_id = m.category_id GROUP BY s.supplier_id ORDER BY s.supplier_name;"'
```

Opening hours (day 1 = Monday, 7 = Sunday, 8 = open 24 hours):

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT s.supplier_name, h.day_of_week, h.open_time, h.close_time, h.is_24h FROM supplier_hours h JOIN supplier s ON s.supplier_id = h.supplier_id ORDER BY s.supplier_name, h.day_of_week LIMIT 30;"'
```

Photos: the stored location should start with `http://host.docker.internal:9000/supplier-photos/`.

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT s.supplier_name, p.display_order, p.photo_location FROM supplier_photos p JOIN supplier s ON s.supplier_id = p.supplier_id ORDER BY s.supplier_name, p.display_order;"'
```

Background jobs. The `outbox` table should be empty or nearly so while the worker runs (it moves rows into
the queue every second); rows that stay mean the worker is not running. `dead_letter_jobs` holds jobs that
failed five times.

```bash
docker exec foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service -e "SELECT COUNT(*) outbox_rows FROM outbox; SELECT id, task_name, status, failed_at FROM dead_letter_jobs ORDER BY id DESC LIMIT 10;"'
```

#### Manual testing in the container terminal

For back-and-forth checking while you click through the app, work inside the container instead of running
one command per query.

1. Open a shell in the container. Either run this in your terminal:

   ```bash
   docker exec -it foc-supplier-db bash
   ```

   or in Docker Desktop open **Containers → foc-supplier-db → Exec**.

2. Start the MySQL client. The root password is already in the container's environment, so the command
   needs no typing of secrets:

   ```bash
   mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service
   ```

   The prompt changes to `mysql>`. (Without the shell step, one line does both:
   `docker exec -it foc-supplier-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" supplier_service'`.)

3. Type queries at the prompt. Every statement ends with `;`, or with `\G` to print one block per row:

   ```sql
   SHOW TABLES;
   DESCRIBE supplier;
   SELECT supplier_id, supplier_name, is_active, is_deleted, version, updated_on FROM supplier ORDER BY updated_on DESC LIMIT 5;
   SELECT * FROM supplier WHERE supplier_name = 'Japanese'\G
   ```

4. Leave the client with `\q`, then leave the container shell with `exit`.

**A manual test loop.** Do an action in the app, then look at the row it should have changed:

| In the app (as admin) | Check at the `mysql>` prompt | Expected |
| --- | --- | --- |
| Manage suppliers → Add supplier | `SELECT supplier_id, supplier_name, version, created_by FROM supplier ORDER BY supplier_id DESC LIMIT 1;` | A new row with `version` 1 |
| Add two photos to it | `SELECT photo_id, display_order, photo_location FROM supplier_photos WHERE supplier_id = <id> ORDER BY display_order;` | Two rows, `display_order` 0 and 1, locations under `.../supplier-photos/` |
| Edit it and save | `SELECT supplier_name, version, updated_on FROM supplier WHERE supplier_id = <id>;` | `version` is one higher and `updated_on` is recent |
| Reorder or remove a photo | the photos query above | The order or the number of rows changes |
| Untick Active and save | `SELECT is_active FROM supplier WHERE supplier_id = <id>;` | `0`; it disappears from the user-facing Suppliers page |
| Delete it | `SELECT is_deleted, version FROM supplier WHERE supplier_id = <id>;` | `is_deleted` is `1` (a soft delete, the row stays) |
| After the delete, with the worker running | `SELECT COUNT(*) FROM outbox;` | `0` within a few seconds; a stuck row means the worker is not running |

Read with `SELECT`. Avoid `UPDATE` and `DELETE` by hand: they skip what the service does on every change (the
`version` bump, the `outbox` rows and the photo cleanup), so the page and the database can disagree afterwards.

The user database is PostgreSQL. To see the accounts (the password hash and tokens stay in the database,
so avoid selecting them):

```bash
docker exec foc-user-db psql -U postgres -d user_service -c "SELECT username, email, role, status FROM users;"
```

### MinIO (photo store)

**Console in the browser:** http://localhost:9001. The development login is the `PHOTO_STORE_ACCESS_KEY`
and `PHOTO_STORE_SECRET_KEY` defaults in `supplier-service/compose.photo-store.yaml` (`photostoredev` and
`photostoredev-secret`). Open **Object Browser → supplier-photos**: there should be one object per row of
`supplier_photos`.

**Health:** this should print `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/minio/health/live
```

**Count the stored objects** and compare with the `photos` count from MySQL. MinIO keeps one folder per
object on its single drive; if your MinIO version lays files out differently, use the console instead:

```bash
docker exec foc-supplier-photo-store sh -c 'ls /data/supplier-photos | wc -l'
```

**Fetch one photo.** Take a `photo_location` from the MySQL photos query. The bucket allows anonymous
download, so no login is needed. Once `host.docker.internal` resolves to this machine you can fetch the
stored URL as it is; the `localhost` form below works regardless:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:9000/supplier-photos/<object-key>
```

`200 image/jpeg` or `200 image/png` means the file is there. `404` means the database points at an object
that is missing from the bucket (for example after the photo store's volume was recreated). The seed skips
suppliers that already exist, so it will not upload their photos again; add the photo back by editing the
supplier under Manage suppliers.

### What "everything is working" looks like

1. The row counts in MySQL match the seed (14 seeded suppliers, one photo each for the ones whose image
   exists).
2. Every `photo_location` starts with `http://host.docker.internal:9000/supplier-photos/` and returns `200`
   with an `image/*` type.
3. The number of objects in MinIO equals the number of `supplier_photos` rows.
4. `outbox` is empty and `dead_letter_jobs` has no new `UNRESOLVED` rows.
5. The Suppliers page lists the same names as the supplier query above (inactive and deleted suppliers
   only appear under Manage suppliers).

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Images show "Image pending" | The photo store is not running (`docker compose -f supplier-service/compose.photo-store.yaml up -d`), or `host.docker.internal` does not resolve to this machine (see above). Hard-refresh after fixing. |
| "Rate limit exceeded" (429) | The Supplier Service allows 30 requests per minute per IP. Wait for the 60-second window to pass. |
| "Log in to see suppliers" | Every supplier route needs a token. Log in. |
| 401 right after restarting the user service | Log in again; the access token is held in memory only. |
| "Could not load suppliers" with a network error | The supplier service or database is not running, or the seed has not been run. |
| Reload shows you as an ordinary user | Hard-refresh; the role is restored from `GET /auth/verify` after the refresh cookie is exchanged. |
