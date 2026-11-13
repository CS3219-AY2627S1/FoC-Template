# ADR-052 — Hold eligibility for non-completed Orders

Date:2026-10-19. Status: Accepted by Yao Xiang; CHANGE-153.

Allow requester-owned hold placement on all statuses except COMPLETED. Applying a hold records report binding/audit and sets the existing flag; it never changes Order status or undoes historical financial outcomes. The existing report-id replay and multi-report release rules remain.

User explicitly retained guards on cancellation, expiry, courier abort and completion. Delivery progression START/PICKUP/DELIVER remains allowed. Existing admin cancellation is an explicit override and remains separate from ordinary funding actions. No schema/query/event/auth change; only domain/service eligibility and endpoint documentation broaden. Real Report Service integration is not supplied by this change.
