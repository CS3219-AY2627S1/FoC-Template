# CHANGE-095: Personal status options match requester/courier views

- Date / approver: 2026-10-09 / Yao Xiang, explicit correction of CHANGE-094 on the confirmed current branch.
- Scope: existing Order frontend filter and its two callers/tests only; no API, domain, query, event, scheduler, auth or peer change. Preserve pending CHANGE-092/093/094.
- Classification: approved UI refinement under ADR-025/032; F2/F8/F9 and NFR2/NFR3. Shared frontend changes are the existing authorized slice.

## Effective behavior

Requester options: All statuses, OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP, DELIVERED, COMPLETED, CANCELLED, EXPIRED. Never ABORTED because aborts are courier-attempt history. Courier options: All statuses, ACCEPTED, IN_PROGRESS, PICKED_UP, DELIVERED, COMPLETED, ABORTED. Never OPEN/EXPIRED/CANCELLED. Use explicit OrderMode prop on the existing filter, retain same Base UI/labels, defaults/reset/page/API/polling. This limits selectable options only; backend ownership/auth remains authoritative and existing data query behavior is retained.

## Verification

Tests first: rendered option regressions produced 2 expected failures / 6 passes (target/change095-red.log). Final npm test: 60 tests across 15 files passed, zero failures/skips. npm run lint: exit0, zero errors and 12 existing login/profile warnings. npm run typecheck: exit0. Eight isolated actual-component browser checks at 320/768/1440/1920 verify both exact mode option lists, status selection/paging/reset/empty/no overflow (target/change095-browser/browser-evidence.json). Auth/API/supplier names are fixtures and Geist variables are omitted; no real auth/peer/font verification. Backend source/contract unchanged; no backend or normal production build re-run. Earlier Docker/Google Fonts gaps remain; no Sprint completion claim.

Uncommitted source/test paths: frontend/src/components/orders/order-status-filter.tsx, frontend/src/app/my-requests/page.tsx, frontend/src/app/my-errands/page.tsx, frontend/src/app/order-history-pages.test.tsx. Persistent records: this change, current-sprint, ai-project-context MD/TOML, ADR-032, Sprint2/3 README, personal filtering diagram, architecture-evolution, change-log, service-contracts, requirements-traceability, Yao Xiang active work, root AI disclosure and ignored existing learning. These overlap prior pending CHANGE-094; no mixed staging/commit/push/deployment.
