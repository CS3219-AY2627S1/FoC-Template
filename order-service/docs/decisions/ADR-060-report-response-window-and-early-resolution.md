# ADR-060 — Report response deadline and confirmed early resolution

Approved by Yao Xiang on order-service/admin-ui-linking,2026-10-29, CHANGE-163. Documentation-only clarification after the Order-side saga task completed. Report Service is absent; no application code, UI, API wire shape, database migration, configuration or GCP change is implemented here.

Keep the courier response deadline. Report owns responseDeadlineAt, time-based reconciliation and durable READY_FOR_REVIEW state when the deadline passes without a response. A timely courier response also makes the case ready. One courier response, only by the reported courier, is accepted before the deadline while unresolved. Error text must match the configured duration; no new duration is chosen from the pasted error message alone.

Admin may resolve either unresolved state. If still AWAITING_COURIER_RESPONSE, the UI warns that the courier has not responded and still has time, and requires confirmation; cancel performs no mutation. Admin authorization remains mandatory. No additional confirmation field or alternate Order endpoint is introduced by this documentation decision.

Required admin reply is persisted with resolving admin/time and visible only to submitter and reviewing admins. Report resolution remains separate from Order cancellation/penalty actions. Category changes remain undecided; the prior proposal to introduce a violation enum is not approved.

Retain ADR-059's synchronous callback-free Report resolution plus durable broker compensation/result. Report atomically journals prior state/reply and resulting revision with RESOLVED, deduplicates stable commands, fences late generation1 calls, conditionally restores only this operation and publishes a committed result through its outbox. Early-resolution compensation restores the actual prior state and reconciles the original deadline; it cannot extend the response window or overwrite newer responses/admin work. Conflicts remain held for reconciliation. Broker ACK is not compensation success.

This supersedes older no-deadline guidance and the previous READY_FOR_REVIEW-only resolution recommendation. Existing local Report prototype behavior is not updated by this documentation milestone; real Report and future Admin warning/private-reply integration require verification before activation. Exact contracts/tests: [Report handoff](../report-servicehandoff.md). Retain the default-disabled Order saga and local sample/cloud Coming soon boundary.
