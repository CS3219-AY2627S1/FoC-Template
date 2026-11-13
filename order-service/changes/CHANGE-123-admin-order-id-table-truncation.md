# CHANGE-123: Bound the Admin table Order ID display

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User screenshot/request approves truncated Order IDs in the table with full
  clipboard copying and full ID in View details. Workflow/context/branch/profile
  reloaded; source fingerprints unchanged; existing119..122 edits preserved.
- Root cause: table CopyId uses break-all inside a narrow auto-layout cell,
  spreading UUIDs across many lines and increasing every affected row's height.
- Add optional compact presentation to existing CopyId, enabled only for Admin
  Orders table. Bound its cell/control width; label uses single-line CSS ellipsis.
  Native title and accessible copy label keep full ID, clipboard still uses the
  original id, and View URL/detail uses the unchanged full id. Detail/other IDs
  retain their existing default full-text presentation.
- Presentation-only refinement under approved Admin UI and NFR2.1. No query,
  identifier, API/backend/permission/model/configuration change. No new
  implementation-mirroring CSS tests; verify existing Admin copy/navigation/detail
  regressions, TypeScript, scoped lint and production build. Visual confirmation
  remains pending without a connected authenticated browser.

## Verification result

- Existing34 Admin page tests pass, including clipboard copy, related navigation
  and full detail rendering. TypeScript and scoped ESLint pass. Frontend production
  build and git diff --check pass. Source inspection confirms clipboard writes id
  unchanged and View route/detail receives the original full id.
- No new tests for reversible CSS implementation details. No backend tests or
  container recreation/deployment for unchanged backend/config. Actual browser
  visual confirmation remains pending. Previous119..122 work remains intact.
