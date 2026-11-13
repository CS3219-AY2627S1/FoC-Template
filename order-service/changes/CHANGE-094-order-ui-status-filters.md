# CHANGE-094: Five-second Order polling, abort wording and personal status filters

- Date / approver: 2026-10-09 / Yao Xiang, explicit request on order-service/sprint-1/yx-sprint-2-and-3. Scope extension recorded; preserve pending CHANGE-092/093 and all peer work.
- Approval: implement Order UI polling at five seconds, courier accepted action wording Abort errand, status filters on My Errands/My Requests and necessary Order API support. No new auth, peer, transport, route or design-system decision.
- References: F2/F8/F9 personal lists; F4.1.9/F11 accepted abort under ADR-025; NFR2 responsive web and NFR3 test coverage; ADR-027 polling superseded only for Order interval by ADR-032. D1/Overall/Updated source hashes match.

## Effective design and contract

Existing shared frontend Next.js 16.3.6 App Router, React client pages, useApi gateway calls, Geist/shadcn Base UI primitives. Shared frontend initially clean. USER requester/courier pages retain current auth/role boundaries; ADMIN receives no new capability. No token, role lookup, eligibility or ownership edits.

GET /api/orders/mine retains mode, userId, one-based page (default 1), size(default 20, max 100), existing items/page/size/totalItems/totalPages response. Add optional enum query status; omitted/empty means all statuses, invalid enum returns 400. Verify requester/courier identity first as before. Requester query retains hidden superseded EXPIRED originals. Courier query filters current orders by their status and immutable courier attempts by ABORTED before union pagination/count; never filter only the first loaded page in memory. New filtered repository operations remain behind domain interfaces; existing unfiltered operations retained for compatibility.

Add Order-only status Select and compact previous/next pagination using existing primitives. Default All statuses; selection resets page 1; changing status/page cancels stale in-flight reads. Same filter/page used on five-second reads, focus/manual/mutation refresh. Filtered empty message differs from no orders. Optimistic action updates must not show a newly changed order outside the selected status. Cards and existing layout/role behavior remain.

Order-only interval is passed explicitly to existing visible polling hook; generic/credit default stays15 seconds. Keep auth readiness, hidden-tab pause, no overlap, AbortController cleanup, stale-account/revision protection and immediate mutation refresh. UI terminology becomes Abort errand / Abort this accepted errand? / Yes, abort errand / Expired errand aborted; endpoint remains POST /{id}/cancel-accepted and business/event behavior unchanged.

No schema or migration. No scheduler/cron/event payload/topic/peer changes. Existing FEEDBACK-009 and real PostgreSQL/Docker gaps remain. Background repost retries stay paused.

## Verification plan

Tests first: five-second timing, abort dialog/API/error cases, personal filters default/select/reset/empty/ABORTED and server paths, invalid status 400. Verify repository filtered content/count, paging/history/visibility on isolated PostgreSQL where available; authentication/mode guards retained. Run configured Vitest, lint, typecheck and relevant Order Maven tests/OpenAPI/coverage. Use current installed Next version docs; no new test framework. Browser/desktop/mobile evidence must be reported separately from mocks/static classes.

## Evidence

- Tests first: frontend 24tests had8 expected failures (missing labels/filter/status query/5-second timing); API invalid status regression failed400 expected vs200 old behavior.
- Final focused frontend 33passed; full frontend 58 tests across15 files,0 failures/skips; `npm run lint` exits0 with12 pre-existing login/profile warnings, `npm run typecheck` exits0. No dependency/package/layout/auth changes.
- Final focused backend 22passed. Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:243total,219passed,24 Docker skips,0 failures/errors; BUILD SUCCESS; lines 1378/1492=92.36%, branches 459/557=82.41%, original >=80% gates unchanged and passed. POM unchanged.
-3 new isolated PostgreSQL personal-filter cases compile but skip without Docker; real DB SQL/count/history verification remains pending.
-8 browser fixture scenarios using actual Order pages/components/current TailwindCSS at 320/768/1440/1920 for both modes pass: no horizontal overflow, All/Aborted/Completed selection, paginated next page, reset page 1, filtered empty message. Saved evidence/screenshots: target/change094-browser. Auth/API/supplier names are fixtures; AppShell and externally loaded Geist variables are omitted, so browser fonts fall back and typography/live integration are not verified. First Playwright fixture retry timed out on same-document state reuse; verified later with fresh per-case navigation/native Edge CDP. Sandbox helper failure required working shell; own temporary browser/server closed.
- Normal `npm run build` failed only while fetching existing Geist/Geist Mono Google Fonts under restricted connectivity; source font config left unchanged. Not reported as a successful production build.
- Scope: Order source + assigned frontend feature files + persistent context/disclosure only; sibling services/config/schema/cron/events/paused retries unchanged. Existing FEEDBACK-009 remains. No Sprint [x] or live integration claim.
- Uncommitted pending CHANGE-092/093 overlap some Order files; no staging/commit/push/deployment. Review separate concerns before staging. Exact CHANGE-094 paths below.

## Exact changed paths (uncommitted)

- frontend/src/app/my-errands/page.tsx
- frontend/src/app/my-requests/page.tsx
- frontend/src/app/order-history-pages.test.tsx
- frontend/src/components/orders/order-actions.tsx
- frontend/src/components/orders/order-actions.test.tsx
- frontend/src/components/orders/order-status-filter.tsx
- frontend/src/components/orders/order-pagination.tsx
- frontend/src/hooks/use-visible-polling.ts
- frontend/src/hooks/use-order-list.ts
- frontend/src/hooks/use-order-list.test.tsx
- frontend/src/lib/orders.ts
- frontend/src/lib/orders.test.ts
- frontend/README.md
- order-service/src/main/java/sg/edu/nus/foc/order/api/OrderController.java
- order-service/src/main/java/sg/edu/nus/foc/order/application/OrderQueryService.java
- order-service/src/main/java/sg/edu/nus/foc/order/domain/repository/OrderRepository.java
- order-service/src/main/java/sg/edu/nus/foc/order/infrastructure/JpaOrderRepository.java
- order-service/src/main/java/sg/edu/nus/foc/order/infrastructure/OrderPersistenceAdapter.java
- order-service/src/test/java/sg/edu/nus/foc/order/api/OrderControllerCoverageTest.java
- order-service/src/test/java/sg/edu/nus/foc/order/api/OrderMineStatusFilterTest.java
- order-service/src/test/java/sg/edu/nus/foc/order/api/OpenApiDocumentationTest.java
- order-service/src/test/java/sg/edu/nus/foc/order/application/OrderQueryServiceTest.java
- order-service/src/test/java/sg/edu/nus/foc/order/infrastructure/OrderPersistenceAdapterTest.java
- order-service/src/test/java/sg/edu/nus/foc/order/infrastructure/OrderPersonalStatusJpaIntegrationTest.java
- order-service/changes/CHANGE-094-order-ui-status-filters.md
- order-service/docs/decisions/ADR-032-order-polling-and-personal-status-filters.md
- order-service/docs/diagrams/order-personal-status-filtering.md
- order-service/docs/current-sprint.md
- order-service/docs/ai-project-context.md
- order-service/docs/ai-project-context.toml
- order-service/docs/architecture-order-service.md
- order-service/docs/architecture-evolution.md
- order-service/docs/change-log.md
- order-service/docs/decisions/ADR-027-repost-retry-polling-and-peer-auth-proposal.md
- order-service/docs/decisions/README.md
- order-service/docs/service-contracts.md
- order-service/docs/requirements-traceability.md
- order-service/docs/work-allocation.md
- order-service/docs/local/developer-profile.md
- order-service/docs/active-work/yao-xiang.md
- order-service/sprints/sprint-1/contracts.md
- order-service/sprints/sprint-1/requirements.md
- order-service/sprints/sprint-1/acceptance-tests.md
- order-service/sprints/sprint-2-3/README.md
- order-service/README.md
- order-service/hands-off/README.md
- ai/usage-log.md

## PostgreSQL follow-up — 2026-10-10

CHANGE-096 fresh full backend verify ran all 252 current tests with zero failures/errors/skips, including the three personal-filter PostgreSQL regressions. The prior Docker limitation is resolved for this source. Frontend tests/build/browser checks were not rerun in this backend-only follow-up; Google Fonts and real peer/browser gates remain separate.
