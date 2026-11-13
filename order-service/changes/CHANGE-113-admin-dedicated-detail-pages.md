# CHANGE-113: Dedicated Admin detail pages and visible actions

- Date/developer: 2026-10-11, Yao Xiang, order-service/admin-dashboard.
- Authority: user's follow-up requests dedicated Order/Supplier detail pages
  like Users and moving existing admin actions upward. Same ADR-039 mock scope.
- Baseline: workflow/context/frontend reloaded, developer/branch agree and PDF
  fingerprints match. Preserve all existing uncommitted CHANGE-111/112 work.
- Approved design: /admin/orders/{id} opens full copied Order information,
  including description, using the existing mock exact-ID order query. Empty
  result shows not-found retry/back controls. /admin/suppliers/{id} renders a
  full location profile, not a modal. Existing Supplier GET by ID is sufficient.
  List View links navigate to the corresponding routes; admin layout/gate stay.
- Move User admin actions immediately below its heading and above summary/history;
  supplier deactivation appears near the location heading, with confirmation.
  Preserve busy/error/inactive guards. Order remains read-only; add no action.
- Separate abort-safe detail loads from lists; no whole-list scan or new HTTP
  contract. Only frontend source/tests and Order workflow/documentation change.
  No backend provider, configuration, migration, event or authentication change.
- Traceability: existing CHANGE-111/112 admin amendment, NTH1 support and
  NFR2.1/NFR3/NFR4. Updated navigation/design belongs in ADR-039.
- TDD: five assertions reproduced the existing modal/navigation/action-order
  behavior before implementation. Final160 frontend tests/32 files pass. Tests
  include dedicated descriptions, exact-ID empty/mismatched responses, back/
  retry, unchanged search/status/paging, action ordering and failed confirmed
  Supplier deactivation. TypeScript passes; lint0errors/3 existing login warnings.
- Production Docker frontend build passes, including /admin/orders/[id]. Only
  frontend recreated; healthy. Gateway Order/Supplier detail routes return200;
  existing Order container remains running/healthy. git diff --check passes.
  No database volumes, peer containers, backend source or Git history changed.
- Backend tests were not rerun: this refinement changes no backend implementation
  or HTTP contract. Previous backend verification remains recorded in CHANGE-112.
- Remaining: authenticated responsive visual confirmation and real provider
  integration remain pending under the existing mock milestone.
- Affected artifacts: approved UI requirement/design records, diagrams, frontend
  source/tests, documentation/indexes and AI disclosure changed. API contracts,
  data models, workflow/skills and deployment/persistence/infrastructure unchanged.
