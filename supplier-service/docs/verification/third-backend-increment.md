<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the commands and observed API/SQL results for the third
Supplier backend increment and its live PostgreSQL defect remediation.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the final review refactor, focused regression coverage, full
Supplier checks, live integration rerun, and independent cleanup check.
Author review: Reviewed and approved by @ron.
-->

# Third Supplier backend increment verification

Initially verified on 2026-09-26 from branch `feat/supplier-admin-mutations` while merging the issue #23 verification commit, then rerun from `agent/supplier-final-review-fixes` after final code-review remediation. Both runs used the real Compose User Service and isolated PostgreSQL databases. They did not run a frontend or modify User Service application code.

## Automated checks

| Check | Observed result |
| --- | --- |
| `npm ci` in `supplier-service/` | Passed; 570 packages installed from the lockfile |
| `npm run typecheck` | Passed |
| `npm test` | 24 suites and 208 tests passed after final review remediation |
| `npm run build` | Passed |
| `env DATABASE_URL=postgresql://supplier:verification-only@localhost:5432/supplier npm run db:generate` | Reported `No schema changes, nothing to migrate`; migration diff and migration-only status were empty |
| Strict `JSON.parse` of `package.json` and `nest-cli.json` | Passed |
| `docker compose config --quiet` with the required validation environment | Passed |
| `npm ci` and `npm run build` in `user-service/` | Passed; compatibility build only, with no User Service application changes |
| `npm run test:integration` | Passed after the runner refactor against disposable project `foc-supplier-smoke-40629-d9106285`; an independent label query found no remaining containers, volumes, or network |
| `git diff --check` | Passed |
| `git status --short` | Listed only intended remediation paths plus the deliberately untracked local `supplier-service/node_modules` symlink; the symlink is excluded from the commit and no migration artifact exists |

The successful migration drift checks were:

```sh
env DATABASE_URL=postgresql://supplier:verification-only@localhost:5432/supplier npm run db:generate
git -C .. diff --exit-code -- supplier-service/drizzle
git -C .. status --short --untracked-files=all supplier-service/drizzle
```

The successful Compose validation used:

```sh
env JWT_SECRET=compose-validation-secret \
  SUPPLIER_DB_ADMIN_PASSWORD=compose-admin-password \
  SUPPLIER_DB_MIGRATION_PASSWORD=compose-migration-password \
  SUPPLIER_DB_PASSWORD=compose-runtime-password \
  docker compose config --quiet
```

## Live API and PostgreSQL evidence

`npm run test:integration` built a clean deployment on host ports 3900/3901 and proved the following through public Supplier APIs plus full SQL snapshots:

- The initial database contained exactly 21 Suppliers. The fixed printer ID `ac2288df-661c-5d78-bcc1-ac6bca30fe51` was ACTIVE at version 0.
- A real registered MEMBER and two sessions for the bootstrapped ADMINISTRATOR logged in through User Service. Supplier forwarded their bearer headers to real `GET /auth/verify` calls.
- MEMBER create, full update, archive, and restore attempts each returned correlated 403 `FORBIDDEN`; the 21-row count and complete printer row/category snapshot were unchanged.
- A representative invalid administrator create returned correlated 400 `SUPPLIER_VALIDATION_FAILED` with errors for the server-owned `id`, duplicate categories, both sides of an unpaired coordinate, and a contradictory opening time. It wrote nothing.
- Two equivalent administrator creates were issued concurrently. Exactly one returned 201 with a UUID, `Location`, `ETag: "v0"`, ACTIVE version-zero representation, trimmed floor, null server-managed optional fields, and UTC timestamps; the other returned 409 `SUPPLIER_ALREADY_EXISTS` with that same `existingSupplierId`. SQL contained exactly one created row and 22 Suppliers total.
- MEMBER detail/list immediately exposed the new ACTIVE Supplier. A case-insensitive Unicode-NFC equivalent create returned 409 while ACTIVE, with no row or timestamp change.
- Unknown update/archive/restore targets returned 404. PUT without `If-Match` returned 428; weak, wildcard, list, unquoted, and leading-zero tags returned 400; ordinary stale and 200-digit canonical-but-stale tags returned 412. An invalid full body with the current tag returned 400. A full SQL snapshot and detail ETag stayed unchanged after every rejection.
- Two administrator sessions issued full updates concurrently with `If-Match: "v0"`. Exactly one returned 200/`"v1"` and the other returned 412; the winner kept the ID and `createdAt`, advanced `updatedAt`, replaced all editable fields and categories in SQL, and kept ACTIVE status.
- ACTIVE archive rejected missing, weak, stale, and huge stale preconditions with 428/400/412 and no mutation. The current `"v1"` produced an exactly empty 204, retained the row and ID, advanced it to ARCHIVED version 2, set archive/update times, and preserved editable fields/categories.
- MEMBER search omitted the archived ID and MEMBER detail concealed it as 404. MEMBER explicit ARCHIVED listing returned 403, while ADMINISTRATOR ARCHIVED list/detail returned the retained row and `"v2"`.
- A normalized duplicate of the ARCHIVED identity returned 409 with the same `existingSupplierId`. Repeated archive without `If-Match`, with weak `W/"v2"`, and with stale `"v1"` each returned an empty 204; the full SQL snapshot, including version and both timestamps, remained identical.
- Full update while ARCHIVED returned 200/`"v3"`, preserved status and `archivedAt`, advanced `updatedAt`, and replaced categories with exactly `SHOPPING`.
- Restore rejected missing, weak, stale, and huge stale preconditions without SQL changes. Current `"v3"` restored the same ID to ACTIVE version 4, cleared `archivedAt`, advanced `updatedAt`, and restored MEMBER visibility. Repeating restore with current `"v4"` returned the identical representation/tag and left the SQL snapshot unchanged; stale `"v3"` returned 412 without mutation.
- The seeded printer was edited through the API to version 1 with new text and exactly `PRINTING` plus `PICKUP_POINT`. Rerunning the migration service completed as a no-op, then the one-shot seed reported `Supplier seed completed: 0 inserted, 21 already present.` Total count stayed 22, both IDs remained unique, and complete snapshots of the edited seed row and created row were unchanged after each rerun.
- With User Service stopped, an administrator create probe and a catalogue read returned correlated 503 `AUTHENTICATION_UNAVAILABLE`; row count and both tracked SQL snapshots were unchanged while Supplier `/health` stayed 200. Authentication recovered after User Service restarted.
- Existing catalogue coverage also remained live: invalid-token 401, list/search/building/category filters, stable paging/sorting, 300/301-character search boundary, unsafe offset rejection, detail ETags, bundled JPEG serving, server-owned request IDs, and one query-redacted correlated completion log.

The runner ended with:

```text
PASS: real auth, mutation authorization, validation/preconditions, concurrent and ACTIVE/ARCHIVED duplicate creation rejection, create/update, archive/restore lifecycle no-ops, SQL retention, repeat-migration/seed preservation, catalogue reads, logging, assets, and fail-closed auth.
```

The runner generated a unique lowercase Compose project name from its process ID and a random UUID suffix. Its `finally` block removed only that per-run project with volumes and orphans, then asserted the same project's `docker compose ps --quiet` output was empty. A concurrent invocation may fail safely because ports 3900/3901 remain fixed, but it cannot remove the other invocation's containers or volumes.

## Live finding and remediation

The first concurrent-create run exposed a PostgreSQL-only 500 that the mocked generated-query tests had not caught: the Building Code placeholder inside `jsonb_build_array` had no inferred SQL type. The advisory-lock query now casts that parameter to `text`, and its query test asserts the cast. After the fix, the same live race returned one 201 and one 409 and the complete smoke passed.

Merge review found that the original runner proved stale updates sequentially, reran only the seed after edits, and reused a fixed project name whose initial cleanup could remove another run. The final runner instead uses two distinct real administrator tokens for simultaneous same-version PUTs, reruns both migrations and seed while comparing full snapshots, and generates a unique project name before starting anything. The complete live smoke passed again after these corrections.

Final code review found that the specification's phrase “race-safe database rule” could be read as applying duplicate rejection to PUT even though the approved contract reserves 409 for POST. The wording now explicitly scopes database serialization to same-normalized-key creation across ACTIVE and ARCHIVED rows. A persistence regression assertion confirms full update does not invoke the create-only duplicate check. The review also centralized the editable mutation-value type and strong ETag response formatting, extracted the duplicated archive/restore precondition matrix, and split the integration runner into focused catalogue, access/create, update, archive, restore, repeatability, and outage scenarios. The full 24-suite/208-test run, typecheck, build, and live integration smoke all passed after these structural changes.

## Scope and outstanding review

This evidence covers the Supplier backend, its disposable Compose runner, and documentation only. It adds no frontend, changes no User Service application code, claims no Order Service integration, and performs no physical Supplier deletion.

Project-author review of the third increment was completed and approved by @ron. The separate course-owner approval for the existing strict-JSON leading `"//"` disclosure convention remains pending for submission; no strict-JSON file changed in this increment.
