# CHANGE-014: Persist Shared Frontend UI Style Baseline

## Request

Record the visual style of the existing staging Friend on Campus interface so future
Order Service frontend work remains harmonious with the shared application.

## Evidence

- User-provided staging dashboard screenshot dated 2026-09-29.
- Existing shared frontend implementation in `../frontend/`, including Geist Sans,
  shadcn/Base UI primitives, Lucide icons, semantic neutral tokens, and the existing
  responsive `AppShell`.

## Changes

- Added `docs/frontend-ui-style-guide.md` as the persistent visual-style authority for
  future Order Service UI proposals and implementation.
- Updated the Order Service instructions and frontend workflow to require reading and
  applying the guide before frontend design or implementation.
- Recorded typography, semantic color/surface, layout, icon, spacing, responsive, and
  interaction guidance without inventing product behavior or feature requirements.

## Deliberately not decided

- No new page, route, navigation item, role, mode, API contract, component, or product
  behavior was approved.
- The screenshot does not prove exact pixel measurements; live frontend tokens remain
  authoritative.
- The optional Taste skill was not installed because this turn documented an existing
  UI baseline rather than generating a new visual design.

## Result

Workflow/documentation change only. No frontend or backend application source, tests,
contracts, or deployment configuration were modified.

## Verification

- Confirmed the guide references the live Geist/shadcn/Lucide implementation.
- Confirmed the guide requires re-inspection and approval before future UI work.
- Confirmed no application behavior was changed.

## Reversal considerations

Reverting this change removes the persistent style baseline and its workflow references;
it does not alter existing frontend source or deployed behavior.
