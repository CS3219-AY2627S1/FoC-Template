# CHANGE-115: Admin detail row ordering and map/status placement

Supersession: CHANGE-116 records the user's correction. The wider Order card,
three-column grid and description span below are historical, not the effective
layout. Only the internal Version/Description swap and requester ordering remain;
all Supplier map/status changes are retained.

- Date/developer: 2026-10-12, Yao Xiang on order-service/admin-dashboard.
- Authority: user's narrow follow-up. Preserve CHANGE-114 except specified layout.
- Workflow/spec skill/context/frontend loaded; identity/branch agree and source
  PDF fingerprints match. Existing uncommitted work and backend peers retained.
- Implementation detail: full-width Order Information card has metadata (Order
  ID, attempt ID, version) first, then credits on the left and a wider description
  on the right in the final row. Preserve line breaks. Stack naturally on mobile.
- People fields use explicit requester-name/ID then courier-name/ID order, never
  JSON property insertion order. Every returned field remains rendered.
- Remove only Suppliers-list Locations on this page map. Keep detail map,
  creation picker, supplier cards/search/paging and detail-only deactivation.
- Move SupplierBadges from Admin actions to Location details heading; state is
  descriptive and distinct from deactivation. No data/API/provider changes.
- Existing components/roles/sequences unchanged; shared AdminDetails gets optional
  column/span settings with defaults retaining all other views.
- TDD: three regressions failed before implementation (list map, response-order
  dependence/description placement and status in actions), then went green.
- Verification:175 frontend tests/36 files pass; TypeScript passes; lint0errors/
  three pre-existing login warnings. Production frontend Docker build passes;
  only frontend recreated, healthy. Both detail routes serve200 via gateway.
  Existing Order container unchanged/healthy; git diff --check passes.
- Existing shared AdminDetails defaults remain two columns; only Order Information
  opts into three columns/two-column description span with preserved line breaks.
- No backend test rerun needed for source/API-unchanged layout work. Authenticated
  visual verification remains pending with no connected browser.
- Affected: approved UI clarification/design records, frontend/tests/docs/indexes/
  AI disclosure and one removed diagram dependency. Backend contracts/models,
  service integrations, workflows/skills and deployment/persistence unchanged.
