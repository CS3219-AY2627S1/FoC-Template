# CHANGE-138 — Selectable admin Orders and resolution dialogs

Yao Xiang, order-service/penalty-integration,2026-10-17. User requests shaded row
selection, a top action bar for the two existing admin operations, retained full
details/navigation, explicit penalty/no-penalty choice and preset/custom admin
explanations. Screenshot is a functional reference, not a replacement visual theme.
This approves the Order/frontend vertical slice; no sibling backend/root config.
ADR-047 records the UI and necessary reason/policy contract additions.

## Implementation contract and decisions

- Single selected current Order; select via row, radio or keyboard. Copy/name/View
  controls retain their own behavior. Clear selection on filter/page/action change.
  Top actions Cancel order / Mark as completed obey ADR-044/046 active-state and
  assignment rules, including held Orders. Retain all existing search/paging/detail
  navigation. Share actions in full Order details too. No bulk financial mutation.
- Existing shadcn/Base UI Dialog/Button/Select/Input/Textarea, muted selected rows,
  Geist/theme colors/font sizes. Responsive wrapped action bar, bounded scrolling
  dialog and existing horizontal table scroll. Native radio/checkbox/keyboard/focus
  controls and meaningful labels. Do not use screenshot yellow/grey legacy styling.
- Dialog requires explicit No penalty / Apply penalty, then selected cases if
  applying; display only maximum requested score. Use backend shared enum/amounts
  through a new admin-protected GET /api/orders/admin/penalty-policies, excluding
  SUCCESSFUL_DELIVERY. DTO: [{policy: enum name, penaltyAmount: positive integer}].
  Display labels are UI text; no copied score mapping or custom score inputs.
- Require a resolution explanation in the UI: suggestions vary by action; Other
  opens a custom textbox. Suggestions are ordinary explanation text, separate from
  penalty appliedReason. Max1000 characters. Submitted resolutionReason is an
  optional nullable string for existing backend callers, nonblank when supplied.
  Both admin DTOs/services accept it, strip outer whitespace, persist it atomically
  and bind it into new receipt fingerprints. If absent, preserve the old fingerprint
  exactly so pre-change exact retries remain valid. No new Pub/Sub payload field.
- V11 adds nullable orders.admin_resolution_reason varchar(1000), no backfill guess.
  OrderResponse also exposes nullable existing decision/reason/amount/resolution time
  plus saved explanation for the full details card; this records requested intent,
  not subscriber APPLIED. Historical rows/clients remain compatible.
- Live requests use useApi bearer transport to real cancel/complete endpoints.
  Mock mode uses local admin-mock Order-only mutations/receipts in sample memory,
  same policy discovery, and no real Order/credit/score/outbox side effects. No live
  error falls back to mock. Local demo actions must say sample data.
- Busy state prevents duplicate submits/closing; errors retain choices for exact
  retry; success clears selection, refreshes filtered data and reports asynchronous
  funding/penalty requests honestly. No automatic score/reward beyond selected case.
- Reason is audit data only; no new permission, penalty rule, status, event, report
  release, or Credit/User action. Admin role still enforced server-side. Both fields
  and submitted participants validated; no freely chosen payment recipient.

## Context, peer evidence and verification

Root/Order/Frontend instructions, spec-driven workflow, owner/profile/allocation,
active sprint/context/ADRs/contracts/traceability and existing frontend providers,
layouts/styles/API/tests inspected. Same owner/branch, no unresolved merge and
source PDF fingerprints unchanged. Existing admin endpoints are Order-owned,
verified by CHANGE-134–137. Credit compact completion/refund and User addition
contracts remain unchanged, so no new peer dependency; FEEDBACK-014 still pending.
Client-side admin gate is presentation only; production RequireAdminRole remains.

TDD: selection/toolbar/modal validation/maximum/waiver/custom reason, no hijacked
links, failures/busy/retry/filter reset; mock/live request paths and complete body.
Backend: optional reason/legacy receipt binding/new reason replay conflict/atomic
rollback, policy lookup security, isolated demo actions and OpenAPI. V11 clean/V10
upgrade + local backup/apply workflow; preserve seven local Orders and prior work.
Full Order/common and frontend test/type/lint/build checks; desktop/mobile browser
inspection if local surfaces can be safely exercised; report actual limits.

## Final verification — 2026-10-17

- RED: two initial UI selection/dialog tests failed against the previous UI; new domain reason test failed compilation before the new reason API existed. GREEN: root Maven verify passed common12 + Order494 =506, no failures/errors/skips, both coverage gates and executable JAR. Surefire reported its existing forced-exit shutdown message after successful tests; Maven still exited0/BUILD SUCCESS. Final strengthened PostgreSQL reason/cancellation/rollback suite6/6 passes after that full run.
- Frontend40 files/218 tests pass; TypeScript and production build pass; lint0 errors with3 pre-existing unused-variable warnings in login-form.tsx. Adapter tests verify exact live/mock URLs and no error fallback. UI covers row/radio/keyboard, preserved navigation, state eligibility, max policy preview, reason requirement, no-penalty cancel, retained-error retry and submit guard.
- Built frontend + current Order app + existing Firebase emulator checked in hidden local Edge at1440x1000 and390x844. Real browser selection/dialog, backend-provided policy scores, selected penalty/reason, sample completion and saved full details pass; final mobile buttons wholly within viewport and no page horizontal overflow. Desktop/mobile screenshots under ignored target/change138-*.png. The CUA entrypoint failed with missing kernel assets; local Edge CDP fallback used. A temporary target-only CORS relay stood in for the gateway; repository CORS was unchanged. No cloud/deployed financial or User-scoring demonstration.
- V11 clean/upgrade tests pass. Before startup migration, actual foc-order-postgres-1 backed up to target/change138-before-v11.dump; archive is readable and includes Orders data. Schema10->11, all7 existing Orders retained. No real Order transitions or funds/scores/events generated by browser sample actions.
- AsyncAPI schemas parse/positive-negative checks pass unchanged; TOML409 qualified keys unique (not full TOML parser validation). Git diff whitespace check passes and no unmerged entries. Existing staged merge and sibling changes preserved; nothing committed/pushed.

Remaining: rebuild Order and frontend images together for this change. Cloud/staging role/settlement/User subscriber verification remains outside this local UI increment; FEEDBACK-014 unchanged. Source behavior, UI and migration increment complete; no whole-Sprint completion claim.
