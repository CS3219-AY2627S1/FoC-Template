# CHANGE-028 — Fix Requester/Courier mode-menu runtime crash

- **Date:** 2026-09-30
- **Status:** Implemented; runtime retest pending
- **Developer:** Vincent
- **Approver:** Vincent's reported runtime failure and approved frontend scope

## Problem

Switching the Requester/Courier mode menu caused a production Base UI error (`#31`):
`MenuGroupContext is missing`. The mode menu rendered `DropdownMenuLabel` outside the
required `DropdownMenuGroup`, so the shared Base UI menu primitive could not resolve its
group context.

## Change

Wrapped the mode label and its Requester/Courier items in `DropdownMenuGroup` in
`frontend/src/components/app-shell.tsx`. This is a frontend-only implementation fix; it
does not change Order Service endpoints, peer-service contracts, role rules, or persistence.

## Verification

- The browser screenshot supplied by the developer reproduced the failure and identified the
  Base UI error.
- Static inspection of the installed Base UI package confirmed error code 31 is emitted when
  a menu group label is used without `Menu.Group`/`Menu.RadioGroup` context.
- `git diff --check` is required before commit.
- Vitest, typecheck, lint, production build, and browser retest remain pending because Node/npm
  execution is unavailable in this Codex session.

## Scope and rollback

No sibling service files were modified. Rollback is limited to reverting the single group wrapper
if a later verified Base UI compatibility issue is found.
