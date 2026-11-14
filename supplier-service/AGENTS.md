<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-28
Scope: Recorded the team-supplied Supplier Service tech stack. No requirements, architecture,
       schema, or API decisions were made by the AI tool.
Author review: Congchen
-->

# AGENTS.md — supplier-service

This file adds Supplier Service–specific guidance on top of the root [`AGENTS.md`](../AGENTS.md). It
never relaxes anything in that file; the root's allowed/prohibited-use rules, stop-and-ask triggers,
disclosure requirements, and `/ai/usage-log.md` process all apply here unchanged.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript |
| Runtime | Node.js |
| Web framework | Express.js |
| Database | MySQL |
| Cache / job-queue backing store | Redis |

This is the fixed stack for the Supplier Service. It is consistent with the four-tier design in
[`SupplierServiceArchitecture.md`](./SupplierServiceArchitecture.md) (§2, §6.1) and with
[`SupplierServiceSpec.md`](./SupplierServiceSpec.md)'s Phase 0 scaffold. Do not introduce a
different language, runtime, web framework, database engine, or job-queue backing store without a
recorded team decision — that would be an architecture/design change under root `AGENTS.md` §2.1
and requires the team to decide it first, not the agent.

Specific package choices within this stack (e.g. which MySQL or Redis client library to use) are
implementation detail, not architecture, and may be filled in by the agent per root `AGENTS.md` §1
— but if no such choice is written down anywhere yet, the agent should still surface what it picked
rather than deciding silently (see the "Library choices" note in
`docs/superpowers/plans/2026-09-28-supplier-service-phase-0.md`).
