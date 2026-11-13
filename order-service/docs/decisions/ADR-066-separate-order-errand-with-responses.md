# ADR-066 — Separate categories, shared opposite-party response

2026-11-02. User-directed amendment, Yao Xiang on hfix/report-service. Supersedes ADR-065's unified new-submission category; preserves its generic respondent, notifications, privacy, holds and saga. See CHANGE-175.

| New category | Submitter / active selector | Respondent |
| --- | --- | --- |
| ORDER | Actual requester / existing requester mode | Assigned courier |
| ERRAND | Currently assigned courier / mode=courier | Actual requester |
| GENERAL | Authenticated user, no Order | None; direct admin review |

Report derives the Order hold role from category. The existing Order API locks and validates that role, identity and current ownership. The returned actual requester/courier bind the stored report and resolution saga. Category cannot be used to report another user's Order or to bypass the one-active-report-per-order constraint. Incoming views/response reminders continue to use the actual opposite participant, not the category name or a fixed courier recipient.

Both linked categories wait up to24 hours for the opposite party's single explanation/evidence response. Reply or deadline makes the case ready for admin review. Early admin resolution still warns; silence alone never cancels or penalizes. START/PICKUP/DELIVER remain available under the existing funding hold. Existing private admin reply and synchronous resolution/durable compensation are retained.

Legacy unresolved ERRAND rows without a deadline or response receive one fresh window but keep ERRAND. Reconciliation of a new or already upgraded Errand must preserve its deadline and never reopen a responded/resolved case. Previously created unified courier ORDER rows remain readable with saved bindings/replies/deadlines; no historical relabeling is needed. No new schema, index, topic, flag, shared configuration, Order application code or sibling backend.

Existing components under frontend/src/components/reporting and components/reports retain the same style, polling and actions. Category choices and help text explain submission scope. Regression tests cover restored ERRAND acceptance, role-scoped selection/hold, requester response/reminder, cross-category duplicates, deadline preservation and saga compensation.
