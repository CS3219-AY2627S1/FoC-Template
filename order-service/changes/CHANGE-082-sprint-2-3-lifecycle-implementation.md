# CHANGE-082: Order-owned Sprint 2-3 lifecycle implementation

- Date/developer: 2026-10-08 / Vincent, branch `sprint-2-3`.
- Authority: CHANGE-081 and the user's explicit implementation request and follow-up approvals.
- Status: Approved lifecycle slice implemented and locally verified; `[~]` until peer/browser/cloud gates pass. Not completion of all overall Sprint 2/3 capabilities.

## Effective design and approval

The user approved one current Order, a separate internal primary UUID and unique business Order ID, immutable courier-attempt history, and an `attemptId` in courier-list responses. Existing business IDs, checkpoint references and outbox references stay unchanged. A new additive Flyway migration will replace the primary key without rewriting historical business references; V1/V2 remain unchanged. Repeated lifecycle checkpoints are allowed so another courier can accept a reopened task.

Every ACCEPTED-only abort first validates ownership/version, synchronously calls the existing bodyless Credit hold/reset contract, and rechecks the expiry boundary after the response. A successful reset clears Credit's courier assignment while retaining its reservation. Order records immutable ABORTED courier history and changes the current Order to OPEN before expiry or EXPIRED at/after expiry. Every abort queues the User penalty event; EXPIRED additionally queues the Credit refund event for the old business ID. No refund event is emitted for OPEN. This interprets the user's latest 'no event' for reopening as no Credit refund event, preserving the previously required User penalty event.

The user confirmed this ordering and approved the history/migration/API design in the async replies during this implementation turn. No peer backend edits or automatic HTTP-to-mock fallback are authorized. Missing Credit assignment/reset routes are mocked only in the local mock adapter. Actual HTTP mode remains fail-closed.

Reposting retains old EXPIRED and new OPEN rows with separate IDs and reserves new credits before linking/persisting. The original is hidden from requester pagination only after successful linkage. Refund payloads/old IDs remain durable. Existing minute-based 48-hour completion is reused; latest attempt checkpoints, not an earlier aborted attempt, must determine the completion deadline.

## Traceability and affected responsibilities

| Effective requirement | Implementation/test responsibility |
| --- | --- |
| D1 F3/F4 and approved acceptance amendment | Assignment service waits for Credit confirmation; failure leaves OPEN |
| D1 F8/F9/F10.1.3, NTH4, approved display override | Requester query filters only successfully reposted expired originals before pagination/counting; old rows retained |
| D1 F11.2/F11.3 and approved abort amendments | Domain ownership/state guard; transition service reset/history/outbox; requester current state and courier immutable history |
| D1 F6.4/F7 and approved 48-hour completion | Scheduler boundary/idempotency and latest accepted/delivered checkpoints |
| NFR3.1.1 | Unit/controller/contract tests and fresh JaCoCo line/branch verification; Docker integration results reported separately |

Sequence flow: controller/authentication -> application service -> domain guards -> synchronous peer port -> domain change -> Order/history/checkpoint/receipt/outbox in one database transaction -> after-commit dispatch. Persistence adapters own JPA pagination/locking. The shared Next.js Order pages display results; Credit/User still own balances/penalties.

## TDD and verification evidence

- Repost visibility: baseline three adapter tests passed; added query/count regression failed (missing @Query), then passed after the implementation. Focused run: four passed, two PostgreSQL tests skipped because Docker engine unavailable.
- Atomic query commit: `e7b6a09`.
- Abort domain regression failed on ABORTED versus EXPIRED; transition regressions failed on missing reset/history/penalty before implementation. Manual replay regressions failed on authentication/ownership bypass and passed after identity/original-link checks. Frontend repost visibility tests failed on missing helper, then passed after immediate list update.
- Final backend: Java 21, `mvnw.cmd -B -ntp -Ddebug=false -Dlogging.level.root=WARN -Djacoco.append=false verify`: **162 tests, 0 failures, 0 errors, 0 skipped; BUILD SUCCESS**. Fresh JaCoCo **1428/1519 lines (94.01%)**, **369/448 branches (82.37%)**; existing >=80% gates unchanged.
- Isolated Docker PostgreSQL: clean V3 schema validation; V2-to-V3 upgrade including legacy ABORTED recovery/FKs; repeat same-courier attempts, ownership filtering and stable paginated counts; Order/history/checkpoint/outbox rollback; outbox lease/concurrency and retry tests passed. Actual peer services were not called.
- Test-discovered fixes: drop the checkpoint constraint (not its backing index), update historical migration-version assertions from V2 to V3, use business-ID lookup after internal UUID rekey. Windows Maven `clean` could not remove a locked generated directory; ordinary verify with fresh non-appending JaCoCo succeeded. No application volumes were reset.
- Frontend: `npm ci`, **34 tests / 12 files passed**, `npm run typecheck`, `npm run build` passed; `npm run lint` **0 errors / 12 pre-existing warnings** in untouched login/profile files. Production build emitted an external lockfile warning, but succeeded. RTL verifies abort-history refetch and immediate requester repost replacement; not authenticated/browser responsive verification.
- Atomic commits: `e7b6a09` query/count; `9e7aa3c` Order UI/helpers; `e6063b0` domain/application/schema/tests. Workflow/feedback documentation follows separately. Learning is excluded.
- D1/selected overall PDF hashes match CHANGE-081; relevant D1 requirement text and overall diagram-to-feature/contracts were checked. Effective source selection/overrides, class/sequence diagrams, API/data/migration records and active context are synchronized in ADR-025 and `sprints/sprint-2-3/README.md`. Original PDF/PNG artifacts were not altered.
- No skipped integration, mock or source inspection establishes real peer/cloud/browser correctness.

## Boundaries and pending gates

Peer directories are read-only; feedback documents missing assignment/reset providers, refund/settlement/penalty consumers, request/response/authentication/retry/reconciliation and legacy-event needs. Shared frontend changes are limited to approved Order routes/helpers/tests, with existing styling and no mode switch. Learning remains ignored and never staged.

Remaining: actual peer providers/subscribers and ledger effects; trusted automatic-repost credential; authenticated desktop/mobile end-to-end tests; live PubSub/IAM/subscription/dead-letter behavior; Cloud Run idle scheduling. The existing Supplier adapter discards a 200/valid:false body (documented Order-side gap), and automatic repost does not expose a separate new-order expiry beyond its duration-derived default. Full NTH3 report/hold/admin-resolution features in the overall pack remain outside this approved lifecycle implementation and need explicit detailed contract/design scope. Do not mark every Sprint 2/3 requirement complete from this test run.
