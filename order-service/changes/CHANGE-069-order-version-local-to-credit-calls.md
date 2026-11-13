# CHANGE-069: Keep Order versions local to synchronous Credit calls

- Date: 2026-10-06
- Status: Implemented in Order Service; Maven verification blocked before test execution by local compiler failure; Credit endpoints remain open.
- Approval: User approved omitting the Order version from synchronous peer-service requests while retaining it in events when useful for event identification, then clarified that Credit should receive only the Order ID for hold/reset and Order ID plus courier ID for assignment.
- Scope: Order Service only. No Credit Service, frontend, or schema changes.

## Change

Synchronous Credit assignment and hold/reset requests are minimal: assignment carries `orderId` in the path and `courierId` in the body; hold/reset carries only `orderId` in the path with no body. The retained settlement call no longer includes `expectedOrderVersion`. Order continues to validate its expected version, ownership, and amount locally before lifecycle mutation. Published Order event envelopes and snapshots continue to include `orderVersion`. The mock treats repeating the same assignment or hold state as idempotent based on the reservation keyed by Order ID.

## Rationale and impact

Credit owns the transaction and can resolve requester, amount, and transaction state from the Order ID. The synchronous operation needs only the identifiers necessary to locate the transaction and specify its courier assignment. Event consumers may use the event ID and `orderVersion` to identify or order event facts.

The proposed FEEDBACK-003/004 request bodies and Sequence 3/Credit class diagrams are updated. Those provider endpoints remain absent from the inspected Credit implementation; the real integration contract still needs Credit-owner agreement.

## Verification

HTTP adapter tests assert assignment sends only `courierId` and hold sends no body; mock/application tests exercise state-based idempotency and minimal port shapes. Focused Maven verification must be rerun in a working Java 21 compiler environment because compilation failed locally before test execution.
