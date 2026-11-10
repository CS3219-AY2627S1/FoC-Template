# Super Admin management and current admin list

## Summary

Restrict account management to Super Admins, rename it "Manage admins", and add a vertically stacked list of current Super Admins and Admins with role controls.

## Implementation

### Access and copy

- Show the administration navigation link only to Super Admins on desktop and mobile, labelled **Manage admins**.
- Add a Super Admin route guard for the existing `/admin/users` page. Redirect authenticated Admins and Users to `/profile`; retain the sign-in redirect for anonymous visitors.
- Require `require_super_admin` for the account lookup API. Keep the broader Admin route guard used by Supplier management.
- Change the page heading to **Manage admins** and its description to exactly: **Find any FoC account by its unique username or NUS email address and change their role in FoC**.
- Preserve exact, case-insensitive username/email lookup and the existing search-result details.

### Current admin API and list

- Add Super Admin-only `GET /v1/admin/admins`, returning an array of `{ userId, username, email, systemRole }`.
- Query User Service's own database for `SUPER_ADMIN` and `ADMIN` accounts, excluding `account_status = DELETED`.
- Sort Super Admins first, then Admins; sort each group by normalized username ascending.
- Add a typed client method and authenticated provider wrapper using the existing token-refresh flow.
- Below the search/result area, add **Current super admins / admins**, loaded automatically when the page opens.
- Display one account per vertically stacked row at every viewport size. Show only username, NUS email, and system role; use `userId` internally for identity and mutations.
- Provide independent loading, empty, and error states, with a retry button. Render the full list without pagination.

### Role changes

- Reuse the existing role selector and confirmation dialog for each account other than the signed-in Super Admin.
- Keep the signed-in Super Admin visible with no role-change controls.
- Offer `USER`, `ADMIN`, and `SUPER_ADMIN`, using the existing role-update endpoint and lifecycle safeguards, including self-change rejection, audit recording, session revocation, and last-Super-Admin protection.
- After a successful role change from either section, synchronize any matching search result and reload the admin list. Promotions add accounts, demotions to User remove them, and role changes update their ordering.
- Keep mutation errors in the role controls. If saving succeeds but reloading fails, report the list-refresh failure separately and allow retry.

## Test plan

- Backend: anonymous requests return 401; Admins and Users receive 403 for lookup and listing; Super Admins can access both.
- Listing: exclude Users and tombstoned accounts of either administrative role; verify Super Admin precedence, mixed-case username ordering, and the limited response fields.
- Role updates: retain coverage for self-change rejection, lifecycle safeguards, auditing, and session revocation.
- Frontend: verify exact copy, navigation visibility, direct-route restrictions, list fields, self-row restrictions, confirmation, and loading/error/retry states.
- Verify changes through search and list controls update both sections correctly, including promotion, demotion, and reordering.
- Check vertical stacking and overflow at mobile, tablet, and desktop widths; confirm Admins retain Supplier management access.
- Run frontend tests, lint, build, and focused Playwright checks. Run relevant backend pytest and Ruff checks, plus the required Supabase reset and integration tests against a disposable local database.

## Assumptions and deferred work

- Keep existing page and role-update URLs; rename the visible feature.
- Account status supports only `ACTIVE` and terminal `DELETED` tombstones. Existing role-management lifecycle safeguards remain unchanged.
- No schema migration or new dependency is needed.
- Preserve existing local changes, especially those in the lifecycle module, tests, and README.
