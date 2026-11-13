# FoC product design contract

This is the shared UI/UX source of truth for every Friend on Campus frontend. It records the
implemented product language rather than a one-off mock-up. Product behaviour still comes from
the owning service's requirements, API and tests; this document governs how that behaviour is
presented and how cross-service journeys remain coherent.

## Product experience

FoC should feel like one campus application, not a collection of service dashboards.

- Start with the user's task: request help, run an errand, find a supplier or understand credits.
- Use plain, action-led language. Explain consequences before irreversible actions.
- Keep primary actions obvious and secondary detail quiet. Use the dimensional brand, restrained
  colour-blocking and soft elevation to orient people; decorative treatment must not compete with
  a decision or obscure product state.
- Preserve context across service routes. Navigation, identity and selected role must not jump,
  resize or silently reset when a different service renders the page.
- Prefer a clear empty state with the next useful action over an empty table or developer message.
- Never simulate success, identity, permissions, balances or lifecycle state in the browser.

## Shared application shell

All signed-in service pages use the same shell and order:

1. Friend on Campus brand, linking to `/admin` in Admin mode and `/` otherwise.
2. Participant modes show `Home`, `Errands`, `Suppliers`, `Credits`. Admin mode uses `Admin` as
   its home destination and shows only `Admin`, `Suppliers`; `Home`, participant Errands and
   Credits destinations are omitted.
3. Requester/Courier selector for participant modes.
4. Notification bell in participant modes only: a Lucide `Bell` linking to `/notifications`, with
   the unread count as a small badge (`9+` above nine) and in its accessible name
   ("Notifications, 3 unread"). It is hidden in Admin mode, `2.75rem` square with a `1.25rem`
   icon, centred, and marked current on the Notifications page. Its badge uses coral `#df9b93`
   with navy `#172641` text in every frontend. Header rules for `1rem` navigation icons must
   exclude the bell.
5. Account menu with profile, permitted administration actions and sign out.

Every account menu links Profile to `/?view=profile`. Personal details, username editing and
password replacement live on that dedicated view and are not duplicated on Home. Sign out clears
the shared browser session and UI mode before returning to `/`, so it behaves consistently from
every service shell. The header establishes a stacking layer above page artwork and cards, and the
open account menu remains pointer-interactive above that layer on every route.

The bell is the same `NotificationBell.tsx` and `useUnreadCount.ts` copied into every frontend's
`src/components/`; Notification Service owns them and the copies must stay identical. It polls only
the unread count, about every 30 seconds while the tab is visible, keeps the last count when a poll
fails rather than showing `0`, and stops when the session ends.

Participant pages also mount the Notification-owned `NotificationPush.tsx` and stylesheet. It
polls the cursor-based push feed while the page is visible and shows up to three top-right cards.
Errand lifecycle and private chat-message cards dismiss automatically after five seconds, may be
dismissed manually, and open the relevant errand or chat when selected. They are never rendered in
Admin mode. Chat-message cards are transient only: they do not appear in the bell list or its
unread count; lifecycle notifications remain persistent in both places. Push payloads contain only
the existing privacy-minimal notification message and order link, never private chat content.

The active route uses text colour plus a 3 px underline. Primary navigation uses concise text labels
without supporting icons; the notification bell remains an icon control with an accessible name.
Desktop headers are `4.5rem` high with an `80rem` maximum content width. At narrow widths the
navigation becomes a horizontal, keyboard-accessible row rather than wrapping or dropping
destinations.

### Role selector contract

The Requester/Courier selector is one control shared by every frontend:

- Outer options box: inline flex, vertically centred, `3px` padding, `1px` neutral border,
  `8px` radius and white surface; its rendered height is `40px`.
- Buttons: inline flex, centred, `32px` fixed height, `8px` horizontal padding, `6px` radius,
  `12.48px` (`0.78rem`) semibold text and unit line height.
- Selected state: action green surface, white text and `0 1px 2px rgb(23 32 51 / 18%)` shadow.
- Hover affects only the hovered choice; disabled/busy controls must not accept another switch.
- Use `role="group"`, accessible label `Choose your current role` and `aria-pressed` on both
  choices. Keyboard focus must remain visible.

Changing role calls the User Service session-role endpoint. Only a valid replacement response may
replace the stored JWT and selected role. While pending, both choices are disabled. On failure,
keep the previous JWT and role, show an actionable error and leave backend authorization
authoritative. A successful account-menu switch to Admin opens `/admin`; an existing Admin session
visiting bare `/` also opens `/admin`. Switching back to User opens `/`. This prevents
participant-only pages from remaining visible under an Admin session. A role switch must not alter
balances, orders, profiles or other domain data.

## Foundations

### Colour

| Purpose | Value |
| --- | --- |
| Canvas | `#f7f6f3` |
| Surface | `#ffffff` |
| Primary ink | `#12151b` |
| Brand navy / primary action | `#172641` |
| Brand blue / active navigation | `#5068b3` |
| Brand mauve | `#a36f76` |
| Brand coral | `#df9b93` |
| Brand gold | `#f1c675` |
| Muted ink | `#686a70` |
| Action soft | `#f0f2fb` |
| Border | `#e8e6e1` |
| Danger | `#a2372b` |
| Keyboard focus | `#5068b3` |

Meet WCAG AA contrast for text and controls. Never communicate status using colour alone.

### Type, spacing and shape

- Use DM Sans for interface and body copy, Manrope for headings and brand text, then Public Sans
  and system sans-serif fallbacks. Inherit interface typography for all form controls.
- Use a restrained type hierarchy: compact navigation, readable `1rem` body copy and responsive
  page headings. Avoid oversized dashboard metrics unless the value is the page's main purpose.
- Base spacing on multiples of `0.25rem`; prefer `0.5`, `0.75`, `1`, `1.5`, `2` and `3rem`.
- Controls are at least `2.75rem` high except compact segmented controls. Cards normally use
  `0.875–1rem` radii; pills are reserved for short statuses or filters.
- Use the shared navy-tinted soft shadow for elevation. Hover movement is subtle (`1–2px`) and must not move
  surrounding layout.

## Components and interaction

- **Buttons:** one clear primary action per local decision area. Use real buttons for actions and
  links for navigation. Provide hover, focus, active, busy and disabled states.
- **Forms:** keep labels visible, validate near the field, preserve valid input after errors and
  state the required format before submission where helpful.
- **Feedback:** distinguish loading, empty, success, warning and error states. Loading placeholders
  should preserve final layout. Errors describe recovery without exposing internal details.
- **Cards and lists:** use cards to group related actions or records, not as decoration. Lists and
  tables need meaningful headings and responsive alternatives where horizontal reading fails.
- **Menus:** close after a successful selection or navigation. Do not close on a failed role
  change if the error needs context.
- **Icons:** use Lucide React icons with consistent stroke weight. Do not use emoji as production
  interface icons or mix unrelated icon families.
- **Motion:** keep transitions near `150–200ms`; respect `prefers-reduced-motion` and never require
  animation to understand state.

### Operational surfaces

- **Authentication:** signed-out Home pairs the public value story with one elevated account card.
  Sign-in and account creation share clear tabs; registration shows Account and Verify email as
  explicit steps. Keep labels visible, state the real email/password rules, retain password
  visibility, recovery, OTP resend and API error states, and link guests to the live Supplier
  directory rather than showing invented supplier records.
- **Chat:** keep the errand context, privacy boundary and active/closed state visible above the
  thread. Participant messages use aligned bubbles, lifecycle activity uses a neutral system
  entry, and translation, quick replies, images and the composer remain part of one elevated
  conversation surface. The owning Chat APIs remain authoritative for access and state.
- **Notifications:** render event-backed rows newest first with an icon, plain-language category,
  timestamp, unread text and available actions. Colour accents distinguish errand, credit,
  completion and attention categories but never replace their text labels.
- **Admin:** present a protected overview with Admin-API-backed case counts and a short open-case
  priority queue, followed by platform tools. The full queue remains the primary review work area
  and keeps filters, assignment, evidence, participant statements, private follow-up and resolution
  visually distinct. Never manufacture supplier, member or case metrics that the Admin API does
  not provide.

## Key journeys

- Signed-out users see the FoC value and sign-in/register path without being shown an internal
  service dashboard. Authentication progress, verification and recovery remain explicit.
- Signed-in Home prioritises requesting help and running errands, then exposes Suppliers, Credits
  and account information.
- Errand screens adapt actions to the active Requester/Courier role while preserving access to the
  user's own active and historical errands. The Requester Errands destination is `/errands/mine`,
  where **Create new errand** opens the separate `/errands/new` form; Courier Errands opens the
  available request pool at `/errands/browse`.
- Suppliers remain a discoverable participant destination; administration actions appear only in
  Admin mode and are still enforced by the Supplier backend.
- Credits are an account view inside the main application, not a separate dashboard. Account
  creation and initial allocation are platform processes, not user-facing setup actions.

## Disputed errands

A saved report first shows **Preparing review** until Order confirms its freeze and Chat confirms its barrier. Explain that the errand pauses when Order processes the request; actions committed before that boundary remain valid. Pending preparation is not a submitted/accepted report. Poll private status without inventing completion. Closure likewise shows pending owner confirmations and becomes final only when the backend records all required outcomes.

Order review metadata places errands in a separate **Under review** section with a text badge, a distinct border, and the lifecycle stage where progress paused. The detail notice explains the report and permits the other party to add a statement. Normal errand actions and errand-chat sending are unavailable; private admin follow-up remains available until closure. Finished reviews appear in Past with **Resolved after review**; their detail heading shows the review outcome without marking unperformed delivery milestones as done. Admin shows original messages and protected images chronologically with other evidence, and labels statement authors **Reporter**. Verified parties retain admin contact/actions even without a statement. These displays follow producer authorization and never generate issue summaries.

## Responsive and accessible delivery

Every affected journey must be checked at desktop and `375px` width, with keyboard-only input.
Semantic landmarks, headings, labels and live error messages are required. Do not remove focus
outlines, depend on hover, trap keyboard focus or hide required navigation on small screens.
Content must tolerate zoom, long usernames and empty/slow/error responses without overlap.

## Ownership and change control

Service owners retain their frontend behaviour and API boundaries. A shared-UI assignment may
update multiple frontends only when its cross-service scope and editor are explicitly approved;
it does not authorize backend, database or contract changes.

When a material shared design decision changes:

1. Update this file in the same change.
2. Update every affected implementation and regression test together.
3. Obtain review from affected frontend owners.
4. Verify the complete shared shell across Home, Errands, Suppliers, Credits and Admin.

Do not copy this document into service folders. Link to it so there is one maintained contract.

## Completion checklist

- Shared header order, sizing, typography, text-only primary navigation and active state remain
  consistent across routes.
- Successful role selection replaces both role and JWT; failure preserves both.
- Account menus and navigation behave consistently across services and close when expected.
- No UI-only permission is treated as authorization; protected APIs still enforce access.
- Loading, empty, error, busy and disabled states are usable and do not lose data.
- Desktop, `375px`, keyboard, focus and reduced-motion checks pass.
- Owning frontend lint, type-check, tests and production build pass.
- `.github/scripts/test_ui_design_contract.py` passes for shared visual invariants.
