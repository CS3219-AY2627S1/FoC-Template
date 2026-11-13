# ADR-047 — Admin row actions and saved explanations

User-approved UI direction,2026-10-17, CHANGE-138. Reuse ADR-044/046 operations and
current admin visual system. One selected row, accessible shaded state and top
action bar; preserve full-detail/name navigation. Confirm via a modal requiring
explicit penalty choice plus preset/custom reason. Only highest selected addition;
no automatic completion score/reward, no bulk mutation or custom penalty amounts.

Shared backend policy discovery supplies enum cases/scores; labels remain UI text.
Existing authenticated live API and isolated local sample providers get explicit
resolution methods; no mock fallback or sample mutation of real financial state.

Reason must survive reload rather than be a discarded form field. Add optional
resolutionReason to existing requests and nullable persisted admin explanation via
V11. New UI requires it, old clients may omit it; old fingerprints are preserved
when absent. Existing decision fields plus explanation are exposed in OrderResponse
and grouped in admin details as requested intent, not proof of subscriber scoring.
No event payload/topic, sibling service, auth rule or report-release change.

Checks cover UI access/selection/navigation/form states/retry, production policy
lookup authorization, saved reasons/legacy replay/rollback, isolated demo mutations,
clean/V10 migration and responsive layout. Local migration requires a backup and
matching image; no destructive reset or rewriting applied migrations.

Implementation refinement: pure policy lookup stays in AdminOrderController with MapStruct DTO mapping; no redundant query service or persistence layer. Form body scrolls separately from fixed dialog buttons on small screens.

CHANGE-139 (user-directed2026-10-17) refines the presentation to a compact table-top toolbar and calendar-only date fields; read-only SQL creation-date predicates execute before pagination. Refresh uses the existing icon and preserves criteria. No additional financial action or change to resolution dialog rules.
