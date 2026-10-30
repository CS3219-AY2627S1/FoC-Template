<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 (Asia/Singapore).
Scope: Archived exact human spelling/error/routing corrections, confirmations, and key implementation responses.
-->

# Prompt archive — 025

## Exact user prompt

```text
sorry i made a mistake in my spelling a few prompts ago, it's not **`RESERVARTION_UPDATED` but should be RESERVATION_UPDATED.**
If the migration hasn’t been applied anywhere shared, can we edit it?

also, we need to make validation throw its own error type, and map only that to INVALID_ARGUMENT or 400. Everything else becomes INTERNAL or 500 with a generic message, with the real error logged on the server, so let's add a test that throws an ordinary TypeError from inside the service and checks for INTERNAL or 500 with no internal text

reserve retry after an update: since we currently do same request, same reply, i think it could be misleading especially after an update and the state has changed, so maybe we need to clarify in the contract that replies to mutating calls describe the state right after that operation, so need to call GetReservation for the current state

REST issues: the token is checked before route matching, so an unknown path without a token returns 401, not 404. we shd put the token check on each route like user service does, and add tests so that an unknown path without a token returns 404, a known path without a token returns 401
wrong methods currently return 404, not 405, but for now let's just note it as a known limitation, add a test documenting the 404
```

## Clarifications and exact answers

Question:

```text
Migration 006 is uncommitted here but has already run on your local database. Has anyone applied it to a shared database? I can edit 006 if it has not been shared; the local database will still need a one-time spelling correction.
```

Answer:

```text
No shared database has applied it
```

Question:

```text
I’m interpreting “everything else” as unexpected errors such as an ordinary TypeError, while preserving the existing business, authentication, and transient-database error mappings. Is that what you mean?
```

Answer:

```text
Yes, preserve known error mappings
```

## Key assistant responses (verbatim)

Thanks—that confirms I can edit migration 006. I’ll correct its spelling and update the local database’s label and check constraint without rerunning the identity/index changes. Existing business, authentication, and transient error mappings will stay; unexpected errors will return generic internal errors and be logged server-side.

All 74 credit-service checks pass, including the new TypeError, routing, wrong-method, and retry-snapshot tests. Migration 006 now uses `RESERVATION_UPDATED`. The local check constraint is corrected too; there were no misspelled rows to rename, and the sequence/index changes were left intact.

## Key outputs

Edited the confirmed-unshared migration 006 in place and corrected application,
test and current documentation spelling. Added ValidationError for deliberate
input validation. Ordinary TypeError and other unexpected errors now use the
generic internal response and log the original error server-side; known error
mappings remain. REST matches GET routes before token verification, returning
404 for unknown paths and unsupported methods and 401 for unauthenticated known
GET routes. Proto/README documentation states saved mutation replies are
post-operation snapshots and GetReservation reads current state. Regression
tests cover these behaviors and reserve replay after update/release.
