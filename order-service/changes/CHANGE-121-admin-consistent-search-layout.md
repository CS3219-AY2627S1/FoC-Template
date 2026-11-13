# CHANGE-121: Consistent responsive Admin search controls

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User reports that Order actions below the mobile fields differ from other tabs.
  Workflow/context/profile reloaded; source fingerprints unchanged; existing
  CHANGE-119/120 edits preserved. Approved Admin refinement / NFR2.1 apply.
- Reuse a shared AdminFilterForm and AdminFilterActions in Orders, User directory,
  Supplier directory and the live exact-UID lookup. Mobile fields share the first
  row and action buttons the second; at640px and above controls are inline.
- Equal control heights/field sizing and shared breakpoint classes prevent drift.
  Keep search, clear, ID lookup, filtering, pagination and provider behavior.
- Presentation-only implementation detail. No API/backend/permission/model/config
  change or new class-name-only tests. Verify existing Admin regressions, typecheck,
  scoped lint and production build; browser visual confirmation remains pending.

## Verification

- Existing34 Admin page regressions pass, including Users/Suppliers name/ID
  search, Order filtering/paging and live UID navigation. TypeScript, scoped
  ESLint and frontend production build pass; git diff --check passes.
- No tests added for CSS implementation details; existing tests unchanged.
  No backend checks required for unchanged backend. No containers recreated or
  deployment performed. Authenticated mobile visual confirmation remains pending.
