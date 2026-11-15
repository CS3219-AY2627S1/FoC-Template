<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Recorded the commands and observed results for the second Supplier backend increment.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Updated the review-remediation check matrix and live search/logging evidence.
The decisions and implementation were reviewed and approved by @ron.
-->

# Second Supplier backend increment verification

Verified on 2026-09-25 from the issue #18 worktree. The run used the real Compose User Service and isolated PostgreSQL databases; it did not run a frontend or modify User Service application code.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 19 suites and 110 tests passed |
| `npm run build` | Passed |
| `npm run db:generate` plus migration diff | No schema changes; no migration drift |
| `docker compose config --quiet` with required environment values | Passed |
| User Service `npm run build` | Passed; User Service has no implemented test suite |
| Strict `JSON.parse` of `package.json` and `nest-cli.json` | Passed |
| `git diff --check` | Passed |

## Live integration check

`npm run test:integration` passed against a fresh `foc-supplier-smoke` Compose project and then removed its dedicated containers and volumes. The runner verified:

- clean migration and exactly 21 seeded Suppliers;
- a second seed reporting `0 inserted, 21 already present`, without overwriting the archived fixture;
- real MEMBER registration/login and bootstrapped ADMINISTRATOR login;
- bearer verification through User Service, including invalid-token 401;
- default list, combined search/building/category filtering, repeatable stable pages, detail, and strong `ETag`;
- trimmed search at the 300-character boundary returning 200 and 301 characters returning the existing 400 validation shape with `fieldErrors.q`;
- MEMBER archive-list 403 and archived-detail 404, plus ADMINISTRATOR archived list/detail access;
- server-generated request IDs that ignore a supplied `X-Request-Id`;
- one correlated `supplier.http.request.completed` JSON line whose application `message` contains the expected request ID, method, query-free pathname, status, result, and numeric duration; the live query marker was absent from all Supplier logs, while Nest's standard non-sensitive JSON envelope supplied level/process/timestamp/context metadata;
- rejection of a page/size combination whose offset would not be a safe integer;
- `/assets/suppliers/PRINTER_COM2.jpeg` returning JPEG content;
- User Service stopped causing Supplier 503 while `/health` stayed 200, followed by successful recovery after restart.

The project author reviewed and approved this increment on 2026-09-26. The separate course-owner approval for the strict-JSON disclosure convention remains pending for submission.
