# Pending peer-service work

Updated 2026-10-29, CHANGE-166. Required Admin HTTP endpoints are implemented; outstanding rollout/recovery and separate peer behavior work are listed below. Separate consumer/behavior follow-ups remain below. Completed/superseded requests are in [history](peer-service-api-feedback-history.md). Local provider inspection does not imply cloud rollout. Supplier/Credit backend code was not changed.

## User Service — penalty consumers (FEEDBACK-014)

Implement authenticated Pub/Sub consumers for both channels below; current User source has penalty HTTP helpers but no penalty subscriber. These are scoring consumers, not new human-admin HTTP mutation endpoints.

| Topic | Body eventType | Effect |
|---|---|---|
| courier-penalty-addition-{environment}-v1 | PenaltyScoreAdditionEvent | Add positive penaltyAmount |
| courier-penalty-deduction-{environment}-v1 | PenaltyScoreDeductionEvent | Deduct positive penaltyAmount |

Use local topics only with the emulator; staging uses dev, production prod. Body has exactly seven fields:

~~~json
{"eventId":"stable-event-id","eventType":"PenaltyScoreAdditionEvent","orderId":"order-id","courierId":"courier-uid","penaltyAmount":4,"occurredAt":"2026-10-28T08:00:00Z","appliedReason":"WRONG_LOCATION_DELIVERY"}
~~~

Pub/Sub attributes: eventId, eventType, eventVersion=1. Decode base64 message.data for push delivery. The JSON courierId is the score recipient, including when a requester/system completes the Order.

| appliedReason | Magnitude | Direction |
|---|---:|---|
| ACCEPTED_TASK_CANCELLATION |2|Addition|
| OVERDUE_DELIVERY |1|Addition|
| SUCCESSFUL_DELIVERY |1|Deduction|
| WRONG_LOCATION_DELIVERY |4|Addition|
| ITEM_MISHANDLING_OR_DAMAGE |4|Addition|
| DELIBERATE_ITEM_RETENTION_OR_THEFT |10|Addition|

- Order saves final score intent with the lifecycle transition and outbox. Apply Penalty alone stores a provisional policy; completion/cancellation emits one final outcome per courier attempt. Reopened Orders can have different couriers/attempts: do not deduplicate by orderId alone.
- Deduplicate by **body eventId**, not Google's messageId. Order retries reuse the persisted ID. Atomically save the processed ID and update the score; concurrent duplicates have one effect. ACK only after commit or a known duplicate; retry transient failures and monitor dead letters/permanent failures.
- Agree score floor/cap and suspension policy, including the theft permanent-suspension requirement. Two topics have no cross-topic order: clamping after each delivery makes +1/-1 order-dependent at zero. Define a ledger/reconciliation policy or explicitly agree arrival-order semantics before claiming order-independent scoring.
- Retired COURIER_UNRESPONSIVE(3) can still occur in saved historical events; preserve read compatibility. Do not create new choices for it. AcceptedOrderCancellationTaskEvent is retired; no new legacy subscription/scoring or penalty-replacement API is requested. Credit events remain separate.
- Full schemas/examples: [AsyncAPI](asyncapi/asyncapi.yaml). Provider consumer/security/duplicate tests and local integration are still required.

## Supplier Service — guard existing deactivation (FEEDBACK-015)

The existing admin DELETE /api/suppliers/{supplierId} soft-deactivates, but does not consult Order. Update that operation rather than creating a duplicate API.

- Before deactivation, forward the authenticated caller's Firebase token to GET /api/orders/suppliers/{supplierId}/active-involvement.
- **200:** {"supplierId":"supplier-id","hasActiveOrders":true}. Refuse deactivation with409 when true. Unknown/auth/network/5xx failure must not be treated as false. Owner still checks supplier existence and admin authority.
- Order SQL checks pickup/delivery involvement in OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED, including holds. The read alone does not reserve deletion permission: agree a deactivation/admission policy for the check/delete race. No Supplier backend changes have been made here.

## Report Service - remaining rollout and creation recovery

Resolution HTTP/compensation/result APIs and the real Admin Reports frontend are implemented; no missing admin resolution endpoint is requested. See [Report handoff](../../reporting-service/HANDOFF.md).

- Provision request/result topics, authenticated subscriptions/IAM and Report composite indexes; enable both services only after cloud verification. Local actual HTTP/Firestore/PostgreSQL/PubSub verification is separate from production IAM.
- Report creation still needs durable submission identity/recovery if hold placement succeeds but Report persistence fails. This is separate from the completed resolution saga; do not silently release/fabricate reports.
- Reportable Orders exclude OPEN: ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED only, with assigned courier. Current-snapshot hold retries are accepted; no snapshot migration.
- Retention and operator handling for unresolved journals/FAILED results need rollout agreement.
