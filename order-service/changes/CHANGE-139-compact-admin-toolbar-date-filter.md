# CHANGE-139 — Compact admin toolbar and calendar date range

Yao Xiang, order-service/penalty-integration,2026-10-17. User confirms a table-row
height toolbar, existing refresh icon only, calendar-icon date controls like the
reference without visible "Created from" text. Prior date-filter proposal defines
creation date as the initial date basis; additional history/export/report actions
remain proposals, not authorization. No new financial action.

Implementation refinement of ADR-047: reuse existing buttons/RefreshCwIcon/calendar
controls; compact selected count rather than full ID block, attach toolbar to the
table. Native date pickers retain accessible start/end labels and tooltips despite
the compact visible presentation. Blank defaults mean all dates. Local calendar
days convert to UTC instants: start inclusive, next day after end exclusive.
Validate inverted ranges, preserve filters during refresh, clear selection on
refresh/query change, guard late responses through existing useAdminPage. Wrap
on phones. Existing Order ID/status search and View/profile navigation remain.

Extend existing admin GET /api/orders with optional createdFrom/createdBefore
ISO8601 instants and optional exact orderId; combine SQL predicates before count,
sort and pagination. Date-only controls are browser UI, backend timestamps are
explicit instants. Retain old status/page behavior and production ADMIN guard.
Use conditional JPA Criteria predicates, avoiding fetch-all/page-memory filtering
and null-parameter PostgreSQL inference issues. Sort createdAt descending then id.
No schema migration; existing status/date index retained. No new peer dependency.
Local gated sample list applies equivalent date boundaries to its memory-only
fixtures; actual DB path remains real SQL. No live-error mock fallback.

Testing: UI calendar labels/refresh/filter reset, date conversion/range errors,
adapter paths, query validation, production MVC binding/auth, real PostgreSQL
inclusive/exclusive boundaries and filtered totals/page order. Existing financial
UI/API regression coverage retained. Scope only Order/frontend and authorized
disclosure; no sibling backend/shared config/cloud changes.

## Final verification — 2026-10-17

- RED: new calendar/refresh UI test failed for missing controls; query test failed compilation before the date-search overload. Focused77 backend and20 frontend tests passed after implementation.
- Fresh final root verify passes common12 + Order499 =511 tests, zero failures/errors/skips, both coverage checks and executable JAR. The first full run exposed a stale controller-signature reflection fixture (fixed) and6 existing recovery assertions. Recovery26 passed isolated and final complete rerun passes without changing recovery/lifecycle code; the initial transient recovery failures' root cause was not established, and no permanent recovery fix is claimed. Logs: target/change139-verify.log, change139-recovery-check.log, change139-verify-final.log.
- Frontend41 files/224 tests pass. Final production build includes TypeScript success. Lint passes0 errors with3 existing login-form unused-variable warnings. Date tests cover local midnight/end-day conversion, open/same-day/invalid ranges, server adapter composition, icon refresh preserving criteria and invalid-range/no-HTTP/clear behavior.
- PostgreSQL tests prove start-inclusive/end-exclusive and exact-ID/status conjunction before page/count, last included microsecond, excluded next midnight, one-sided bounds, totals, page order and unrestricted ranges. Production MVC verifies admin role/binding/malformed dates; mock route parity verified independently. Pageable-reflection fixture updated for additive query arguments, preserving one-based/capped semantics.
- Built frontend/current Order preview in hidden Edge on separate ports3089/8189/8190/9339. Desktop1440x1000 toolbar measured41px; screenshot shows icon-only refresh and calendar fields with no Created-from label. Actual sample date filtering changes results, Clear restores them, Refresh keeps dates and clears stale selected row. At390x844 controls wrap and page has no horizontal overflow; table scroll stays separate. Screenshots target/change139-toolbar-desktop.png and change139-toolbar-mobile.png visually inspected. Existing user Compose stack was left running, preview account/processes removed. No real financial mutation performed.
- Git diff whitespace and unmerged-entry checks clean. AsyncAPI YAML/Ajv checks unchanged/pass; TOML410 qualified keys unique (not a full parser validation). No peer source/shared config/schema/topic/cloud/Git history change. No commit or push.

Rollout: rebuild Order and frontend together in the chosen Compose mode. Existing local schema11 remains unchanged; no new migration. Cloud/staging authenticated date-search UI was not deployed/verified. Additional per-column fields/history/export/report UI remain proposals.
