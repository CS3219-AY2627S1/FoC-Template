<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the exact implementation request, bounded clarification and key results.
-->

# Prompt archive — 031

Received across the 2026-10-21/22 session (Asia/Singapore).

## Exact user request

```text
also did we not enforce the database constraint that credit_amount and version have to be positive? our history signs are not constrained either

for sequence id i think let's take it out of REST replies because i dont want to expose it as part of the API, we can still use it internally, and the tests will have to read the database

also let's untrack user-decisions.md and `docs/reference/functional-requirements.md`, `nonfunctional-requirements.md` because these are only for our internal use, not required for AI attribution, and I don't want to bloat the repo when i merge this branch to main. so we need to fix the places where these are referenced as well

can we also add a /health route, we can see what user and order service is already doing, since my teammate is now doing containerisation for each service and i think this might be useful for the postman demo as well


```

## Key responses and bounded clarification

Initial response:

> I’ll check the database constraints and the health routes used by User and Order. Then I’ll remove `sequenceId` from REST history entries, update the tests, and untrack the three internal documents while keeping local copies and fixing their references. I’ll also check whether the history-sign constraints need any further definition from you.

Exact clarification:

> Should the history CHECK constraints enforce these exact deltas: INITIAL_GRANT (+10, 0), RESERVED (0, positive), RESERVATION_UPDATED (0, nonzero), RELEASED (0, negative), TRANSFER_OUT (negative, equal negative), and TRANSFER_IN (positive, 0)? The pair is (total_amount_change, total_reserved_change). These match your current business rules; please confirm the database rules.

Finding and response:

> The database currently lacks positive checks for reservation amounts and versions, and checks for history deltas. User and Order both expose a public `/health` route that returns 200 when the database responds and 503 when it does not; I’ll match that behavior. I’ll keep history sequence IDs internal and have the demo preparation read PostgreSQL to verify pagination order.

The root instruction file, existing service implementation and the selected local
Order branch were used; no new architecture or rationale was supplied. Exact
history-delta CHECK rules were confirmed by the human. Other authorized changes
were implemented independently. No skill or sub-agent was used.

Exact human answer:

```text
initial grant should be exactly 10, everything else is correct
```

Key follow-up response:

> Confirmed: `INITIAL_GRANT` must be exactly `(10, 0)`, with the other delta rules as listed. I’ll add those checks to migration 007 and test that PostgreSQL rejects invalid combinations directly.

## Outputs and actual checks

- New migration 007 adds positive amount/version and confirmed per-type history CHECKs; applied migrations are
  unchanged. Tests exercise invalid legacy migration rollback and direct SQL
  insertion/update rejections. Migration 007 was subsequently applied successfully to the local Credit database.
- REST history entries omit sequenceId while repository/service/cursors retain
  it. A real HTTP/PostgreSQL pagination regression compares public IDs against
  a SELECT ordered by sequence_id and excludes a write after the first page.
- GET /health is public, probes PostgreSQL SELECT 1, and follows User/Order's
  200 ok/up and 503 degraded/down JSON responses.
- The three exact internal reference paths were removed from Git's index and
  explicitly ignored. All three local files remain. Active links were replaced
  with retained AI archives; archive 003's attachment-copy links now explain
  their removal. Historical exact prompts/path mentions are retained.
- Postman source and regenerated collections omit public sequence assertions,
  add health, and read expected public pagination IDs directly from PostgreSQL.
  The generator removes its own stale numbered requests. Postman remains ignored;
  the temporary seed script remains unmodified and untracked.
- Workspace build passed. Credit tests: 84 passed, zero failures/skips against
  local PostgreSQL/listeners. Shared test listener checks were initially blocked
  by sandbox EPERM; their subsequent permitted localhost rerun is recorded in
  the usage log. Both Python scripts compile. All four collections lint cleanly
  (19 REST, 44 gRPC, 29 shared and one concurrency request). No new live combined
  Order integration or native Postman gRPC execution is claimed.

Human review remains pending; agent-run checks do not establish human approval.
