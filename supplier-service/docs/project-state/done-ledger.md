<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-10-01
Scope: Backfilled this ledger at phase granularity from git history and ai/usage-log.md, per the
       maintaining-project-state skill. No requirements, architecture, schema, or API decisions were
       made by the AI tool.
Author review: Congchen
Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added the W8 supplier bookmarking line.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Added the W9 Supplier-Order-Service-Key line.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review:
-->

# Done Ledger — Supplier Service

The full chronological record of every change, newest first. One line each: what changed and
why, with a commit, plan or artifact as the reference. Not a copy of `git log`. **The entries below
2026-10-01 are a coarse backfill (one line per milestone, not per commit); the ledger is precise from
2026-10-01 onward.** Workstream IDs refer to `../../PROJECT_STATE.md` § Workstreams.

| Date | What changed | Workstream | Ref |
|---|---|---|---|
| 2026-11-09 | Supplier-Order-Service-Key fallback added to `GET /suppliers/:id` and `GET /suppliers/reference/location` (authenticate.ts, requireRole.ts, config.ts, constantTimeEqual.ts); 444/444 tests pass; branch pushed, PR opened for Congchen, not merged | W9 | branch `feat/stage-c1-supplier-service-key-access`, C54 |
| 2026-11-05 | Supplier bookmarking built: `ids` filter and `unavailable` array on `GET /api/v1/suppliers` (40 files / 419 tests), plus user-service bookmarks and the frontend Bookmarked filter; browser check not run | W8 | `d02f3b0`…, spec/plan 2026-11-05, C53 |
| 2026-10-01 | Bootstrapped `PROJECT_STATE.md` and this ledger; copied the `maintaining-project-state` skill into `../.claude/skills/` with a monorepo note | — | uncommitted (A1, D19) |
| 2026-09-30 | Supplier responses now carry `location_id`, `faculty_id` and `categories: [{category, category_id}]` (team decision) | W7 | `05a0386`, Arch §9 item 23 |
| 2026-09-30 | OpenAPI 3.0.3 description of all endpoints and `npm run seed` seed-as-test; frontend wired to the service and two frontend bugs fixed | W7 | uncommitted (Q5, D15, D17) |
| 2026-09-30 | Phase 5 planned in a separate session: Task 1 ready, Tasks 2–5 need team decisions; plan file not in the checkout | W6 | D14, Q1, Q6 |
| 2026-09-30 | Phase 4 done: soft delete `DELETE`, transactional outbox, BullMQ relay/worker/dead letter, reactivation through the edit cycle, `supplier-worker` container; 343 tests | W5 | `194854b`…`ed93901` (17 tasks), plan phase-4 |
| 2026-09-30 | Phase 3 done: `PUT /admin/suppliers/:id` with version check, photo plan/saga, cleanup-job producer; 256 tests | W4 | `7a44642`…`316e3da`, plan phase-3 |
| 2026-09-29 | Tests moved from `src/` to a mirrored `test/` folder; build config split (`tsconfig.build.json`) | W3 | `6cbd8b3` |
| 2026-09-29 | Phase 2 done: admin list/detail, lookup management, `POST` create/reactivate with `Idempotency-Key`, photo storage port with MinIO adapter, hours migration (`migrate:phase2`); 210 tests | W3 | `32ea706`…`a75d4d7`, plan phase-2 |
| 2026-09-29 | Phase 1 done: requester list/detail/reference endpoints, `is_open` in SGT, compose wiring; live-verified with a real token; 101 tests | W2 | `860cc08`…`d5301ac`, plan phase-1 |
| 2026-09-28 | Phase 0 done: scaffold, config, MySQL schema migration, Redis client, error envelope, rate limiter, auth and role middleware, `/api/v1` wiring; 26 tests | W1 | `ee93cdc`…`65f8162`, plan phase-0 |
| 2026-09-28 | Architecture updates recorded: single-gateway/CORS, name+type+location uniqueness with reactivation, `is_active`/`is_deleted` independence, `super admin` role literal | — | `4b23134`, `dcad935` |
| 2026-09-27 | Supplier Service architecture document and phased spec created (Phases 0–5, issues #40–#46, #60, #61) | — | `20cc6a0`, `4b23134` |

**Archive:** none yet — start `archive-YYYY-QN.md` beside this file past ~100 entries
