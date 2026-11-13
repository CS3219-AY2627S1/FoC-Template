# CHANGE-120: Align Admin Order filters on mobile

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User screenshot/request identifies Status below Order ID in phone rendering.
  Workflow/context reloaded; developer/branch match, PDF fingerprints unchanged.
  Approved Admin UI refinement and NFR2.1 responsive baseline apply.
- Root cause: outer flex items-end aligns Status with a nested search form whose
  action buttons wrap to its second row. Field/control heights already match.
- Use one responsive form grid: Status and Order ID share the first row below
  640px; Search/Clear span the next row. At640px and above, all controls share
  one row. Remove field minimum widths so narrow phones do not force overflow.
- Keep existing handlers, labels, data, routes, adapter/mode behavior and tables.
  No API/backend/model/config/architecture change; prior119 edits preserved.
- Verify existing Admin interaction regressions, TypeScript, scoped lint and
  production CSS build. No new class-name-only test for this reversible layout
  fix. Browser inventory is empty, so authenticated visual confirmation at
  320px/375px/390px and desktop remains a stated verification limitation.

## Verification result

- Existing 34 Admin page tests pass, including exact-ID/status/pagination and
  interaction/navigation regressions. TypeScript and scoped ESLint pass.
- Frontend production build passes; responsive Tailwind grid utilities compile.
  git diff --check passes. No new tests/dependencies or runtime config changes.
- Did not rerun backend tests or recreate/deploy containers for this frontend
  layout-only patch. Authenticated visual verification remains pending because
  no browser surface is connected. Existing119 changes were preserved.
