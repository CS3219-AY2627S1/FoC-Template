# CHANGE-092: Compact refund and completion event bodies

- Date/approver: 2026-10-09 / Yao Xiang, explicit seven-field request and approval to implement Order-only despite current incompatible Credit consumers.
- Scope: current branch order-service/sprint-1/yx-sprint-2-and-3. This specific shared contract slice is approved; Vincent's other work and sibling service source remain untouched.
- Classification: architecture/contract change; ADR-031 supersedes the full-snapshot rule only for refund/completion. Sprint remains [~].
- Traceability: F4.1.5 completion, F4.1.7 cancellation, F4.1.8 / F10 expiry, F5.1/F5.1.1 and F13/F13.1.1 lifecycle, F11 credit outcomes, approved F12 completion-time overdue amendment, NFR2 consistency and NFR3 verification; effective Sequences 5–7, ADR-013/019/025/026.
- User-approved deviation: implement exactly seven fields and record peer changes; do not claim current integration compatible or complete.

## Detailed effective design

Refund and completion JSON bodies contain exactly eventId (stable UUID), eventType (existing type name), orderId (public business ID), orderStatus (resulting enum string), creditAmount (integer, Order.offeredCredits), occurredAt (UTC ISO instant), courierId (string or null). Both nullable and non-null courier IDs serialize; no snapshot, requester, actor, checkpoint/history, orderVersion, eventVersion, overdue or overdueAt in these bodies. AcceptedOrderCancellationTaskEvent stays byte-shape compatible with its version-1 full snapshot envelope.

Approved existing architecture: lifecycle validation, role/ownership checks, NOWAIT locked writes, atomic Order/outbox/receipt commit, immediate after-commit dispatch, existing quarter-hour recovery, broker acknowledgement and at-least-once deduplication remain. No scheduler, topic, persistence migration, API endpoint, HTTP Credit assignment/reset, or penalty policy changes.

Implementation detail: compact DTOs retain JsonIgnore version metadata for outbox columns and Pub/Sub attributes (schema eventVersion=2). Common interface no longer requires snapshot/actor methods. MapStruct explicitly maps status/credits/courier. Factory keeps its existing use-case signatures so completion-time factual calculation and callers are unaffected. Dispatcher reads both compact rows and old snapshot rows, takes old values from persisted snapshots rather than live Order state, retains original eventId/occurredAt, and restores internal Order version from outbox columns. Legacy open cancellation/expiration types still route to refund. Accepted dispatcher remains unchanged. Stored rows are not rewritten; publication uses the effective seven-field shape. Event ID generation and destination topic names stay stable.

Existing peer implementation: Credit OrderEventMessage/CreditOrderEventConsumer require nested order, matching event/order versions and non-null overdue for completion. New bodies are INCOMPLETE_OR_INCOMPATIBLE with that consumer. FEEDBACK-009 requests compact parsing and financial lookup by orderId; User must agree a separate authoritative source for overdue before completion penalty integration can finish. No invented deadline/overdue inference or peer edits. Real financial/penalty integration remains BLOCKED.

Alternatives: retain full v1 bodies for compatibility (rejected by user's exact-field approval), or compact bodies with coordinated peer migration (approved Order-only milestone). Separate new topics would isolate old consumers but require cloud/consumer provisioning not requested; keep existing topics and explicitly document coordinated rollout. Internal version metadata preserves publication observability without expanding requested JSON.

## Tests and verification plan

Tests first: exact JSON key sets and correct terminal values for cancellation/expiry/manual/automatic completion; null courier retained; unchanged accepted schema; stable IDs; retained outbox metadata; dispatcher converts old full-snapshot rows without live queries, restores compact-row metadata, and preserves failure retry/ack semantics. Run focused RED/GREEN, fresh full wrapper Maven verify and coverage gates. No frontend or peer/live-cloud execution needed for this Order-only serialization slice.

## Completion evidence

- Tests first: CompactOrderEventContractTest ran 3 tests, 2 expected key-set failures against the old refund/completion bodies; accepted-cancellation passed.
- Initial runtime attempts: unified shell helper unavailable; default cache lacked Testcontainers junit-jupiter. Used existing task-local offline cache with wrapper-selected Maven 3.9.16 and Java 21 source/target overrides. No POM or dependency change.
- Focused implementation checks exposed one remaining old isOverdue assertion, then Jackson constructor deserialization of JsonIgnore primitive fields. Removed only unused compact all-args constructors; retain Lombok no-args bean construction. No global serialization setting was weakened.
- Final focused: 32 tests, zero failures/errors/skips.
- Fresh source-only offline Maven verify (isolated target/change092-source-check): 212 tests, zero failures/errors, 17 PostgreSQL Testcontainers skips because Docker Linux daemon is unavailable; 195 passed. Coverage 1338/1465 lines (91.33%) and 444/543 branches (81.77%), both existing 80% gates passed. OpenAPI documentation tests included. BUILD SUCCESS is not all-integration verification.
- No DB migration/column change; accepted DTO, snapshot and publisher match HEAD unchanged. No frontend/sibling/cloud/deployment edits or live financial requests. Root AI usage log is the authorized exception.
- Authoritative D1/Overall/Updated hashes match. Whitespace/scope inspections pass. Original PDF files untouched.
- Status: Order implementation and executable non-Docker verification complete, uncommitted for review. PostgreSQL checks, coordinated Credit compact migration, User overdue source/consumer, real broker/ledger/penalty verification remain open; FEEDBACK-009 BLOCKED and Sprint [~].

| Requirement | Implementation | Test / evidence | Result |
| --- | --- | --- | --- |
| F4.1.5, F5.1/F5.1.1, F13, approved completion amendment | Factory/mapper completion seven-field body | CompactOrderEventContractTest; OrderTransitionEventPublishingTest manual/automatic/late paths | Passed Order tests; peer migration blocked |
| F4.1.7 / F11 credit outcomes | Refund compact body, accepted schema unchanged | Exact shape + accepted snapshot preservation + transition tests | Passed Order tests |
| F4.1.8 / F10 expiry | EXPIRED refund same seven-field body | CompactOrderEventContractTest; existing lifecycle regressions | Passed Order tests |
| NFR2 consistency / ADR-013, NFR3 verification | Outbox metadata preserved, saved legacy conversion, acknowledged publish/retry | Dispatcher/persistence-adapter/PubSub tests; fresh >=80% gates | Passed non-Docker tests; 17 DB checks unavailable |

