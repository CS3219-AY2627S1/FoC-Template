# ADR-058 — Real Admin User directory and resolution display

Accepted user request, Yao Xiang on `order-service/admin-ui-linking`, 2026-10-29. CHANGE-161.

The user authorizes the narrow User Service endpoint needed for the initial Admin table/search, its frontend integration and a User maintainer handoff. This explicitly extends the usual Order-only implementation boundary; no other User behavior or sibling backend is authorized.

Add GET `/api/users/admin/search` with optional `page`, `size`, `searchBy=id|name`, `q`; enforce existing Firebase/active-admin authorization and database filtering/counting/paging. Use a display DTO and preserve legacy routes. Extending the unpaged GET `/api/users` in place could break existing clients; the dedicated route avoids that change. No sample defaults, client fetch-all/filter, database schema or new runtime setting. Name search becomes available when this real endpoint is linked.

Render Admin resolution as a full-width card immediately after Repost information. Hide retired overdue waiver fields and empty resolution values, without changing Order responses, persisted audit, overdue calculation, penalties or holds. Factual delivery overdue remains in Status and timing.

Only Report operations remain pending in the Admin HTTP API checklist. User penalty consumers and Supplier deactivation guarding remain separate integration follow-ups. The existing Order/Credit saga is unchanged. Report resolution remains a deferred synchronous HTTP coordination proposal, not an implemented broker flow. [User handoff](../../../user-service/user-servicehandoff.md) records the exact contract and files.
