# AI usage log (Order Service + Load test)

Shared FoC log for **Order Service** and **Load test** work owned by
**Varun Sivakumar**. Other teammates may append their own sections.

**Tool:** Cursor (Auto)

**Author review (applies to every entry below):** Varun Sivakumar generated
ideas, designed implementation, validated correctness, edited where needed,
and verified behavior/tests.

**Plans:** Cursor plan files under [`plans/`](plans/) are **author design
notes** reworded for agent execution. They are not AI-originated architecture
or requirements elicitation. Prohibited phases (requirements prioritization,
architecture/design decisions, idea generation, decision rationales) were done
by Varun Sivakumar before implementation assistance.

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

## File attribution map

| Location | How disclosed |
| --- | --- |
| `order-service/src/**/*.java`, config, Docker, docs | Per-file header |
| `order-service/.../db/migration/*.sql` | `AI_ASSISTANCE.md` only (no SQL edits) |
| `order-service/bruno/` | `AI_ASSISTANCE.md` only |
| `load-test/k6/load.js`, inference notes | Per-file header |
| `load-test` Helm + `setup/` | `load-test/AI_ASSISTANCE.md` |
