# CHANGE-124: Consistent Admin Order table typography

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User requests consistent table font sizes and non-bold IDs. Workflow/identity/
  branch/context reloaded; PDF fingerprints unchanged; existing119..123 preserved.
- Current dates and badges use12px while body uses14px; linked records use medium
  weight while copy controls/body use regular. Scope styling only to Order table.
- Normalize body to regular14px, linked names/IDs included; status badge uses the
  same size/weight with compatible height, dates inherit body size. Headers remain
  visually distinct. Other Admin tabs/detail cards and shared UI primitives stay.
- Preserve compact full-copy IDs, related routes, status/search/paging and122
  provider selection. No API/backend/model/config/workflow/diagram changes.
- No new CSS implementation-detail tests; run existing Admin page regressions,
  TypeScript/scoped lint and production build. Actual browser visual check pending.

## Verification

- Existing34 Admin page tests pass. TypeScript, scoped ESLint, frontend production
  build and git diff --check pass. No new tests for reversible CSS details.
- No backend checks or Docker recreation/deployment; code/contracts/config are
  unchanged outside frontend presentation. Actual browser visual check pending.
