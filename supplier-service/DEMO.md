# Supplier Service milestone: answers and demonstration scripts

Points 1 and 2 are answered question by question. Point 3 has a script for each of
its three demonstrations. Point 4 starts with a straight answer about what exists,
and then has its own script. Point 5, the UI, is not covered. The full reference
for every claim is in `README.md`.

Every demonstration runs from one command, so what you say matches what the
audience sees. Everything runs against the real system, including the real
user-service that a teammate built.

## Before you start

From the repository root, with Docker Desktop running:

```bash
docker compose up --build       # about a minute the first time, then seconds
```

No `.env` is needed, because `compose.yaml` has a development default for every
variable. This starts the user-service with its MongoDB and Mailpit, and the
Supplier Service with its PostgreSQL database.

Each demonstration is a part of one script. Run a part on its own, or run them all:

```bash
bash supplier-service/demo/demo.sh queries       # point 2, the ways of querying
bash supplier-service/demo/demo.sh access        # point 2, who may do what
bash supplier-service/demo/demo.sh crud          # point 3, demonstration A
bash supplier-service/demo/demo.sh independent   # point 3, demonstration B
bash supplier-service/demo/demo.sh tests         # point 3, demonstration C
bash supplier-service/demo/demo.sh end-to-end    # point 4
bash supplier-service/demo/demo.sh               # all six, 59 checks
```

Put `PAUSE=1` in front to wait for Enter before each step, which is how to present.
The script prints the exact `curl` command of every call and checks every answer,
so a part that ends with `failed: 0` is safe to show. Before presenting, run the
whole thing once. To reset the data: `docker compose down -v` and start again.

The people in the demo are real accounts of the user-service. The parts that need
them start by signing in the first administrator (username `admin`, password
`change-me`, unless you set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`), and
by registering and verifying a throwaway student through Mailpit, which is the
local inbox. That takes one line of output. The demo student accounts are deleted
when the script ends, unless you set `KEEP=1`.

The script needs only bash and `curl`. What else it finds in your shell adds to
the output:

| Your shell | What you get |
| --- | --- |
| Git Bash | Everything: formatted responses, the database steps and the service logs |
| WSL, Docker not connected | Every call and its check. The database and log steps print the PowerShell command to run instead, and the demo supplier is deactivated at the end and not removed |
| WSL, with Docker Desktop's WSL integration turned on | The same as Git Bash |
| No Node in the shell | Responses are shown as raw JSON, and everything else works |

WSL sees the Windows Node only as `node.exe`, and the script looks for that too.

---

# Point 1: Database choice and schema design

## Which database technology have you selected?

**PostgreSQL 17**, a relational database. It is the Supplier Service's own
database and nothing else reads it. The Order Service will ask the API.

## Why, for FoC in particular?

**The nature of the data.** A supplier has a fixed list of fields, and the backlog
names all of them (F2.1.1). No supplier needs a field another does not have, so
the flexibility of a document database would go unused. The one part that could
look flexible, the weekly opening hours, is a repeating group of at most 7 rows
per supplier, and a child table models that exactly.

**The expected query patterns.** Keyword search, filtering by type and location,
sorting by name, and paging with a total count (F2.4) are `WHERE`, `ILIKE`,
`ORDER BY`, `LIMIT` and a count. That is what SQL does natively, and indexes
speed it up. One query returns a page and its total.

**Integrity.** F2.2.1 asks for "complete and valid" fields. The database refuses
a bad row by itself, whatever the service does: a status can only be Active or
Inactive, a supplier cannot open and close at the same minute, coordinates come
as a pair, and every text field has a length limit. There are 13 check
constraints in all.

**Safe writes.** Creating or updating a supplier and its hours is one
transaction. Two administrators editing the same supplier are applied one after
the other, because the update locks the row.

**Scalability.** The catalogue is small, tens to hundreds of suppliers, mostly
read, and changed only by administrators. The 100 ms target with 1000 clients
(N2) is met by one indexed query plus a short cache, in front of a service that
keeps no state and so can run as many copies as needed. We measured a 99th
percentile of 4.9 ms with 1000 concurrent clients, using real sessions from the
real user-service. If reads ever outgrow one database, PostgreSQL has read
replicas.

**Why not the alternatives.** A document database such as MongoDB fits records
that differ from each other, and these do not, so we would give up
database-enforced rules for flexibility we do not use. A key-value store such as
Redis cannot do the search, filter and sort that F2.4 asks for. SQLite is a file
inside one container, so several copies of the service could not share it.

## The concrete schema

Two tables and one relationship.

```text
suppliers (1) ----< supplier_hours (0 to 7)      one row per weekday it is open
```

| Table | Field | Type | Notes |
| --- | --- | --- | --- |
| `suppliers` | `id` | uuid | Primary key, made by the database |
| | `name` | text | 1 to 120 characters |
| | `type` | text | 1 to 60 characters, as in the seed file: Food, Food/Coffee, Shopping, Printing |
| | `zone` | text | Campus zone, such as Central or Computing |
| | `building` | text | Used to find by place |
| | `address` | text | The line shown to users |
| | `description` | text | Optional, how to find it |
| | `latitude`, `longitude` | double | Optional, set as a pair |
| | `phone`, `email` | text | Optional contact details |
| | `status` | enum | Active or Inactive, default Active |
| | `created_at`, `updated_at` | timestamptz | Set by the database |
| | `created_by`, `updated_by` | text | Account id of the administrator, from the user-service |
| `supplier_hours` | `supplier_id` | uuid | Foreign key to `suppliers`, primary key with `weekday` |
| | `weekday` | smallint | 0 to 6, Monday is 0 |
| | `opens_minute` | smallint | 0 to 1439, minutes after local midnight |
| | `closes_minute` | smallint | 1 to 1440, where 1440 is midnight at the end of the day |

A weekday with no row is closed all day. Times are stored as minutes so that
`24:00` is exact, and a `closes_minute` below `opens_minute` means the window runs
past midnight, so 11:00 to 02:00 is opens 660, closes 120.

## The metadata of a supplier, and how it is stored and queried

| Metadata | Stored in | Queried by |
| --- | --- | --- |
| Name | `suppliers.name` | keyword search, and the sort order of every list |
| Type | `suppliers.type`, free text taken from the seed file | filter `type`, keyword search |
| Location | `zone`, `building`, `address`, and the coordinates | filters `zone` and `building`, keyword search |
| Opening hours | rows in `supplier_hours` | worked out into open or closed on each request |
| Status | `suppliers.status` | filter `status`, Active by default |
| Who and when | `created_at`, `updated_at`, `created_by`, `updated_by` | not returned by the API, kept as an audit trail |

The type is free text on purpose. It starts as exactly what the seed file writes,
and an administrator may add a new one. `Food/Coffee` is a type of its own, so
filtering by `Food` does not include it.

Whether a supplier is open is not stored. It is worked out from the hours when a
request arrives, on the campus clock (Asia/Singapore), including hours that run
past midnight.

## How to show point 1

The real tables, with their constraints and indexes, and real rows:

```bash
docker compose exec supplier-db psql -U supplier -d supplier -c "\d suppliers"
docker compose exec supplier-db psql -U supplier -d supplier -c "\d supplier_hours"
docker compose exec supplier-db psql -U supplier -d supplier -c "SELECT name, type, zone, building, status FROM suppliers ORDER BY lower(name) LIMIT 5"
docker compose exec supplier-db psql -U supplier -d supplier -c "SELECT type, count(*) FROM suppliers GROUP BY type ORDER BY count(*) DESC"
docker compose exec supplier-db psql -U supplier -d supplier -c "SELECT s.name, h.weekday, h.opens_minute, h.closes_minute FROM suppliers s JOIN supplier_hours h ON h.supplier_id = s.id WHERE s.name = 'Supersnacks' ORDER BY h.weekday LIMIT 3"
```

Point out that the types are exactly the four in the seed file, and that
Supersnacks closes at minute 120, below its opening minute 660, which is how a
closing time after midnight is stored. To show the database refusing bad data by
itself, this fails with a check violation and changes nothing:

```bash
docker compose exec supplier-db psql -U supplier -d supplier -c "INSERT INTO supplier_hours VALUES ((SELECT id FROM suppliers LIMIT 1), 1, 600, 600)"
```

---

# Point 2: Query patterns and API design

## What are the key ways the service is queried?

| The service is asked for | Request |
| --- | --- |
| One supplier by id | `GET /suppliers/{id}` |
| Everything, a page at a time | `GET /suppliers?page=2` |
| A keyword | `GET /suppliers?q=coffee` |
| Suppliers of a type | `GET /suppliers?type=Printing`, `?type=Food/Coffee` |
| Suppliers by location | `GET /suppliers?zone=Central`, `?building=COM2` |
| Any combination | `GET /suppliers?zone=Central&type=Food/Coffee&q=roaster` |
| Deactivated suppliers | `GET /suppliers?status=Inactive` or `?status=all` |
| Is it open at this time, and may an errand use it | `GET /suppliers/{id}/availability?at=...` |

Results are always sorted by name and come at most 20 to a page, with the total
count (F2.4.2). Every supplier in a response says whether it is open right now.

## Which endpoints expose these, and do they work?

| Endpoint | Who may call it |
| --- | --- |
| `GET /suppliers`, `GET /suppliers/{id}`, `GET /suppliers/{id}/availability` | any logged-in member |
| `POST /suppliers` | administrator |
| `PATCH /suppliers/{id}` | administrator |
| `DELETE /suppliers/{id}` (deactivates) | administrator |
| `GET /health` | anyone |

Show every query pattern with real calls:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh queries
```

It runs 14 checks: the list, a keyword, a type, `Food/Coffee`, `Food`, a zone, a
building, a combination, page 2, a page size that is too big, one supplier by id,
and availability before and after closing time.

## How do the endpoints use identity and role information from the User Service?

The user-service is the only authority on who is logged in and what they may do
(N1.1). The Supplier Service never decides access from a cookie or a token, and
keeps no copy of roles. Someone logs in to the user-service, which sets the
`relay_session` cookie. The client sends that cookie to the Supplier Service, which
asks the user-service about it before it does anything else:

```text
client --- request + the relay_session cookie ---> Supplier Service
Supplier Service --- POST /internal/authorize {"token":"...","requiredRole":"administrator"} ---> user-service
user-service --- 200 {"decision":"authorized","accountId":"...","roles":[...]}  or  {"decision":"denied"} ---> Supplier Service
Supplier Service --- only if authorized: run the query ---> database
```

The Supplier Service decides which role each operation needs, as the platform rule
F1.5.4 says: `administrator` to create, update or deactivate a supplier, and
`member` to read. The user-service decides whether the account behind the session
is Active and holds that role. The account id in the answer is stored as
`created_by` and `updated_by`.

## How are denied requests answered?

| Who | Read | Create, update, deactivate |
| --- | --- | --- |
| No session cookie at all | 401 | 401 |
| A session the user-service does not know, or one that has ended | 403 | 403 |
| An account that is not Active | 403 | 403 |
| Member (a student) | allowed | 403 |
| Administrator | allowed | allowed |
| The user-service does not answer | 403 | 403 |

```json
{ "error": { "code": "FORBIDDEN", "message": "You are not allowed to do this" } }
```

- **401 or 403.** 401 means no session came with the request. 403 means the
  user-service did not confirm it, whatever the reason.
- **Checked first.** The check runs before the body is read or the database is
  touched, so a refusal changes nothing (F1.5.3).
- **A refusal reveals nothing.** A member who tries to change a supplier that
  exists, one that does not, and text that is not an id gets the identical 403
  (N1.1.1).
- **Fails closed (N1.1.2).** A timeout, a network error or any answer that is not
  a clear `authorized` is a refusal, and a warning is logged so an operator can
  tell it from a plain no.

Show it:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh access
```

It runs 7 checks: no session, a made-up session, a member trying to create, update
and deactivate, the identical 403 for an id that does not exist, and the
administrator's request being allowed.

---

# Point 3: Demonstration scripts

Each script is a table of the runner's steps. **Say** is what to tell the
audience, and **You will see** is what appears on screen.

## Demonstration A: a running service connected to a database, with working CRUD

About 4 minutes. Run:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh crud
```

It starts with one line saying it signed in the administrator and a demo student.

| Step | Say | You will see |
| --- | --- | --- |
| The service is running and connected | "The health check asks the database a question, so a 200 means the service and its database are both up. This count comes straight from the database." | `HTTP 200`, then `suppliers_in_the_database: 21` |
| Create with invalid data | "First a bad request. The service names every invalid field at once, and nothing is stored." | `HTTP 400` and a list of fields: name, type, zone, building, address, and the bad opening time |
| CREATE | "Now a valid one, as an administrator. The service assigns the id and the creation time itself." | `HTTP 201` and the new supplier with its hours |
| READ it back, as a member | "A member reads it straight away. Reading needs no administrator role." | `HTTP 200` and the same supplier |
| UPDATE it | "The administrator renames it and replaces its hours. The id cannot be changed, and the service says so." | `HTTP 200` with the new name and hours, then `HTTP 400: id: cannot be set` |
| DELETE means deactivate | "Delete only sets the supplier to Inactive, as the backlog says. It is still retrievable for errands that already use it, but it leaves the normal list and is no longer orderable." | `status=Inactive`, then `HTTP 200` by id, `total=0` in the list, `orderable=false`, and found with `status=Inactive` |
| Reactivate | "Setting the status back to Active undoes it." | `HTTP 200`, `status=Active` |
| What the database holds | "This is the row in PostgreSQL, and who created it: the administrator's account id from the user-service. The weekday row is the Saturday hours we set." | A row with `created_by` set to a UUID, `was_edited = t`, and one hours row, `5 | 600 | 840` |
| Clean up | "The API never deletes, so the demo removes only its own supplier, straight in the database." | `DELETE 1` |

**Closing line:** "Create, read, update and deactivate all work through the API, and every
change is in the database."

## Demonstration B: the service is independent, and does not depend on a UI

About 2 minutes. Make sure no web client is running. Run:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh independent
```

| Step | Say | You will see |
| --- | --- | --- |
| Which containers exist | "The whole system is five containers: the user-service with its database, the local inbox, and the Supplier Service with its database. None of them is a UI." | A table of `mailpit`, `supplier-db`, `supplier-service`, `user-db`, `user-service`, all running, and `[ok] no container in the system is a UI` |
| Is anything serving a UI? | "The web client's development server would listen on port 5173. Nothing is there." | `[ok] nothing is listening on port 5173, so no UI is running` |
| The service answers anyway | "A full search and a create are both answered, checked and validated with no UI anywhere." | `HTTP 200` with the two printing suppliers, then `HTTP 400` naming the missing fields |
| The code does not know a UI exists | "The service's source, its package file and its Dockerfile never mention the web client." | `(no matches)` and `[ok] no mention of web-client in the service, its packages or its Dockerfile` |

**Closing line:** "Everything the service does is an HTTP call, and nothing in it knows a UI
exists."

## Demonstration C: used and tested through its APIs, with no UI present

About 2 minutes. This needs `npm install` in `supplier-service` once, and the
system running. Run:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh tests
```

| Step | Say | You will see |
| --- | --- | --- |
| Run every automated test | "These 161 tests call the real routes against a real PostgreSQL, the way a client would. 48 of them are API tests. The rest cover the validation, the opening-hours logic, the caches and the user-service client." | `tests 161`, `pass 161`, `fail 0`, `skipped 0`, then two `[ok]` lines |

Then say what "none were skipped" means: the database tests are skipped when there
is no database, so a run with none skipped proves the SQL ran. If you want one
more proof that a UI is not involved:

```bash
grep -rn "web-client" supplier-service/test supplier-service/src
```

It prints nothing. One group of tests, in `test/app.test.ts`, hands the service a
database that fails the test if it is asked anything. It proves that a refused,
invalid or unauthenticated request never reaches the database.

**Closing line:** "The service is tested entirely through its API and its database, and no
UI is involved anywhere."

---

# Point 4: End-to-end integration

## Do we have it yet?

Yes. It became possible when the user-service that a teammate built was merged in.

| | Do we have it? |
| --- | --- |
| The Supplier Service acting on a user's identity and role | **Yes.** It asks the user-service on every request, enforces the roles, refuses correctly, and records who made each change |
| A real User Service with real accounts and a real login | **Yes.** Registration with an emailed code, login with a session cookie, roles, logout, and the authorization endpoint (F1.1, F1.3, F1.5.3). The first administrator is created when it starts |
| A complete flow from a logged-in user to the database | **Yes, all of it real.** The demo registers a student, verifies the address, logs in, and uses the API down to the database |
| Suspended accounts | **Not yet.** The user-service has no way to suspend an account (F1.6, sprint 2), so a suspended account is covered only by the automated tests |

The placeholder users from the first version of the demo are gone. Nothing in the
demo or the running system is faked.

## The people in the demonstration

| Person | Where they come from | Role |
| --- | --- | --- |
| The administrator | Created by the user-service at start-up from `ADMIN_USERNAME` and `ADMIN_PASSWORD` (F1.5.6). By default `admin` and `change-me` | administrator, and member |
| A student | Registered by the demo with an `@u.nus.edu` address, verified with the code from Mailpit, deleted at the end | member |

```text
user --- username + password ---> user-service              (the Supplier Service never sees a password)
user <--- relay_session cookie --- user-service
user --- request + cookie -------> Supplier Service
Supplier Service --- "may this session act as a member or administrator?" ---> user-service
Supplier Service --- if authorized: query ------------------------------------> database
user <--- the result --------------  Supplier Service
```

## Demonstration: from a real logged-in user to the database, for each role

About 5 minutes. Run:

```bash
PAUSE=1 bash supplier-service/demo/demo.sh end-to-end
```

| Step | Say | You will see |
| --- | --- | --- |
| A new student registers | "This is the real user-service. It creates the account as PendingVerification and emails a six digit code." | `HTTP 201` and `account: student... roles=member state=PendingVerification` |
| The code arrives by email | "Mailpit is the local inbox that catches every email the system sends. The code is in it." | `[ok] the email arrived. It says: Your verification code is 292915` |
| Logging in before verifying is refused | "An account that is not Active gets no session." | `HTTP 403 ACCOUNT_NOT_VERIFIED: Please verify your email address first` |
| The student verifies the address | "The code turns the account Active." | `HTTP 200` and `state=Active` |
| Users log in | "The user-service checks the password and sets a session cookie. The Supplier Service never sees a password." | Two `HTTP 200` answers, each with `session cookie set: relay_session=... (43 characters, HttpOnly)` |
| Logins that are refused | "A wrong password and an unknown user get the identical answer, so nobody can find out which usernames exist." | `HTTP 401 INVALID_CREDENTIALS: Wrong username, email, or password`, twice, identical |
| The student uses the API | "The student's session may read the catalogue, and is refused when it tries to create." | `HTTP 200` with the two printing suppliers, then `HTTP 403 FORBIDDEN` |
| The administrator manages a supplier | "The administrator creates a supplier, and the student sees it at once. The administrator edits it, deactivates it, and the student no longer finds it in the list. Then it is reactivated. This is the whole supplier-management experience." | `201`, then `200` for the student, `200` for the edit, `status=Inactive`, `total=0` for the student, and `status=Active` again |
| Logging out ends a session at once | "A second administrator session is allowed to create. It logs out, and the Supplier Service refuses it immediately, because the session lives in the user-service and not in the cookie." | `HTTP 400` while logged in (allowed, only the empty body is refused), `HTTP 204` for the logout, then `HTTP 403 FORBIDDEN` |
| What the database now holds | "This is the row the administrator created, in PostgreSQL. Who created it and who last changed it is the administrator's real account id, from the user-service's answer." | `created_by` and `updated_by` both the administrator's UUID, `was_edited = t`, and a count of Active suppliers |
| What the two services logged | "Registration, the email, the verification and each login in the user-service, and each decision in the Supplier Service, in time order." | Lines such as `account registered`, `verification code sent`, `account verified`, `login succeeded` from `user-service`, and `refused` or `authorized (supplier.create, account 122e6583)` from `supplier-service` |
| Clean up | "The demo removes only its own supplier and its own student account." | `DELETE 1` and `Removed the demo student accounts, as the administrator.` |

Reads that were allowed are not in the log lines, because the request log already
holds them and there are a great many. A logged-out session is refused at once for
every change. A read on the same session may continue for up to 5 seconds, because
the approval of a read is remembered.

**Closing line:** "A real account registers, verifies its email and logs in. The Supplier
Service asks the user-service what that session may do, and the database changes
only for the person allowed to change it."

---

# Showing it on screen

There is no UI yet, so the audience needs another way to see results. Split one
screen into three panes, so that every call shows up in three places at once:

| Pane | What the audience sees | Command, from the repository root |
| --- | --- | --- |
| A, left, large | The calls and their answers | `PAUSE=1 bash supplier-service/demo/demo.sh end-to-end` |
| B, top right | What both services decided and logged | the command below |
| C, bottom right | The database, refreshed every second | the loop below |

In Windows Terminal, `Alt+Shift+Plus` splits a pane to the right,
`Alt+Shift+Minus` splits it downward, `Alt+Arrow` moves between panes, and
`Ctrl+Plus` makes the text bigger for the room. Run the `docker` commands in
PowerShell. Pane B turns each event of the two services into one readable line:

```powershell
docker compose logs -f --tail 0 user-service supplier-service | ForEach-Object { if ($_ -match '^(\S+)\s+\|\s+(\{.*\})$') { $svc = $Matches[1] -replace '-1$',''; $j = $Matches[2] | ConvertFrom-Json; if ($j.msg -match 'authorized|refused|login succeeded|account registered|account verified|verification code') { '{0}  {1,-16} {2}  {3} {4}' -f [DateTimeOffset]::FromUnixTimeMilliseconds($j.time).LocalDateTime.ToString('HH:mm:ss'), $svc, $j.msg, $j.operation, $j.accountId } } }
```

Pane C, in PowerShell:

```powershell
while ($true) { Clear-Host; docker compose exec -T supplier-db psql -U supplier -d supplier -c "SELECT to_char(updated_at,'HH24:MI:SS') AS changed, name, type, status, left(created_by, 8) AS by FROM suppliers ORDER BY updated_at DESC, name LIMIT 6" -c "SELECT status, count(*) AS suppliers FROM suppliers GROUP BY status ORDER BY status"; Start-Sleep 1 }
```

The same for Git Bash, which needs Docker on its path first. Pane B here shows the
raw JSON lines that mention those events:

```bash
export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"
docker compose logs -f --tail 0 user-service supplier-service | grep --line-buffered -E 'authorized|refused|login succeeded|account registered|account verified|verification code'
while true; do clear; docker compose exec -T supplier-db psql -U supplier -d supplier -c "SELECT to_char(updated_at,'HH24:MI:SS') AS changed, name, type, status, left(created_by, 8) AS by FROM suppliers ORDER BY updated_at DESC, name LIMIT 6" -c "SELECT status, count(*) AS suppliers FROM suppliers GROUP BY status ORDER BY status"; sleep 1; done
```

Pane C lists the six most recently changed suppliers, newest first, with the first
eight characters of the account that made the change, and the count of Active and
Inactive suppliers. A supplier changed through the API jumps to the top with the
time of the change and the administrator's account id, so the audience sees the
database react.

## What appears, step by step

This is what the three panes showed when we rehearsed it with real sessions.

| Step | Pane A: the call | Pane B: the services | Pane C: the database |
| --- | --- | --- | --- |
| A student lists suppliers | HTTP 200 and the names | Nothing, because allowed reads are not logged | Nothing changes |
| A student tries to create one | HTTP 403 | `supplier-service refused supplier.create` | Nothing changes, still 21 Active |
| An administrator creates one | HTTP 201 and the supplier | `supplier-service authorized supplier.create 122e6583-...` | A new row at the top with `by = 122e6583`, Active count 22 |
| The administrator renames it | HTTP 200 | `supplier-service authorized supplier.update 122e6583-...` | The row's time and name change |
| The administrator deactivates it | HTTP 200, status Inactive | `supplier-service authorized supplier.deactivate 122e6583-...` | Its status turns Inactive, counts read 21 Active and 1 Inactive |
| The administrator reactivates it | HTTP 200, status Active | `supplier-service authorized supplier.update 122e6583-...` | Its status turns Active again, count 22 |

In `end-to-end`, pane B also shows `user-service account registered`,
`verification code sent`, `account verified` and `login succeeded` as they happen.

The best single moment to point at is the creation step: the 201 on the left, the
`authorized supplier.create` with the administrator's account id at the top right,
and the new row with the same id at the bottom right, all from one request.

Two things to say if asked. Pane C reads the database directly, so it shows what
is really stored, not what the API reports. And the User Service does not log each
question, so the decisions in pane B are the Supplier Service's record of the
answers it got.

## Keep a record for the report

To save everything the script printed:

```bash
bash supplier-service/demo/demo.sh | tee demo-output.txt
```

A screenshot of the three panes right after the creation step is the strongest
single image for the report.

## If a pane cannot be used

- **Pane B.** Docker Desktop shows the same logs: Containers, then the `relay`
  group, then `supplier-service` and `user-service`, then Logs.
- **Pane C.** Any database tool can replace it. Connect to `localhost` port
  `5433`, database `supplier`, user `supplier`, password `change-me` (or your
  `.env`), and refresh after each step.
- **The best fix is the UI.** Once point 5 exists, pane A becomes the browser and
  the audience sees suppliers appear on a real page while panes B and C show
  what happened behind it.

---

# If something goes wrong

| Symptom | Fix |
| --- | --- |
| `$'\r': command not found` or `set: -: invalid option` | The script has Windows line endings, which bash cannot read. Fix the file with `sed -i 's/\r$//' supplier-service/demo/demo.sh`. The repository's `.gitattributes` keeps `.sh` files on Unix line endings in future checkouts |
| The script says the Supplier Service does not answer | `docker compose up --build`, then `docker compose ps` should show every service `healthy` |
| `Could not log in ... as the administrator` | The user-service was started with a different `ADMIN_USERNAME` or `ADMIN_PASSWORD`. Put the same values in `.env`, or `docker compose down -v` and start again |
| `The verification email ... did not arrive in Mailpit` | Mailpit is at <http://localhost:8025>. Check it is running with `docker compose ps` |
| `independent` fails on port 5173 | A web client dev server is running. Stop it, and run the part again |
| `tests` prints a command instead of running | The shell has no `npm` or the packages are not installed. Run `npm install` and `npm test` in `supplier-service` from PowerShell |
| `docker: command not found` in Git Bash | Use PowerShell for the `docker` commands. The script already adds Docker to its own path |
| Counts differ from 21 suppliers | Someone changed the data, or a run in a shell without Docker left an Inactive `Demo Cafe` record. `docker compose down -v` and start again |
| Demo student accounts are left in the user-service | The script was interrupted before it cleaned up, or `KEEP=1` was set. Delete them as the administrator with `DELETE /users/{id}` |
| A change you made straight in the database does not show | Search results are kept for 2 seconds. Wait, or change it through the API |
