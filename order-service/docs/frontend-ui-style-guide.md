## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

Requester/automatic completion chooses the highest stored report penalty or factual delivery overdue (1). If neither applies, it emits SUCCESSFUL_DELIVERY deduction (1); it never emits a reward plus a penalty. Previously persisted legacy waivers suppress only their overdue candidate; they cannot erase a stored report penalty, and no new waiver is allowed. Courier abort chooses max(stored policy, accepted cancellation2); archive retains stored policy/audit and reopening clears the current fields before another courier assignment. Admin cancellation chooses max(stored policy, explicitly selected policies) and never compares overdue; no stored/selected penalty means refund only. Existing initial outbox events and final per-attempt outcome recording remain atomic with the transition. Event wire schemas/topics are unchanged.

V14 adds Order and abort-archive policy/audit columns; V1-V13 and historical adjustment data remain untouched. Retired replacement records are historical only, with no runtime coordinator/gateway. No sibling backend, shared env/topic/CI/cloud changes. Report UI Open/Closed cards, required replies, no deadline and live Coming soon remain unchanged. Live Apply penalty uses the real Order API; local mode uses the isolated mock. Details and acceptance evidence: CHANGE-146/ADR-050.

## Effective penalty replacement and Report queue amendment — CHANGE-144 / ADR-049 (2026-10-18)

Approved Yao Xiang on order-service/penalty-integration: one current outcome per courier attempt, including No penalty or successful-delivery reward. Delivery stores factual overdue; completion/auto-completion read the stored flag. Initial outcomes are recorded atomically with completion/courier abort/admin resolution and existing event intents; original initial penalty/Credit topics and schemas are unchanged. A new acceptance has a new attempt identity, and an abort archive keeps the preceding identity.

Admin replacement is synchronous, not a new Pub/Sub topic. Order commits a stable-ID PENDING adjustment, calls User Service using fresh verified admin authorization, then confirms the current outcome in a second atomic transaction only after a matching reply. Another adjustment to that attempt is blocked while pending; exact same-ID authorized retry recovers timeouts/crashes. No bearer token is stored. User replacement endpoint is MISSING (FEEDBACK-016), so order.penalty-adjustment.enabled defaults false and live UI clearly disables writes. Local mock is isolated. Initial outbox publication never proves score application. New V13 tables preserve request audit/revision and current outcome; historical outcomes are not fabricated. Existing V1-V12 stay immutable.

Old overdue-waiver HTTP/UI is removed; V12 historical audit fields and previously saved decisions remain readable. Reports use Open/Closed cards with counts/pagination and visible five-second polling. No response deadline or deadline timer: courier may respond once while unresolved, and admin may resolve any open report with a required reply saved in resolutionNote. Case detail retains Order-first layout and links to separate Order financial actions. Report Service remains MISSING; HTTP-peer/staging/production Reports remain Coming soon. No sibling backend, shared environment/topic, CI or cloud configuration changes.

# Shared Frontend UI Style Baseline

## Admin table page size — CHANGE-140

CHANGE-140, Yao Xiang2026-10-17: Admin Orders requests20 rows in live/mock mode; local sample User table requests20. Shared frontend ADMIN_TABLE_PAGE_SIZE keeps Order exact-search metadata consistent. Server totals/pagination and scrolling retained; fewer matching records do not get blank filler rows. Supplier cards remain10 and Credit history20. Live User directory still awaits its existing provider; not enabled by this change. No backend/schema/API-shape/auth/config changes.


## Admin Orders compact controls — CHANGE-139

User-selected2026-10-17: table-top toolbar uses px-2/py-1.5 and existing small buttons (41px measured desktop height), with normal theme typography/colors. Selected state is a small count and icon clear, not a padded full-ID card. Reuse RefreshCwIcon in icon-xs Button with title/aria-label and loading spin. Calendar controls display DD/MM/YYYY with CalendarIcon and native date input; avoid visible Created-from text but keep accessible start/end names and creation-date tooltip. Wrap controls at phone width, keep the table horizontally scrollable independently, and retain the current Search/status form and details links. Screenshots are references for density/behavior, not new yellow theme tokens.

Status: workflow baseline for future Order Service frontend work.

This guide records the visual language visible in the user-provided staging
"Friend on Campus" dashboard screenshot and reconciles it with the live shared
frontend implementation. It is a consistency rule, not a substitute for a feature
requirement or an approved detailed UI design.

## Authority and evidence

1. The current shared frontend source and its design tokens are authoritative for
   exact implementation values.
2. The supplied staging screenshot is the visual reference for composition, density,
   hierarchy, and overall tone.
3. Screenshot-only measurements are approximate; do not infer a new product behavior,
   route, navigation item, role, or interaction from the screenshot.
4. Before implementing a UI, re-inspect `../frontend/` and reuse its existing layout,
   primitives, tokens, and patterns.

Reference source inspected for this baseline:

- `../frontend/src/app/layout.tsx`
- `../frontend/src/app/globals.css`
- `../frontend/src/components/app-shell.tsx`
- `../frontend/src/components/ui/`
- User-provided staging dashboard screenshot dated 2026-09-29

## Visual character

- Clean, calm, spacious, and utility-focused.
- Predominantly white and near-black monochrome surfaces.
- Strong hierarchy through weight, spacing, and alignment rather than decoration.
- Thin neutral borders and very restrained shadows.
- Rounded controls and panels, but no excessive pill-shaped or ornamental treatment.
- Consistent line-icon language; avoid mixing filled icon families with the existing
  outlined navigation icons.
- Keep the interface legible and quiet at both desktop and mobile-web widths.

## Typography

The live frontend uses `Geist` from `next/font/google` as `--font-sans`; use that
existing font rather than adding a new font family.

| Purpose | Existing baseline |
|---|---|
| Body and navigation | Geist Sans, normally `text-sm` (14px), regular/medium |
| Page heading | `text-2xl` (24px), semibold, tight tracking |
| Card/dialog heading | `text-xl` (20px) or `text-base` (16px), medium/semibold |
| Supporting/helper text | `text-sm` (14px) or `text-xs` (12px), muted foreground |
| Buttons and controls | `text-sm` (14px), medium |
| Code or technical values | Existing Geist Mono token only when appropriate |

Do not hard-code a different web font or introduce a second heading family without an
approved design-system decision.

## Color and surface baseline

### Approved Admin consistency refinement - CHANGE-125 (2026-10-13)

Use the central presentation scope in frontend/src/app/admin/layout.tsx. Primary
values, table IDs/links and data badges use Geist Sans/14px/regular. Page headings
stay24px; section headings20px; muted metadata labels12px. Actual numeric balance
metrics retain their existing emphasis; unavailable values use14px muted helper
text. Shared form controls keep their existing responsive sizing/behaviour.

Admin presentation adapts the shared history's technical monospace IDs to the
same primary-value font/size without editing its normal-profile implementation.
Leaflet popup UI inherits the Admin font and shared card/foreground theme tokens.
Preserve meaningful existing Supplier/Credit positive/reservation/debit and
destructive colours; normal/admin use the same shared state-colour mapping.
Do not change normal-page styles or add fonts/palettes to achieve consistency.

Use the semantic tokens in `frontend/src/app/globals.css` and existing shadcn
components instead of scattered literal colors:

- `background` and `card`: white/light surfaces.
- `foreground`: near-black primary text.
- `primary`: near-black action surface with light text; use for the strongest CTA.
- `muted`/`secondary`: very light neutral surfaces for active navigation and quiet
  controls.
- `muted-foreground`: gray supporting text.
- `border`: light neutral one-pixel separators and card outlines.
- `destructive`: reserved for actual destructive/error states.
- Existing status colors (for example, the supplier open badge) must remain semantic
  and restrained.

Avoid introducing bright brand colors, gradients, heavy drop shadows, or a new dark
theme treatment merely to decorate an Order Service screen.

## Layout and component patterns

- Reuse the shared `AppShell` and responsive sidebar rather than creating another
  navigation shell.
- Desktop uses a persistent left sidebar with a subtle right border; mobile uses the
  existing responsive navigation pattern.
- Sidebar navigation uses compact icon-plus-label rows, `rounded-lg` active states,
  modest horizontal padding, and clear selected contrast.
- Brand/header treatment is compact: icon plus product name, medium/semibold weight,
  and a thin divider.
- Main content should use generous whitespace and a clear content boundary or card
  when the feature calls for one.
- Reuse `Button`, `Card`, `Badge`, `Dialog`, `Sheet`, `Skeleton`, and other existing
  UI primitives before creating new variants.
- Default panel/card treatment is a light border, rounded corners (usually the
  existing `rounded-xl` family), and minimal shadow/ring.
- Use Lucide icons already used by the frontend; keep icon size and stroke weight
  consistent with neighboring components.

## Interaction and responsive expectations

- Preserve the existing hover, focus-visible, disabled, loading, and error patterns.
- Use short, subtle transitions; do not add large motion or layout-shifting effects.
- Design one responsive web experience for desktop and mobile browsers. Do not create a
  separate native mobile UI without explicit approval.
- Validate the layout from 320px through 1920px and check touch-target sizing,
  overflow, text wrapping, keyboard focus, and reduced-motion behavior where relevant.
- Keep UI state and messages consistent with the approved Order Service contract and
  application role/mode. Visual consistency never replaces backend authorization.

## Implementation gate for future Order Service UI

Before frontend implementation:

1. Read this guide and `docs/frontend-integration-workflow.md`.
2. Re-inspect the live shared frontend and identify reusable components/tokens.
3. Propose the affected page, route, role/mode, states, responsive behavior, and API
   contracts; do not invent them from the screenshot.
4. Obtain the required feature-level architecture/UI approval.
5. Implement with the existing Geist/shadcn/Lucide conventions and verify lint,
   typecheck, role/mode behavior, accessibility, and responsive behavior.

When a future approved design intentionally departs from this baseline, record the
reason and approval in the existing change/architecture records rather than silently
overwriting this guide.


CHANGE-141: single selected Order uses primary/15 (hover primary/20), without a count. Reports reuse Card, Table, Dialog, badges, outline buttons, shared type/spacing and full record routes. Three semantic statuses; one-category radios; requester and courier evidence in separate cards; mobile cards stack and tables scroll. Order resolution and report resolution remain distinct confirmation dialogs.


CHANGE-142 (2026-10-18), user-directed presentation refinement: Report detail and submission use one continuous panel, with Order summary before report metadata and aligned definition-list rows. Admin clicks the Order summary to navigate to existing /admin/orders/{id}; no separate View full order details button and no financial actions on Report pages. Only Mark report resolved remains. Existing Order page actions, API/mocks/auth/statuses/polling and DB stay unchanged. GOV.UK summary-list structure informed layout; FoC theme retained.


CHANGE-143 (2026-10-18): Report Order summary has labelled Description and requester/courier display names. Status label sits above one equal-height select/refresh row. Admin Orders live list/details resolve distinct User summary and Supplier detail IDs independently via existing gateway/token transport; never block Orders on name failure or substitute sample data. Loading labels, Deleted labels for404/empty, unavailable for transient errors; copy/navigation IDs preserved. No global name cache, DB-owned names or API/config changes. Live Reports remains Coming soon until FEEDBACK-015 provider exists.


CHANGE-148 (2026-10-19), Yao Xiang: presentation-only refinement in existing Admin/reports components. Completion hold displays Yes/No. Refresh icon shares Open reports heading row; normal participant section controls remain available. Cancellation uses muted Choose one penalty case/highest-selected guidance and requested stored-penalty warning. Remove score-event/overdue-comparison implementation details from Apply Penalty description. No API, backend, data, scoring, authentication, navigation, schema or deployment behavior change. Reuse existing components/theme. Existing component tests/typecheck/build and frontend image verification pending; no new tests for reversible copy/CSS edits.


## Report list filters — CHANGE-149

The local Report list GET accepts optional orderId (exact related Order ID, trimmed, max128) and reportStatus (AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW, RESOLVED). Existing status=OPEN or RESOLVED remains the grouping selector; reportStatus intersects it. Empty filters mean all within the group. Scope/filters apply before pagination and totals; filters reset both page counters. The future Report Service must support equivalent filtering on its existing list contract and derive participants/admin from verified identity; this prototype's sample identity flags are never production authority. UI uses the same shared AdminFilterForm/Actions, Select and Input as Order search; normal user and Admin Reports retain their respective scopes. No refresh icon; existing visible five-second polling and error retry remain. HTTP-peer/staging/production Reports still show Coming soon, with no mock fallback.


CHANGE-150 (2026-10-19), Yao Xiang: remove separate Open/Closed report sections. One server-paginated card list under the existing Order ID/report-status filters; one five-second polling query with blank grouping selector (all statuses). Preserve grey styling and View report for RESOLVED cards. Filters and participant-tab changes reset the single page. Existing backend supports this query; no backend, endpoint, data or scoring change. TDD regressions cover mixed active/resolved results, one query, filtering/page reset and retained navigation. Verification pending.


CHANGE-151 (2026-10-19), Yao Xiang: replace floating Base UI status-filter popups with one Order-owned native HTML StatusSelect. Covers My Requests, My Errands, Admin Orders and normal/Admin Reports in mock/live modes. Existing role-specific option sets, labels, selected values, search/Clear, page resets and polling remain. Native browser keyboard/touch dropdown; consistent existing theme/height/borders. No global Select changes, creation/reason controls, sibling service, backend, API, score, schema or deployment change. Regression tests use native change events and verify actual select controls. Verification pending.


CHANGE-152 (2026-10-19), Yao Xiang: remove all normal-mode Reports UI: /reports, /reports/new, /reports/[id], normal sidebar entry, submit/response/evidence-upload forms, participant tabs/branches and unused frontend submission helpers/types. Retain only AdminReportsPage under existing RequireAuth/AdminGate layout, Admin list/search/status/pagination/polling, grey resolved cards, linked Order/user details, evidence/response viewing and resolve-with-reply. Local admin sample/live Coming soon unchanged. Backend sample fixtures/endpoints, report/hold/domain rules and future Report Service requirements remain; this is UI-scope removal only. No sibling/backend/config/data changes. User explicitly authorized removal; deleted source backed up under ignored target for recovery. Verification pending.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).


## CHANGE-182 - Order Supplier selection (2026-11-09)

User-approved SupplierSelector stays under components/orders and reuses installed Base UI Combobox with existing Input/Button theme, h9 field sizing and normal-weight selected labels. Anchor-width/viewport-bounded popup, max-height scroll area and wrapping option labels suit mobile/desktop without changing shared design-system components. Search/browse/page controls are type=button and keyboard Enter/Escape use Base UI; selection carries the Supplier ID. Loading, no-results, minimum-query and retry explanations are near the list. Real responsive browser verification is separate from the passing component/keyboard tests; no new typography/palette/global layout conventions.
