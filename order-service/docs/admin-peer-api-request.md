# Pending Admin integration work

Updated 2026-10-29, CHANGE-166. No missing Admin HTTP endpoint remains in this slice. Report resolution, compensation consumer and result producer are implemented, and Admin Reports now uses real APIs in all frontend modes. See [Report handoff](../../reporting-service/HANDOFF.md) and [saga operations](../../reporting-service/docs/order-resolution-saga.md).

Remaining rollout: authenticated topic/subscription/IAM setup, Report composite indexes and explicit feature activation. Report creation after an uncertain hold needs a separate durable recovery design. User penalty subscribers and Supplier deactivation/admission guards remain independent requests in [peer feedback](peer-service-api-feedback.md). Completed request history is retained in [history](admin-peer-api-request-history.md).
