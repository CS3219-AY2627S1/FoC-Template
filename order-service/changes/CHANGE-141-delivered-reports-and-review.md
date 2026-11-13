# CHANGE-141 — Delivered-item reports, hold release and overdue waiver

Yao Xiang, order-service/penalty-integration,2026-10-18. User directs removal of
single-selection count and darker selected row; requester-only own DELIVERED item
reports, one damage/wrong-location category, explanation/evidence, two personal
lists, assigned courier response/evidence within8h, backend deadline handling and
admin case/order review/actions. Confirmed answers: one RESOLVED terminal status
(not APPROVED/REJECTED); waiver before completion suppresses overdue addition but
never grants successful-delivery reward. Existing admin financial actions remain
separate from marking report resolved.

## Approved implementation and ownership

Report Service is absent (MISSING). Build isolated local Order-owned report demo
endpoints under the existing local+emulator+enabled gate, and frontend Reports/admin
Reports with live Coming soon. No sibling backend or root configuration writes.
Record real Report peer contract in FEEDBACK-015/admin-peer-api-request; no live
integration claim. Mock cases/orders/users share only sample memory, so admin
cancel/complete/waive and case resolution work together without real funds/events.
Every sample case has consistent participant IDs and an existing sample Order.

Report prototype DTO: id/orderId/requesterId/courierId, selected category, requester
explanation/attachments, courier explanation/attachments, createdAt, response
deadline/submittedAt, status, resolvedAt/resolvedBy/resolutionNote, current Order
snapshot. Three statuses AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW, RESOLVED.
Server clock owns createdAt+8h, deadline reconciliation and rejection of late or
foreign responses. GET reconciliation supports demo polling without a new Order
scheduler; actual Report team owns durable deadline transition/release recovery.
Local evidence accepts PNG/JPEG/WebP/PDF, max3 files of2MiB each, stored as data URLs
in sample memory only; production private upload API remains a peer requirement.
Lists poll5s when visible, abort on navigation and retain errors/retry.

Real Order changes: hold placement now requires requester-owned DELIVERED at the
application boundary (historical active holds remain valid). Add admin-protected
PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release with forwarded
admin Firebase identity; lock Order, validate report/order binding, release only
that hold idempotently, recompute flag from remaining active holds atomically.
Allow release after explicit admin cancellation/completion; retain hold history.
No automatic financial action from release. Report team must durably retry release
after resolution; frontend never directly substitutes for Report orchestration.

Persist factual deliveryOverdue when markDelivered executes, comparing actual
delivery with stored START+duration deadline. Null before delivery/unknown legacy
timing; no runtime overdue classification while progressing. Preserve actual
timestamps. Add admin POST /api/orders/admin/{orderId}/overdue-waiver, reason1..1000,
DELIVERED and factual overdue only; locked/idempotent/audited, no event. Store
waiver actor/time/reason. Existing admin-selected scoring stays explicit; normal
requester/auto completion emits funding plus either overdue addition (not waived),
successful reward (actually on time), or no score event (late but waived).

V12 adds nullable stored delivery outcome, waiver metadata and hold release audit,
backfills only known actual delivered timestamps. Existing V1–V11 unchanged. Check
clean/upgrade/rollback/multi-report releases and waiver-vs-completion concurrency,
role403/401, eligibility, UI mock/live gating, case polling/deadline/attachments,
unchanged financial DTOs/topics, full verification and local backup/migration.
ADR-048 records the approved refinement. Existing D1 NTH1/2/3 apply; unresponsive
courier and post-completion score reversal are explicitly deferred.

## Verification completed (2026-10-18)

- RED: OrderDeliveryReviewTest missing waiver API; Admin Orders selection-count assertion reproduced the existing count. Report transport RED reproduced missing module. Initial focused compile exposed constructor fixture updates; initial full tests exposed historical active-hold fixtures and duplicate MVC mocks, corrected without relaxing current delivered-only eligibility.
- Initial complete test run passed tests but branch coverage was78% (<80%). Added meaningful participant-scoped list, replay/validation/evidence cases. Final fresh root -pl order-service -am verify: common12 + Order528 =540 tests, zero failures/errors/skips; both coverage gates pass, no class-data mismatch on final run, executable JAR produced. Thresholds/exclusions unchanged.
- Frontend43 files/233 tests pass; TypeScript passes; lint zero errors and three pre-existing login-form unused warnings; production Next build succeeds.
- PostgreSQL Testcontainers clean V12 and V11-upgrade checks preserve known/unknown timing, versions and hold history. Actual verified local foc-order-postgres-1/order_service (host5433) backed up to ignored target/change141-before-v12.dump (31641 bytes), then preview Flyway applied V12. No volumes removed. Existing Compose containers left running.
- Separate local preview8189/frontend3089/relay8190 and hidden Edge9339 exercised requester creation, single category, courier explanation+PNG attachment, report-specific sample hold, Ready review, admin Order actions/navigation, reasoned overdue waiver, Resolved/release. Screenshots inspected at1440/390: case cards stack, IDs wrap, no page overflow; tables horizontally scroll. Stronger selection shade and removed count verified.
- AsyncAPI examples/negative amount cases unchanged and validate. Structured context has412 unique qualified TOML keys (not a full parser). New Report API provider remains MISSING; tests/preview exercise the isolated prototype, not cross-service production integration.
- Preview credit balance fetch returned404 because the temporary relay routes only Order Service; no Credit availability claim. CUA runtime unavailable from prior initialization; hidden Edge DevTools used for visual inspection. No GCP changes or real funding/score operations.
