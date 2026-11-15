<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Recorded the commands, observed results, coverage boundaries, and cleanup
for the integrated responsive Supplier UI verification in issue #31.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
Scope: Recorded the expanded live validation, two-editor concurrency, missing
precondition, and mobile administrator evidence for issue #34.
Author review: Reviewed and approved by @ron.
-->

# Integrated responsive Supplier UI verification

Verified on 2026-09-27, most recently from branch `feat/supplier-ui-review-fixes`. The live run
used the production nginx frontend, real User Service, real Supplier Service, and fresh
private PostgreSQL volumes. No mock catalogue, developer `.env`, User Service application
change, or Order Service was involved.

## Automated checks

| Check | Observed result |
| --- | --- |
| `npm ci` in `frontend/` | Passed; 129 packages installed from the exact lockfile |
| `npm run lint` | Passed with no warnings |
| `npm test` | 10 suites and 30 tests passed |
| `npm run build` | Passed; TypeScript and Vite production build completed |
| `docker compose config --quiet` with explicit test-only secrets | Passed |
| `npm run test:e2e` | 2 Chromium journeys passed against the disposable six-service Compose definition, including live 400/412/428 responses; automatic volume cleanup completed |
| `./frontend/scripts/run-supplier-ui-demo.sh` | Passed end to end, including locked install, Chromium setup, frontend checks, browser workflow, and cleanup |
| `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` in `supplier-service/` | Passed; 25 suites and 213 tests passed |
| `npm run test:integration` in `supplier-service/` | Passed; API-only compatibility, PostgreSQL, role, ETag, seed, asset, metadata, and outage coverage remained intact |
| Review rerun: `npm ci` and `npm run typecheck` in `supplier-service/` | Passed; 577 locked packages installed and TypeScript completed without errors |
| Review rerun: focused Supplier controller/OpenAPI compatibility | Passed; 2 suites and 17 tests passed |
| `git diff --check` | Passed |

Install Chromium once before the browser workflow:

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
```

The repeatable wrapper performs dependency/browser setup, lint, component tests, build,
and the live workflow in one command:

```sh
./frontend/scripts/run-supplier-ui-demo.sh
```

The orchestrator selects three available host ports, generates a unique lowercase Compose
project name, and supplies fixed non-secret credentials that exist only in the disposable
databases. Its `finally` block runs `docker compose down --volumes --remove-orphans` for
that exact project. Playwright failure traces, screenshots, and video remain in ignored
local output directories; successful runs capture member-mobile and administrator-archive
screenshots in the per-run test results before cleanup.

After the successful run, Docker container, volume, and network queries filtered by the
`foc-supplier-ui` prefix were all empty. Failed test runs had also executed the same
project-scoped cleanup path.

## Live browser evidence

The MEMBER journey registered a real account, logged in through nginx/User Service, and
loaded the 21 seeded Suppliers through authenticated Supplier APIs. It verified:

- 21 live results and no Manage/Add/Edit/Archive control;
- case-insensitive `printer` search returning `Printer @ Com 2`;
- backend-metadata-backed Central Library filtering and PRINTING category filtering;
- descending-name sort, 12-row pagination from page 1 to page 2 and back;
- detail navigation showing Location Description, typical hours, and coordinates;
- member catalogue/detail usability at 1280 desktop and 390 mobile widths; and
- no document or body horizontal overflow at either width.

The ADMINISTRATOR journey logged in with the bootstrapped test administrator and verified:

- metadata-backed creation of an ACTIVE `Browser Verification Cafe` through the UI;
- mobile create/edit forms and archive/restore confirmations without horizontal overflow;
- a real backend 400 for a client-tampered non-metadata Building Code, with the error
  displayed beside the field and every valid draft value retained;
- two separately logged-in editor tabs loading the same original strong ETag, the first
  committing `Browser Verification Hub A`, and the second receiving a live 412 while
  preserving its different draft and offering working compare/reload actions;
- a direct gateway PUT without `If-Match` returning live 428 without mutation;
- Escape dismissal plus confirmation focus, disappearance from ACTIVE, and visibility in ARCHIVED;
- restore confirmation, disappearance from ARCHIVED, and return to ACTIVE;
- the same server-generated UUID before archive, while archived, and after restore; and
- management usability without horizontal overflow at desktop and 390-pixel mobile width.

Both journeys used real images/gateway routing and live database state. The runner ended:

```text
2 passed
PASS: live member/admin Supplier UI journeys and responsive overflow checks completed.
```

## Honest coverage boundary

The browser workflow proves the principal D2 presentation path plus a real backend 400
surfaced by the form, real two-editor 412 draft recovery, and a real gateway 428. Focused
component/API tests additionally prove duplicate 409 with an existing-record link, 428
reload guidance, distinct 503/network retry feedback, If-Match wiring, and the shared 401
session handler.

The existing API-only `supplier-service` integration runner remains authoritative for
direct MEMBER mutation 403s, simultaneous same-version administrator updates, malformed/
missing/stale ETags, SQL retention, duplicate races, repeat migration/seed preservation,
and User Service outage behavior. It starts no frontend, satisfying A11 independently.
This combined evidence covers the implemented D2 Supplier UI/API/database boundary without
claiming physical deletion, completed performance testing, a manual presentation rehearsal,
or future Order Service behavior.
