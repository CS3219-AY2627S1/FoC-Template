# ADR-046 — Admin completion and held funding resolution

Approved by Yao Xiang,2026-10-17, CHANGE-137.

POST /api/orders/admin/{orderId}/complete belongs to AdminOrderController and
requires the existing admin role. Admin may complete assigned ACCEPTED,
IN_PROGRESS, PICKED_UP or DELIVERED Orders, including held Orders. Reject OPEN,
terminal, missing assignment, mismatched participant assertions or pending commands.
Keep normal requester/scheduler completion rules and report hold placement history.

Like admin cancellation, selected penalties are explicit additions only. Null or
empty list means WAIVED/no score event. Otherwise select one highest amount,
using enum declaration order for ties. Reject SUCCESSFUL_DELIVERY/null elements;
do not also publish automatic overdue penalties or successful-delivery rewards.

Reuse orders' existing admin decision/reason/amount/time columns and record the
decision atomically with COMPLETED/checkpoint/receipt/outbox. No fabricated delivery
timestamp or new migration. Existing nullable overdue observations remain unknown
for completed Orders without actual delivery; admin action time is separate.

Use the existing NOWAIT row lock and unresolved-command guard. ADMIN_COMPLETE
server key and canonical bound input make exact same-admin retries idempotent;
changed-input replay or competing terminal transition rejects. Existing completion
event funds the stored courier via Credit's matching reservation; optional separate
addition targets that same courier. Stable event IDs and AFTER_COMMIT dispatch
retain retry behavior. HTTP200 is local intent commit, not synchronous settlement.

Credit compact completion contract matches existing consumer/settlement code.
No Credit/User implementation, new topic/payload, report release, UI or deployment.
User penalty subscriber remains pending FEEDBACK-014; no claim score was applied.
