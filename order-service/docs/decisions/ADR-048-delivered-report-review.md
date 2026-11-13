# ADR-048 — Delivered report review and explicit overdue waiver

User-directed2026-10-18, CHANGE-141. Report creation is requester-only on their own
DELIVERED Order, one delivered-item category. Courier response deadline8h; backend
owns readiness. Admin may inspect both sides/evidence/order and separately act on
Order, then mark report RESOLVED with a reason. This supersedes proposed Approved/
Rejected statuses and prior deferred generic release, not existing admin funding
or manually selected penalty rules.

Release is report-specific, admin-authorized and serialized on the Order row;
retain historical holds and leave flag true while another active hold exists.
Report must reliably retry the cross-service release, not rely on a browser call.
No Report Service is present; actual integration remains blocked with live Coming
soon, while isolated existing local demo architecture supports the UI prototype.

Overdue is recorded at actual delivery, not continuously reclassified before it.
Waiver is a separate audited fact, permitted before completion. Factual lateness
and timestamps are not falsified. Waiver suppresses the normal +1 and grants no
-1 reward. Ordinary completion/auto-completion and report holds retain their
transaction/lock/outbox rules; explicit admin scoring is still its own decision.
V12 backfills known delivered facts only; unknown timing remains null.


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.
