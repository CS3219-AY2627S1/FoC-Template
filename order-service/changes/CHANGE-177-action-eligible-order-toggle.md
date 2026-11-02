# CHANGE-177 — Action-eligible orders toggle

2026-11-02. Yao Xiang on hfix/report-service. User selects the label Action-eligible orders and reuse of the Suppliers Open now switch pattern, superseding the proposed Action dropdown. Scope: Admin Orders only; Report review shortcut remains a proposal.

Definition: an Order with at least one existing administrative lifecycle action: OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED. All can be administratively cancelled; assigned active Orders may also receive a stored penalty. Held Orders remain included because existing admin actions permit them. This filter describes lifecycle eligibility; backend commands retain their current authorization, locking, pending-operation and version checks. No new status, lifecycle behavior or financial rule.

Design: reuse existing shared Switch/Label style and Admin Orders query state. Off by default. Toggle change resets page1/row selection while retaining ID/date filters. Enabling clears a conflicting terminal status; selecting a terminal status turns the toggle off. Existing statuses can narrow eligible results. Clear resets it. Exact Report-to-Order searches remain unfiltered by default.

Technical refinement required by database pagination: existing admin-protected GET /api/orders gains optional actionEligibleOnly=false; when true add status IN the above set to the existing SQL specification BEFORE count/limit/offset, intersecting ID/status/date predicates. Optional false/omitted keeps current behavior and response. Frontend sends true only when enabled and uses the SQL path even for an exact-ID search; never filter an already paged response in memory. Query/service/repository overloads preserve existing callers. OpenAPI documents the flag and held-order semantics. No new endpoint, schema/migration/index/env/topic/shared config or peer backend.

Files: AdminOrderController, OrderQueryService, repository port/persistence adapter; existing SQL/controller tests; frontend/src AdminOrders, admin-api and shared admin action eligibility constant with existing tests; required context/traceability/sprint/contracts/architecture/AI records. Existing staged and unstaged work retained; no commit/push. Actual endpoints, source rules and shared Switch inspected, owner/branch and authoritative PDF fingerprints unchanged. User's instruction authorizes this filter; no new architecture/technology/service boundary.

Tests first: SQL mixed-state pages/counts and held eligibility; exact-ID/status/date intersections, false compatibility; admin authorization and malformed boolean; frontend toggle/status/reset/page synchronization and query transport. Run focused tests, full Order/common verify, frontend lint/build/types and affected regressions. Rebuild/recreate only local Order/frontend with data preserved. Verification pending.


## Verification progress

Initial backend regression failed for the missing filter overload; frontend regressions failed for the absent Switch/query transport. Focused20 backend tests pass, including actual PostgreSQL mixed-state/held filtering before count/page and HTTP admin/anonymous/non-admin/malformed-boolean behavior. Initial UI implementation exposed a duplicate accessible label, removed to match the Supplier Label pattern; JSDOM lacked PointerEvent, supplied locally in the existing test fixture only. Final60 affected frontend tests pass. All291 frontend tests/full lint and both changed Docker builds pass, including production TypeScript. Source/context whitespace and TOML checks pass. Full Order/common verification still running; no partial result is recorded as complete. No sibling/shared-config/schema/cloud changes or Git publication.

Evidence: target/change177-red.log, change177-ui-red.log, change177-focused.log, change177-ui-final.log, change177-all-frontend.log, change177-lint.log and change177-build.log under Order. Existing test warnings about JSDOM navigation remain; no unhandled PointerEvent error in final passing runs. No authenticated browser visual review claimed. Existing order-ui-polling-and-status-filters learning note explains database-first filter/count/page behavior. Current API/requirements/context/sprint/disclosure records updated.

Full verification discovered OrderSecurityConfigurationTest still reflected the previous controller signature. Updated only that reflection parameter list to include boolean; its one-based/capped pagination assertions are unchanged. This was missed in the initial call-site search. The initial full run's failure is not a production filter or authorization failure; a new full verification run is required and its result follows.


## Final verification

Full root ./mvnw verify rerun passes:687 Order +13 common tests, zero failures/errors/skips; OpenAPI, packaging and coverage gates pass (Order branch80.96%, line94.71%). Initial full run failed only the old reflection signature in OrderSecurityConfigurationTest; updated that fixture without weakening its one-based/100-row-cap assertions, then reran the complete suite successfully. No application change was required for that correction. Logs: target/change177-confirmed-verify.log (final), change177-verify.log (superseded initial failure).

All291 frontend tests pass, full lint passes, Order/frontend Docker builds including frontend TypeScript pass. Recreated only local Order/frontend with --no-deps --wait; both healthy. Running OpenAPI exposes optional boolean actionEligibleOnly=false; anonymous filtered list remains401 and Admin Orders page returns200. PostgreSQL mixed-state tests cover eligibility across all statuses, held rows, exact ID/status/date intersection, totals and multiple pages before filtering; MVC covers admin/anonymous/non-admin/malformed flag, with false/default compatibility tests preserved. Switch tests verify page reset, terminal-status synchronization and Clear. No database/volume removal or sibling service restart. TOML and whitespace checks pass.

| Reference | Requirement | Implementation / test | Result |
| --- | --- | --- | --- |
| User-approved CHANGE-177 | Existing action-eligible state set including holds | SQL specification; AdminOrderDateFilterJpaTest | Pass |
| Existing admin authorization | Filter remains admin-only | AdminOrderControllerSecurityTest | Pass |
| Existing paginated API contract | Accurate totals/pages and backwards-compatible false default | Query/controller/SQL tests; generated/live OpenAPI | Pass |
| NFR3.1.1 | Line/branch coverage gate | Full verify,94.71/80.96% | Pass |
| NFR3.1.3 | Positive/negative scenarios | Mixed states, invalid boolean, unauthorized, conflicting filters | Pass |
| Existing frontend style/responsive amendment | Reuse Supplier Switch/Label and scrollable table | Shared components, w-fit label, frontend tests/build | Automated pass; browser visual confirmation pending |

Affected artifacts: requirement amendment/traceability/current sprint/context/contracts and architecture-evolution records, existing source/tests, learning and AI disclosure. No new ADR/technology/diagram/data-model/table, migration, index, env/shared deployment/persistence config, workflow/skill, topic, cloud resource or peer backend change. No Git staging/commit/push. Remaining: user browser confirmation after refresh and coordinated staging rollout of Order/frontend. Reports shortcut remains unimplemented as explicitly scoped.
