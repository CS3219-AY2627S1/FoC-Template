# CHANGE-129: Active involvement checks and deleted reference labels

Owner: Yao Xiang, order-service/penalty-integration,2026-10-14.
Status: user approves Requester/Courier/Admin shared reads, not admin-only.
Existing CHANGE-127/128 edits preserved. No sibling backend changes authorized.

## Approved API and predicate

GET /api/orders/users/{userId}/active-involvement returns userId/hasActiveOrders.
GET /api/orders/suppliers/{supplierId}/active-involvement returns supplierId/
hasActiveOrders. Production uses existing Firebase JWT and RequireOrderRole;
all three roles can query an arbitrary ID's boolean, no names/private details
or Order records returned. Existing local authentication split retained.

Use database EXISTS over OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED.
User matches current requester/courier; supplier matches pickup/delivery.
Held active Orders count. Current OPEN remains active even if its deadline has
passed until lifecycle commits expiry. Terminal/history/aborted attempts do not
count. Empty/unknown IDs with no Orders return false, not peer-entity404.
Invalid path ID400; unauthenticated401; unrecognized role403. No paging/body.

Traditional top-level response DTOs, explicit MapStruct, read-only application
query service/domain repository port and infrastructure native EXISTS query.
No in-memory scan, foreign lookup, mutation, row-lock or new schema.

## Peer evidence and limit

User DELETE /api/users/{id} deletes User; Supplier DELETE /api/suppliers/{id}
soft-deactivates. Neither currently consults Order. FEEDBACK-015 requires their
owner to integrate this query and authorize deletion themselves. User lookup
GET /api/users/{id} returns404 on absence. Supplier batch lookup returns items/
missingIds including inactive records. Names remain foreign/lookup data, never
stored in Order.

hasActiveOrders is a snapshot, not permission/lock guaranteeing deletion.
Check then delete can race Order creation/acceptance; a future coordinated
deactivating-state/admission protocol is needed. Pending durable commands,
unpublished financial/penalty outcomes are not active-order rows and are not
covered by this boolean. Do not claim complete deletion safety without provider
integration and a policy for these obligations.

## Approved UI scope

User declines new requester/courier name rows and reiterates dynamic lookup.
Keep existing Order card layout. Confirmed missing supplier references use
Deleted supplier; real records retain their names (including soft-inactive).
Transient auth/network/server failure keeps Location unavailable and never
hides the entire Order list. Apply to existing supplier name lookups/pending
Order summaries. This branch has no User-name lookup in Order UI; do not add
people rows or fabricate User storage as part of this correction.

## Verification plan

TDD API three-role access/401/403 and two-field responses; service validation
and repository routing; real PostgreSQL EXISTS over every active/terminal status,
both User relationships and both Supplier locations, hold/unknown/history cases.
UI partial/all/empty missing lookups, resolved name preservation, temporary
failure and existing no-hidden-list regression. Full applicable backend verify,
frontend tests/typecheck/lint/build, patch check. No live peer deletion/rollout.

## Completed verification and handoff

- Service contract RED showed missing implementation; focused service2/API+OpenAPI9
  tests pass. User/Supplier production role tests cover all3/401/403 and minimal
  boolean response. Real PostgreSQL12 tests cover all9 persisted states, current
  relationships, held expired-deadline OPEN, empty/unknown IDs and historical abort.
- Final ./mvnw verify420 tests, zero failures/errors/skips; original80% gates pass:
  line2124/2235 (95.03%), branch892/1114 (80.07%). No threshold/exclusion changes.
- UI RED reproduced wrong labels and empty-list waiting. Rejection regression
  exposed test beforeEach returning the mock as a teardown callback; changed
  fixture to return void. Removed temporary diagnostic logging.
- Final frontend129 tests/28 files pass; lint0errors/3 existing login warnings,
  typecheck and standard Turbopack production build pass. No browser claim.
- Initial concurrent default workers exhausted local native memory in Node/Java.
  Reran sequential/bounded: Vitest maxWorkers2/no-file-parallelism; Java2 CPUs/
  768m. Initial PG fixture missed required cancellation timestamp, corrected.
  Build initially exhausted native Zone memory; limiting Rayon alone still
  launched17 page workers. Installed Next config reads CIRCLE_NODE_TOTAL; setting
  it to3 gave2 workers and successful standard build/typecheck. Build-only env
  limits were not committed to application/CI configuration. No app stopped.
- Evidence: ignored target/change129-{red,focused,api,ui-red,ui-green,ui-focused,
  ui-diagnostic,ui-diagnostic2,verify,verified,verified-final,frontend,
  frontend-bounded,frontend-final,lint,build,build-bounded,build-final,typecheck}.log.
- No peer backend/config/schema/infra/cloud changes, application image rebuild,
  DB reset/migration, deletion invocation or push. Original127/128 changes retained.

## Remaining scope

FEEDBACK-015 provider calls/admission and pending-obligation policy required.
No User-name lookup exists in this branch's Order cards; no people rows added
under the corrected scope. Browser/deployed UI and actual peer deletion unverified.
Changes remain uncommitted alongside overlapping prior127/128 work; no broad
staging/commit performed that would mix those units.
