<!--
AI Assistance Disclosure:
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-11-09.
Scope: Recorded issue #64's Supplier browser assertion fix and verification.
Author review: PENDING.
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Added the consolidated project AI Use Summary for the Supplier backend foundation and its integration with the merged User Service contract.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Updated the consolidated summary for the authenticated Supplier catalogue-read increment and its live verification.
Author review of the second increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Updated the consolidated summary for the implemented and live-verified
Supplier administrator mutation increment.
Author review of the third increment: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Clarified that race-safe duplicate rejection applies to creation and
recorded the final code-review remediation.
Author review: Reviewed and approved by @ron.
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Added the User Service author's AI Use Summary paragraph.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Added the Order Service AI Use Summary paragraph.
Author review: Reviewed and approved by @mattis.
-->

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
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |
| Your Name | Your ownership |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure: each
microservice (`user-service/`, `supplier-service/`, `order-service/`,
`credit-service/`) lives in its own top-level folder.

```text
.
├── user-service/
├── supplier-service/
├── order-service/
├── credit-service/
├── <n2h-service>/
└── README.md
```

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

## AI Use Summary

OpenAI Codex (GPT-6) assisted on 2026-09-25 and 2026-09-26 with implementing the first three Supplier backend increments from the author-approved specification: NestJS/Drizzle and PostgreSQL foundations; guarded, edit-preserving seed identities; least-privilege Compose setup; real User Service bearer verification; authenticated catalogue reads; request correlation and bundled assets; and administrator-only create/full-update/archive/restore with strict bodies, normalized race-safe duplicate creation rejection, and ETag concurrency. The isolated real-service integration runner now verifies API and SQL mutation state, concurrent stale-write rejection, lifecycle no-ops, repeat-migration/seed preservation, and fail-closed authentication. No Supplier frontend, User Service application changes, Order Service integration, or physical Supplier deletion were included. Project-author review of all three backend increments was completed and approved by @ron. [Strict-JSON disclosure details](supplier-service/AI-DISCLOSURES.md#strict-json-files) retain the pending course-owner exception approval; the exact prompts and key-response summaries are recorded in `ai/usage-log.md`.

Claude Code (Claude Opus 5.5) assisted on 2026-09-26 with implementing the User Service
author's D2 work from the author's own design decisions:
- the React/Vite frontend authentication pages (sign in, create account, logout,
  session-expiry toasts)
- the nginx/Vite reverse-proxy gateway with data-named `/api/v1` paths
- User Service `authenticate`/`requireRole` middleware, `GET`/`PATCH /whoami`, and
  administrator role changes serialised by a database lock
- endpoint documentation

Claude also explained general concepts (JWT, browser storage, CORS vs reverse proxy,
PATCH vs PUT, idempotency, locking) used by the author to make those decisions.
Prohibited phases were avoided: the author chose the routing, storage, endpoint,
status-code and concurrency designs. All output was reviewed and tested by the author.
Prompts and key responses are in `ai/usage-log.md`; per-file attributions are in the
file headers and `frontend/AI-DISCLOSURES.md`.

Claude Code (Claude Opus 5.5) assisted on 2026-10-16 with implementing the Order Service core
from the author's approved plan: the errand lifecycle and its PostgreSQL schema, atomic state
transitions with an outbox, the deadline sweeper, Credit reply handling, a stub Credit Service,
the HTTP API with relationship-based authorization, the container, Compose services, gateway
routes and a demo script. The author made the design decisions listed in the plan's design
calls; Claude drafted them as proposals. Project-author review of the implementation is
pending. Prompts and key responses are in `ai/usage-log.md`; per-file attributions are in the
file headers.

OpenAI Codex (GPT-6) assisted on 2026-11-09 with issue #64 by updating the Supplier
browser test to check the existing "Request an errand from here" link and its exact
Supplier preselection URL after PR #59 removed the old placeholder. The existing
member and administrator browser journeys both passed locally. Author review is
pending; the exact prompt and verification results are in `ai/usage-log.md`.
