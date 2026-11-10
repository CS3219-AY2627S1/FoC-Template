# Pending peer-service work

Updated 2026-11-04 after local penalty verification; earlier integration record CHANGE-166. Required Admin HTTP endpoints are implemented; outstanding rollout/recovery and separate peer behavior work are listed below. Separate consumer/behavior follow-ups remain below. Completed/superseded requests are in [history](peer-service-api-feedback-history.md). Local provider inspection does not imply cloud rollout. Supplier/Credit backend code was not changed.

## User Service - penalty consumer follow-ups (FEEDBACK-014)

Consumers are implemented. Local verification on 2026-11-04 passed10 checks with actual Order publishers, Pub/Sub emulator push, User consumer and Mongo transactions. Do not implement duplicate consumer endpoints.

**Blocking legacy-account compatibility (confirmed 2026-11-04):** reported Order 9ce2e006-a150-45f0-b35a-4356b6bc5be7 is COMPLETED with a PUBLISHED10-point addition (event814db288-c038-3230-af76-02689d0e3ee0), but User has no processed marker and score remains0. The courier document has no status field. User maps missing status to ACTIVE in Java, while UserLifecycleStore.saveActive requires raw stored status=ACTIVE and therefore throws403 Account is not active. Disposable reproduction confirmed valid courier role-context, rejected penalty/rolled-back dedupe marker, and successful same-ID10-point processing after only the disposable fixture was given ACTIVE. Required narrow remedy: support/normalize legacy missing-status active records while continuing to reject explicit deletion-pending/deactivated records. Do not redo Order completion, change the event ID or manually duplicate scoring; recover the existing message after compatibility is fixed. User Service implementation/restart approval requested; no real account/data write performed yet.

**Required fix: processed-event audit field mapping.** In PenaltyEventProcessingService.process, ProcessedPenaltyEvent expects (eventId, courierId, eventType, processedAt), but the call passes (eventId, eventType, courierId, processedAt). Live verification confirmed courierId contains PenaltyScoreAdditionEvent and eventType contains the courier UID. Pass event.courierId() second and event.eventType() third. Score recipient and event-ID deduplication currently work; the audit fields are wrong. Add a Mongo assertion for both fields and preserve existing atomic score/deduplication behavior. Correct old audit metadata separately without deleting processed IDs or reapplying scores.

**Existing policy follow-ups:** agree arrival-order behavior for separate addition/deduction topics at the score floor/cap, the theft permanent-suspension requirement, and handling of previously stored COURIER_UNRESPONSIVE events (current consumer rejects that deprecated policy). Local serial checks do not establish order-independent scoring or cloud IAM/delivery.

Contract retained: addition/deduction topics courier-penalty-addition-{environment}-v1 and courier-penalty-deduction-{environment}-v1; staging=dev, production=prod, local emulator=local. Seven body fields: eventId, eventType, orderId, courierId, penaltyAmount, occurredAt, appliedReason. Attributes eventId/eventType must match; eventVersion=1. Enum reason/amount comes from shared PenaltySystemPolicy, including COURIER_BAD_ATTITUDE=2. Body eventId is the stable dedupe key; Google messageId can differ. No accepted-cancellation legacy consumer or replacement API is requested.

Verification: courier abort+2; on-time reward-1; highest stored admin policy applied once at completion; explicit no-penalty admin cancellation; selected/stored maximum on admin cancellation; cap10/suspension and continued existing delivery; overdue+1 at completion; held auto-completion skip/release; duplicate delivery; failed consumer transaction rollback followed by successful same-ID retry. Disposable data/resources cleaned; existing application scores/databases untouched. Evidence: order-service/target/penalty-local-check-final.log and penalty-local-result.json (local ignored artifacts). User implementation was inspected but not modified.

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


## CHANGE-185 supersession: penalty ordering implemented jointly

User explicitly authorizes Order/User changes for unified sequenced scoring. The prior arrival-order policy follow-up is superseded by ADR-069 (source commit order), durable inbox and per-courier cursor. Runtime/cloud readiness remains subject to verification and coordinated cutover. Theft/permanent suspension and legacy-account compatibility are unrelated, unchanged follow-ups. Contract/provisioning: penalty-event-cutover.md.
