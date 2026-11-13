# ADR-032: Order polling and personal status filters

- Date / approver: 2026-10-09 / Yao Xiang, explicit implementation request.
- Status: USER-APPROVED; verification in CHANGE-094.
- Supersedes: ADR-027/CHANGE-085 Order list polling interval only; Credit/generic polling remains15 seconds. Existing lifecycle/outbox cadence, paused repost retries, auth and broker remain.

Use existing authenticated visible HTTP polling every 5 seconds for Order lists. Reuse /api/orders/mine with an optional status query and DB-before-pagination filtering, including ABORTED courier history. Default all statuses, reset page 1 on change, preserve counts/ownership/requester repost visibility. Existing UI primitives present filter and previous/next controls. Rename only accepted courier UI wording to Abort errand; existing cancel-accepted endpoint remains.

Alternatives: client-only filtering would omit matches on other pages; separate endpoints duplicate the existing personal-list/auth contract; modifying generic polling default changes unrelated Credit reads. Selected minimal optional query + explicit Order interval + existing primitives. Cost: roughly3x active visible Order list reads; existing hidden/auth/no-overlap protections remain. No schema/peer/financial/auth changes.

## Mode-specific status options — CHANGE-095 (2026-10-09)

Requester dropdown excludes ABORTED. Courier dropdown excludes OPEN, EXPIRED and CANCELLED; it retains ABORTED immutable-attempt history. All statuses remains the default. OrderStatusFilter requires an explicit requester/courier mode, supplied by each existing page. This is a UI-only refinement of ADR-032: existing API enum/query, authentication, ownership, pagination and five-second polling remain unchanged.
