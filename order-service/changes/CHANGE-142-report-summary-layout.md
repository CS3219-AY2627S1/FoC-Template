# CHANGE-142 — Report summary layout

User-directed Yao Xiang,2026-10-18, current penalty-integration branch. Refines CHANGE-141 only for presentation: one continuous report panel, Order summary first and clickable directly to existing Admin Order details route, aligned label/value rows with section dividers. Requester and courier accounts/evidence follow report metadata. Only Mark report resolved remains on the Admin Report page; cancel/complete/waive stay on the Order page. Keep all information, polling, authorization, confirmation, mock/live gates and APIs unchanged.

Design reference inspected: GOV.UK summary-list and check-answers patterns (https://design-system.service.gov.uk/components/summary-list/). Adapt structure, retain current FoC typography/theme/components. Mobile rows stack; long IDs wrap. Normal-user report details/creation use the same continuous form layout; only admins get the existing admin Order navigation. No new normal-user details route invented.

TDD: update case regression to require one panel, Order-before-report, direct Order link and absence of financial-action buttons. Scope frontend report component/tests and owning documentation only; no backend/migration/topic/provider change. Live Report Service remains MISSING/Coming soon (FEEDBACK-015).

## Verification

Updated case regression failed on the old layout (missing direct Order link), then all5 report cases passed with the new layout. Full frontend43 files/233 tests pass. TypeScript and lint pass without warnings. Production build initially could not fetch existing Google fonts under restricted network; retry with network access passed. No font/config/source workaround introduced.

Separate preview (Order8189/UI3089/hidden Edge9339) confirmed one long case and creation panel, Order-first sequence, direct click to existing Admin Order page with its actions, no Report financial actions, and successful resolution confirmation. Screenshots inspected at1440px desktop and390px mobile: labels/values align, sections share padding, long IDs wrap, no page overflow. Only sample records/account used; no real funding/score changes. Preview stopped and demo account removed; user Compose untouched. Backend APIs/Java/SQL/events unchanged, so backend suite not rerun for this presentation-only refinement. Existing live Report provider remains missing.
