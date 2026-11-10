# AI usage log (Order Service + Load test + Admin Service + Badges + Rating + Frontend + User Service)

Shared FoC log. **Order Service** and **Load test** work is owned by
**Varun Sivakumar**. **Admin Service** work is owned by **Sahana Avantika**.
**Badges Service**, **Rating Service** and the **Frontend** are owned by
**Ngooi Jun Sen**. **User Service** is owned by **Josh Wang Kai Kiat**.

**Tool:** Cursor (Auto) for Order, Load test and Admin. Claude Code (Claude
Opus 5 until 2026-09-28, Claude Opus 5.5 from 2026-10-01) for Badges, Rating
and the Frontend. OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and
GPT-6.1 Sol) for User Service.

**Author review:** For Order / Load test entries, Varun Sivakumar generated
ideas, designed implementation, validated correctness, edited where needed,
and verified behavior/tests. For Admin Service entries, Sahana Avantika did
the same for that service. For Badges, Rating and Frontend entries, Ngooi Jun
Sen did the same, and per-file headers read "Reviewed by Ngooi Jun Sen". For
User Service entries, Josh Wang Kai Kiat generated the ideas, finalized the
requirements and design, reviewed and edited the implementation, and verified
the recorded behavior/tests.

**Plans:** Cursor plan files under [`plans/`](plans/) are **author design
notes** reworded for agent execution. They are not AI-originated architecture
or requirements elicitation. Prohibited phases (requirements prioritization,
architecture/design decisions, idea generation, decision rationales) were done
by the owning author before implementation assistance. The Badges, Rating and
Frontend plans were not written up front: they compile, on 2026-11-10, the
dated decisions Ngooi Jun Sen gave in Claude Code sessions, each made before
the work that implemented it.

---

## 1. Order Service build-out

| Field | Detail |
| --- | --- |
| Approx. dates | 2026-09 → 2026-10 |
| Mode | generate / implement / test / docs |
| Plan | [`plans/order_service_plan.md`](plans/order_service_plan.md) |

**Already decided by author:** Java 21 / Spring Boot Order Service; plain
PostgreSQL (no PostGIS); order state machine; transactional outbox to Kafka;
HTTP contracts with User / Credit / Supplier / Rating / Admin; proximity
ranking approach; photo rules; deadline sweeper; alerts for requester status
changes.

**What Cursor Auto produced:** Scaffold and implementation of domain,
persistence, REST, clients, messaging/outbox, photos, config, Docker/compose,
unit/integration tests, Bruno collection drafts, and design docs under
`order-service/docs/`. Flyway migration **SQL files were not given in-file
headers** (checksum / deploy safety); see
`order-service/src/main/resources/db/migration/AI_ASSISTANCE.md`. Bruno
collection disclosure:
`order-service/bruno/AI_ASSISTANCE.md`.

**Sample prompt scenario (summarized):** Implement the Order Service from the
author’s plan (state machine, create/accept/collect/deliver/ack/escalate,
outbox, tests) without changing service boundaries or inventing new product
requirements.

---

## 2. Full-load collapse fixes + load harness

| Field | Detail |
| --- | --- |
| Approx. dates | 2026-10 → 2026-11 |
| Mode | debug / refactor / implement / docs |
| Plan | [`plans/fix_order_loadtest.md`](plans/fix_order_loadtest.md) |

**Already decided by author:** 9600 VU peak profile; dual-role VU behaviour;
seed-then-k6 flow; scale-up/scale-down of HPA / RDS / burst nodes; diagnosis
that liveness must not share DB-backed readiness under load; capacity targets
for Order and create-path peers.

**What Cursor Auto produced:** Edits to Order liveness/readiness split and
related deploy values; k6 script implementation of the author’s scenario;
assisted edits to load-test Helm chart and seed scripts (mixed origin —
folder disclosure in `load-test/AI_ASSISTANCE.md`); Grafana/evidence notes
and scale-up/down documentation in `load-test/README.md`.

**Sample prompt scenario (summarized):** Fix Order restart storm under
full-1520 (split `/live` vs `/health`, durable proxy memory, raise capacity);
keep idle floors in Git after the run; document scale procedures.

---

## 3. Follow-ups (alerts, quality, idle footprint)

| Field | Detail |
| --- | --- |
| Approx. dates | 2026-11 |
| Mode | implement / refactor / debug / docs |

**Already decided by author:** Couriers must see dispute-lifecycle alerts
(Escalated / Under review / case Completed); frontend already polls
`GET /alerts` — no push channel; idle HPA floors and `burst_node_max` stay
cheap in Git; Sonar cognitive-complexity smell and Trivy apt CVE fixes for
Order image.

**What Cursor Auto produced:** `notify_courier` / `courier_id` on alerts
(entity, query, V9 migration content under author schema ownership — no
in-file SQL header), message factory flags, tests; Telegram HTTP client
refactor for Sonar; Dockerfile apt pin; load-test README scale section;
Grafana evidence markdown from CSVs.

**Sample prompt scenario (summarized):** Notify both parties on dispute
statuses; drain peak footprint after load test; clear Sonar/Trivy findings
and re-scan.

---

## 4. Admin Service build-out

| Field | Detail |
| --- | --- |
| Owner | Sahana Avantika |
| Approx. dates | 2026-09 → 2026-11 |
| Mode | generate / implement / test / docs |
| Plan | [`plans/admin_service_plan.md`](plans/admin_service_plan.md) |

**Already decided by author:** FastAPI Admin Service; conflict case state
machine; single resolve path with Kafka `admin.case.resolved` fan-out;
HTTP contracts with User / Order (intake + evidence); schema for
`conflict_cases`, append-only `audit_logs`, reports and appeals; Gemini
advisory AI; durable APScheduler timers; gateway 404-not-403 admin check;
internal mesh-only intake.

**What Cursor Auto produced:** Scaffold and implementation of routers,
services, models, schemas, jobs, tests, Docker/compose, config, design docs
under `admin-service/docs/`, and ops scripts (including open-escalation
cleanup). Alembic revision **files were not given in-file headers**
(checksum / deploy safety); see
`admin-service/alembic/versions/AI_ASSISTANCE.md`.

**Sample prompt scenario (summarized):** Implement the Admin Service from the
author’s plan (F1 user admin, F3 conflicts, moderation queues, Kafka
publishes, tests) without changing service boundaries or inventing new
product requirements.

---

## 5. Rating Service build-out

| Field | Detail |
| --- | --- |
| Owner | Ngooi Jun Sen |
| Approx. dates | 2026-10-10 → 2026-11-09 |
| Mode | generate / implement / test / debug / docs |
| Plan | [`plans/rating_service_plan.md`](plans/rating_service_plan.md) |

**Already decided by author:** Fastify / TypeBox / Drizzle stack mirroring
Credit; one unified average per user (overriding per-role averages in the
backlog); Order-issued grants on `foc.rating.commands` with the frontend
POSTing the score; outbox for `user.rating.updated`; flat message format and
`{ error, code }` errors; server-side skip; account deletion by anonymising
given ratings (option A); Kafka DLQ instead of a dead-letter table; Rating in
CI.

**What Claude Code produced:** Scaffold and implementation of routes,
services, Kafka consumer, outbox relay, grant handling, skip, account
deletion, DLQ and replay script, Vitest tests, Helm values and Kafka topic
config, the CI job, and design docs under `rating-service/docs/` (README,
sequence diagrams, interfaces, schema). Drizzle migration **SQL files have no
in-file header**: drizzle-kit generates them from the AI-assisted
`src/database/schema.ts` and they must not be hand-edited.

**Sample prompt scenario (summarized):** Build the Rating Service from the
author's decisions (grants from Order, submit only with a grant, unified
average, outbox to Badges) without changing Order or inventing new product
requirements; later, add server-side skip, account deletion option A and a
Kafka DLQ.

---

## 6. Badges Service build-out

| Field | Detail |
| --- | --- |
| Owner | Ngooi Jun Sen |
| Approx. dates | 2026-09-21 (scaffold), 2026-10-30 → 2026-11-09 |
| Mode | generate / implement / refactor / test / docs |
| Plan | [`plans/badges_service_plan.md`](plans/badges_service_plan.md) |

**Already decided by author:** separate service and database; revocable
badges keyed by user ID; owner-only `GET /api/v1/badges/{userId}`; the list
of counted order statuses; fault-aware dispute counting from
`admin.case.resolved`; events only (the daily poll and admin manual run
dropped for coupling and scalability); catalog re-check at startup; badge
names; account deletion with a tombstone; Kafka DLQ with capped replay.

**What Claude Code produced:** Scaffold and implementation of the event
handlers (order, rating, admin, user), counting and dispute logic, badge
evaluator, catalog seeding and re-check, DLQ and replay script, read route,
Vitest tests, Helm values, and design docs under `badges-service/docs/`
(README, sequence and state diagrams, interfaces, schema). The removal of the
earlier poll and admin run was also done by Claude Code at the author's
instruction. Drizzle migration SQL files have no in-file header, as for
Rating.

**Sample prompt scenario (summarized):** "If there's a dispute we don't know
who is at fault, so badges can be wrongly revoked": implement the author's
rule (requester at fault → courier counts, courier at fault → requester
counts, no fault → both); "what if you just don't do the polling": remove the
poll and rely on events only.

---

## 7. Frontend

| Field | Detail |
| --- | --- |
| Owner | Ngooi Jun Sen (admin pages handed to a teammate on 2026-11-02) |
| Approx. dates | 2026-09-22 → 2026-10-15 on `frontend` (D2), 2026-10-20 → 2026-11-10 on `frontend-v2` |
| Mode | generate / implement / debug / review / docs |
| Plan | [`plans/frontend_plan.md`](plans/frontend_plan.md) |

**Already decided by author:** React + TypeScript + Vite served by nginx;
design tokens from the D1 wireframes; comment out anything without an endpoint
instead of faking it; delivery points, map picker, snapping distance and the
campus geofence shape; friends and names-once-friended; the alerts bell on
Order's alerts; dropping photos for requesters (UI FR7.4) and the Account
status page; visual and layout changes reported during the author's testing.

**What Claude Code produced:** Scaffold, pages, components, the `api.ts`
client and polled stores, route guards, nginx and Vite proxy config, the
frontend deploy script, fixes for issues the author found while testing on
the local cluster, reviews of teammates' PRs against the API contract (for
the author to raise with owners; other teams' code was not edited), and docs
under `frontend/docs/` (flows and interfaces). For D2, pages were generated
from the desktop and mobile mockups against the UI backlog and D2 Part 2.
Also a draft list of campus delivery points (CSV) and the campus geofence
coordinates, drawn to the author's boundaries; the list was for the author to
share with the Order owner, who decides what Order stores.

**Author edits on review (recorded in file headers):** supplier filter chips
moved to a grid layout; supplier status shown in uppercase; role code and the
role column removed from the admin users page; medium password strength
recoloured to `--color-warning`.

**Sample prompt scenario (summarized):** "Comment out sections that don't
have endpoints, i.e. the photos, names, and remove all sample data"; "show
the Telegram handle and then the real name when friended"; "suppose the
pickup is within E3, change the geofence accordingly and cut off the top
part along the expressway".

---

## 8. User Service

| Field | Detail |
| --- | --- |
| Owner | Josh Wang Kai Kiat |
| Dates | 2026-09-25 to 2026-11-11 |
| Tool | OpenAI Codex (GPT-5.6 Luna, GPT-5.6 Sol, GPT-6 Sol and GPT-6.1 Sol) |
| Mode | generate / implement / test / debug / refactor / docs / explain |
| Plan | [`plans/user_service_plan.md`](plans/user_service_plan.md) |

**Already decided by author:** User Service ownership and boundaries;
Node.js/Express/TypeScript with Prisma/PostgreSQL; opaque server-side
sessions; salted `scrypt` password hashes; email and Telegram verification;
account status, lockout, password recovery and six-month deletion behavior;
Admin report/appeal and user-management contracts; bidirectional friendship
rules; durable Kafka outboxes for user lifecycle events; endpoint shapes,
validation rules, security boundaries and failure behavior.

**What Codex produced:** TypeScript/Express implementation and refactoring;
Prisma schema and migration drafts under the author-decided schema; unit and
integration tests; OpenAPI definitions; Docker/Compose and configuration
boilerplate; debugging fixes; documentation wording and diagrams. Applied
Prisma migration SQL files have no in-file headers; see
`user-service/prisma/migrations/AI_ASSISTANCE.md`.

**Verification recorded:** TypeScript builds, Prisma validation, unit tests
and isolated PostgreSQL integration suites were run throughout development.
The latest recorded User Service checks before this disclosure included the
build, 97 unit tests, and isolated friendship, Admin-user and account-support
integration suites. The author also manually verified signup, email OTP,
Telegram verification, login and password reset through the frontend.
Historical results apply to the revisions tested; they do not replace final
submission acceptance or the outstanding load-test evidence noted in the
User Service README.

**Sample prompt scenario (summarized):** Implement and test the User Service
according to the author-finalized requirements and architecture: authentication
with opaque sessions, email/Telegram verification, password recovery, Admin integration,
friendships, scheduled account deletion and Kafka lifecycle events. Generate implementation code,
migration drafts, OpenAPI documentation, tests and configuration without changing service boundaries,
interfaces, schema decisions, requirement priorities or security trade-offs. Explain the changes and
report the verification results.

---

## File attribution map

| Location | How disclosed |
| --- | --- |
| `order-service/src/**/*.java`, config, Docker, docs | Per-file header |
| `order-service/.../db/migration/*.sql` | `AI_ASSISTANCE.md` only (no SQL edits) |
| `order-service/bruno/` | `AI_ASSISTANCE.md` only |
| `admin-service/app/**/*.py`, tests, config, Docker, scripts, docs | Per-file header |
| `admin-service/alembic/versions/*.py` | `AI_ASSISTANCE.md` only (no revision edits) |
| `supplier-service/src/**/*.ts`, tests, Prisma schema/seed, Docker, config | Per-file header |
| `supplier-service/prisma/migrations/*.sql` | `AI_ASSISTANCE.md` only (no SQL edits) |
| `load-test/k6/load.js`, inference notes | Per-file header |
| `load-test` Helm + `setup/` | `load-test/AI_ASSISTANCE.md` |
| `rating-service/src/**`, tests, scripts, config, Docker | Per-file header |
| `badges-service/src/**`, tests, scripts, config, Docker | Per-file header |
| `rating-service/drizzle/*.sql`, `badges-service/drizzle/*.sql` | This log only (drizzle-kit output from the headed `schema.ts`; not hand-edited) |
| `badges-service/README.md` and `docs/` | README "AI assistance" section |
| `rating-service/README.md` and `docs/` | This log only |
| `frontend/src/**`, `nginx.conf`, `vite.config.ts`, Docker | Per-file header |
| `frontend/README.md` and `docs/` | README "AI assistance" section |
| Rating and Badges entries in shared deploy files: `deploy/values/services/{rating,badges}.yaml` and their `envs/local` overrides, routes in `deploy/charts/foc-gateway/values.yaml`, topics and users in `deploy/charts/foc-kafka/values.yaml`, the databases in `infra/local/aws/variables.tf`, `RATING_SERVICE_URL` in `deploy/values/services/order.yaml`, Rating in `.env.example` | This log only (shared files; no header added) |
| Rating and Badges jobs in `.github/workflows/ci.yml` | This log only |
| AI-influenced `user-service/src/**/*.ts`, `scripts/*.cjs`, Prisma schema, Docker/Compose and comment-capable config/docs | Per-file header |
| `user-service/prisma/migrations/*.sql` | `user-service/prisma/migrations/AI_ASSISTANCE.md` only; applied SQL unchanged |
| `user-service/package*.json` and generated artifacts | This log and User Service README; format does not support comments or content is generated |
