# ADR-064 — Courier Errand reports

Date: 2026-11-01. Status: user-approved in chat; verification in CHANGE-171. Owner: Yao Xiang on hfix/report-service.

## Decision

Add ERRAND for the currently assigned courier's active Order. Keep ORDER requester-only and GENERAL unlinked. Reportable states remain ACCEPTED, IN_PROGRESS, PICKED_UP, DELIVERED. ERRAND starts READY_FOR_REVIEW, without a response deadline, self-response or reminder; it appears under Reports I submitted, not Reports against me. Requester ORDER reports retain existing courier responses and the24-hour deadline.

reporterId identifies the submitter. New nullable requesterId records the actual owner from the locked Order snapshot. Legacy linked non-ERRAND documents without requesterId fall back to reporterId. Saga binding uses actual requesterId/courierId, never assumes the submitting courier is the requester. Admin replies stay submitter-only/admin.

GET /api/orders/mine/active gains mode=courier; default requester is compatible. Hold placement gains optional reporterRole=COURIER; default REQUESTER. Matching verified role/token subject and current SQL ownership are required. SQL filters status/ownership before paging and locks the scoped Order for placement. Reporting an existing assignment does not require eligibility to accept another task. Hold rows retain actual requester binding; no SQL migration.

Existing one-active-report, funding pause, continued delivery, pending-command guard, current-snapshot replay, synchronous resolution and durable compensation remain unchanged. No new topic, funding/score policy or sibling backend change. Hold-created/Report-save-failed recovery remains a separate pre-existing limitation.

## Alternatives and consequences

Reusing ORDER without distinguishing the submitter would break saga identity matching and solicit self-responses. A requester-response workflow needs a new respondent/deadline/notification contract; the user chose direct admin review. Deploy Order/Report/frontend together. Older Report binaries cannot read ERRAND after such documents exist; use a compatibility release instead of an enum-incompatible rollback. Preserve history and journals. Tests and actual gateway/saga evidence are in CHANGE-171.
