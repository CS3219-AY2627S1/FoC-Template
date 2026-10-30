<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-19–2026-10-22 (Asia/Singapore).
Mode/scope: Credit-service implementation support and project disclosure documentation.
Review: Earlier reviews are logged; latest documentation changes await human review.
Exact prompts, key responses and checks: credit-service/ai/usage-log.md, entries 001–044.
-->
<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-21–2026-10-22.
Scope: Maintained the final AI Use Summary section. Team review pending.
See order-service/usage-log.md. -->

# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## Friend on Campus (FoC)

**Friend on Campus (FoC)** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| ----- | ----- |
| Eunice | Order Service |
| Jade | User Service |
| Karthika | Credit Service |
| Maliha | UI |
|Sanya | Supplier Service |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── compose.yaml          # full stack: includes each service's compose file
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── shared/               # gRPC contracts/clients, RabbitMQ messaging
├── ui/
├── <n2h-service>/
└── README.md
```

- `shared/` holds code used by more than one service (proto contracts, gRPC
  clients, the messaging library), so it is not tied to a single service folder.
- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

## Run the whole stack (Docker)

Requires Docker Desktop. One-time setup:

```sh
npm run keys:generate --prefix user-service     # JWT keys (other services mount the public key)
cp user-service/.env.example user-service/.env
cp supplier-service/.env.example supplier-service/.env
cp credit-service/.env.example credit-service/.env
cp order-service/.env.example order-service/.env
```

Then, from the repository root:

```sh
docker compose up --build -d
docker compose ps -a          # *-migrate jobs Exited (0); everything else healthy
```

Open <http://localhost:8080>. The root `compose.yaml` includes each service's own
compose file (plus `shared/messaging` for RabbitMQ and `ui/`):

- **One entry point:** only the UI (nginx) publishes a port, `8080`. It serves the
  app and proxies `/backend/*` to the services. Databases, gRPC and RabbitMQ are
  reachable only on the shared `internal` network, by service name.
- **Migrations:** each service has a one-off `*-migrate` job; the service starts
  only after its job succeeds. Applied migrations are skipped on later runs.
- **Data:** each database uses a named volume, so data survives `down`/`up`.
  `docker compose down -v` deletes it.

```sh
docker compose logs -f <service>    # e.g. credit-service
docker compose down                 # stop, keep data
docker compose down -v              # stop and delete data
```

Each service can also run on its own from its folder (`docker compose up`); its
`compose.override.yaml` then publishes its ports and points it at peers on the
host. Stop standalone stacks before starting the full stack, and vice versa.

## Local service ports

REST and gRPC ports are the same inside and outside containers to make service
configuration predictable.

| Service | REST | gRPC | DB host port (standalone only) |
| --- | ---: | ---: | ---: |
| User service | 3001 | 50051 | 5432 |
| Supplier service | 3002 | 50052 | 54332 |
| Order service | 3003 | 50053 | 5434 |
| Credit service | 3004 | 50054 | 5433 |
| UI (nginx) | 8080 | — | — |
| RabbitMQ | — | — | 5672 (AMQP), 15672 (management UI) |

PostgreSQL containers listen on `5432` internally. In the full stack only the UI's
8080 is published; service and database ports are published only when a service
runs standalone. Container-to-container calls use service names and the internal
port; host processes use `localhost` and the published host port.

---

## AI Use Summary

### Credit service

This summary covers recorded assistance on feat/credit-implementation from
2026-10-19. Other team members' usage must be consolidated by the authors.

- **Tool and modes:** OpenAI Codex (GPT-6), implementation after human design
  finalization, bounded requirements interpretation/formatting, boilerplate,
  debugging, tests, refactoring, documentation and explanations.
- **Scope:** Credit's PostgreSQL schema and nine migrations; domain/repository/
  service implementation; atomic initialization, reservation, update, release and
  settlement; gRPC contracts/client retries and service-token authentication;
  authenticated own-balance/history REST with entry-ID bookmarks; RabbitMQ consumer
  integration; Docker/workspace setup; health reporting; tests, local demo
  preparation and attribution records. The [service README](credit-service/README.md)
  documents current interfaces, behavior and setup.
- **Human decisions:** Requirements, architecture, schema, interfaces, policies,
  locking, pagination and security changes came from the human authors. No
  requirements prioritization, backlog/sprint planning, design decisions or
  decision rationales were generated.
- **Prompts and key responses:** Exact exchanges, affected files, recorded reviews
  and actual checks are in [credit-service/ai/usage-log.md](credit-service/ai/usage-log.md),
  entries 001–044. Attribution comments identify AI-influenced files. The approved
  [JSON attribution table](credit-service/README.md#attribution-for-json-files)
  covers formats that cannot contain comments.
- **Verification:** The latest implementation run passed the Credit build and
  103 Credit checks, including scoped seeded ledger invariants and entry-ID
  paging. Earlier shared gRPC checks, Docker builds, live listener and local demo
  results are recorded separately in the log. This README update did not rerun
  them. Order/Credit demo integration has not been verified live. Agent checks
  do not establish human approval; latest documentation changes await review.
- **Provenance:** Shared messaging code belongs to @sunpterodactyl and the shared
  messaging contributors, imported from events/data-validation commit
  0b48f5f85be01d148176a6410c9ca22c2b8e672e. Its [provenance and original declarations](shared/messaging/README.md)
  are retained; Credit integration assistance does not claim that authorship.
  Official documentation consulted during implementation is cited in the usage
  log. Human authors remain responsible for licensing and assignment validation.
- **Submission:** Authors must review and validate assisted outputs, agree team AI
  norms, include the agent/skill instructions used, consolidate team disclosures,
  and link this README from the submission slides. Root AGENTS.md and
  credit-service/AGENTS.md are retained; no skills were invoked for these exchanges.

### Order service

Tool: ChatGPT (Codex), 2026-10-21–2026-10-22. Modes: implementation, configuration and documentation generation.
Used to install Express 5.2.1 and Prisma 6.19.3, transcribe and migrate the author-provided Order schema,
and configure a local Order PostgreSQL container after the author selected
PostgreSQL and Docker, following the existing User Service setup. Also generated the team-approved Express/gRPC startup, database-backed health,
environment validation and application Docker setup.
Also implemented author-specified creation, credit-edit recovery, cancellation
and expiry, with tests and a durable OrderEditOperation migration. Added the
author-approved administrator-only GET /orders listing with authorization tests.
Verified cancellation/expiry failure recovery and applied the team's plaintext
Order-to-Credit transport decision on order-functionality. Implemented the
author-requested authenticated courier acceptance endpoint and concurrency tests.
Added author-specified open/requested/assigned retrieval scopes and access/filter tests.
Implemented the author-approved delivery endpoint and durable Credit settlement
recovery, with real gRPC transport and PostgreSQL integration tests. Verified
the existing editing workflow with additional funding, concurrency and crash
recovery tests against real gRPC transport and Order PostgreSQL. The author
supplied the schema, contracts, retry schedule and final first-lock-wins rule.
Human decisions and superseded requirements are recorded in the service usage log;
no decision rationales were drafted.

Team review and validation remain pending. Prompts, key responses and verification
results are recorded in [order-service/usage-log.md](order-service/usage-log.md). Add a link to this README
to the submission slide deck. This entry covers this session only; the team must
record other AI use and include applicable AGENTS.md/SKILLS.md files before submission.

Order-only integration port, ChatGPT (Codex), 2026-10-24: transferred shared-client
usage, missing-account recovery, Supplier compatibility and courier pickup from
d3-demo into Order. Teammate implementations/root workspace metadata were not
merged. Dependencies and validation limits: Order INTEGRATION_NOTES.md and usage
log. Human review pending; normal build awaits shared contract PRs.

Main merge / PR preparation, ChatGPT (Codex), 2026-10-25: merged main at 2c8a068,
resolved root package-lock.json from main plus seven Order manifest entries,
and included main's .npmrc in the Order Docker context. Root JSON attribution
uses this summary and Order usage log. PR_DESCRIPTION.md documents implemented
APIs, reproducible reviewer tests and missing teammate contract prerequisites.
Human review pending; ordinary build is blocked until those contracts merge.

Shared prerequisites completed, ChatGPT (Codex), 2026-10-25: agreed Credit shared
contracts/client/types and Supplier validators are now tracked, with explicit
Zod dependency and approved JSON attribution in shared README/Order usage log.
Normal repository build and 128 shared/Order tests pass without overrides; Order
Docker builds normally. Full Credit business runtime remains the teammate PR;
this branch only keeps its scaffold type-compatible. Earlier build-blocker
notes are superseded by this update. Human review pending.

PR documentation refresh, ChatGPT (Codex), 2026-10-25: documented the existing
shared Supplier validators' runtime Zod import and corrected the dependency
summary in Order PR_DESCRIPTION.md. Prompt/checks: Order usage log. Human review
pending; documentation-only update.
