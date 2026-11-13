<!--
AI Assistance Disclosure:
Tool: Claude (Anthropic), Claude Opus 5.5, 2026-11-12 (Asia/Singapore).
Scope: Drafted this log from the session record; author to review.
-->

# AI usage log: UI and chat-service (Maliha)

Newest first. Exact prompts are in [prompts/](prompts/).

## 005: This usage log

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude (Anthropic, claude.ai), Claude Opus 5.5.
- **Mode/scenario:** Documentation, following the format of the teammates' logs (`user-service/ai/usage-log.md`).
- **Prompts:** [prompts/005-usage-log.md](prompts/005-usage-log.md).
- **Key response:** Drafted this log and the prompt archive from the session, pointed the AI headers in the changed files at their entries, and added a UI and chat-service section to the root README's AI Use Summary.
- **Affected locations:** `ui/ai-usage/usage-log.md`, `ui/ai-usage/prompts/`, `README.md`, AI header lines in the files listed in entries 002 to 004.
- **Checks:** `git diff --check` passed.
- **Human review/edits:** Pending.
- **External sources:** None.

## 004: Combining `ui/final-n2h` with main into one PR

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude (Anthropic, claude.ai), Claude Opus 5.5.
- **Mode/scenario:** Combining the N2H branch, the bug fixes and the chat change into one commit and one PR, plus help with local testing.
- **Prompts:** [prompts/004-combine-into-one-pr.md](prompts/004-combine-into-one-pr.md).
- **Key response:** Merged main into the N2H branch in a scratch copy and resolved 5 conflicts. README: kept main's AI Use Summary and the branch's chat-service lines. `credits.ts`: kept the "Balance restored" label and added it to the history filter from PR #118, which would otherwise hide it. `users.ts`: kept one `deleteMe` (the N2H version that returns the message). `OrderDetailsPage.tsx` and `ProfilePage.tsx`: kept both sides. The merged profile had two "Delete account" buttons; kept the N2H confirm popup and removed the button to the teammate's `DeleteAccountPage`, whose one call was updated so it still compiles. Packed the result as one zip to apply on a branch from main. Added `tsx` as a UI dev dependency and an `npm test` script. During local testing, traced a signup 502 to user-service failing to start without `keys/otp.key` (new on main; fixed with `npm run keys:otp`).
- **Affected locations:** `README.md`, `ui/api/credits.ts`, `ui/api/users.ts`, `ui/pages/OrderDetailsPage.tsx`, `ui/pages/ProfilePage.tsx`, `ui/pages/DeleteAccountPage.tsx`, `ui/package.json`, `ui/package-lock.json`.
- **Checks:** On the combined tree, UI `tsc --noEmit`, `vite build` and `npm test` (22/22) passed; chat-service `tsc` passed and `npm test` 7/7 passed.
- **Human review/edits:** Pending. The choice of delete-account flow is to be confirmed by the author.
- **External sources:** None.

## 003: Chat closes 1 h after the errand ends

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude (Anthropic, claude.ai), Claude Opus 5.5.
- **Mode/scenario:** Implementation of an author-specified requirement change (F10.4).
- **Prompts:** [prompts/003-chat-close-1h.md](prompts/003-chat-close-1h.md).
- **Key response:** Previously sending stopped 10 min after the errand ended and the chat stayed read-only until deleted at 1 h. Now the chat stays fully open for 1 h after delivery or cancellation, then closes. `chat:join` returns `closesAt`; the panel shows "Errand complete. This chat closes in an hour, at <time>" and closes on screen at that time. The UI re-joins when the order status changes, so the notice appears as the errand completes. Confirmed no order behaviour changed (the "order" in the first prompt was a typo).
- **Affected locations:** `chat-service/src/rules.ts`, `chat-service/src/chat.ts`, `chat-service/test/rules.test.ts`, `chat-service/README.md`, `ui/api/chat.ts`, `ui/hooks/useChat.ts`, `ui/components/ChatPanel.tsx`, `ui/pages/OrderDetailsPage.tsx`, `ui/pages/AcceptedOrderPage.tsx`.
- **Checks:** chat-service `tsc` (source and tests) passed, `npm test` 7/7 passed; UI `tsc --noEmit` and `vite build` passed. Live socket test pending.
- **Human review/edits:** Author set the 1 h close and the notice. Review pending.
- **External sources:** None.

## 002: UI bug-list fixes and show-password toggle

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude (Anthropic, claude.ai), Claude Opus 5.5.
- **Mode/scenario:** Bug fixing from the author's handwritten bug list, after PR #118 was merged.
- **Prompts:** [prompts/002-ui-bug-fixes.md](prompts/002-ui-bug-fixes.md).
- **Key response:** Traced each remaining bug: order-service stores the pickup as the supplier's `"lat, lng"`, so the UI now looks up the supplier's building and floor (with a Maps link); the details page's Pickup → Deliver → Complete row was hard-coded to the first step; the tracker never ticked "Delivered"; order pages loaded once, so the requester never saw the courier's progress (added 10 s polling while in progress); the reset-password page still showed one password error at a time. Added a role badge on the profile, clearer "Deliver by" wording (the 1-hour minimum is enforced by order-service, so kept), background refresh of Open Requests, and a reusable show/hide password input on login, signup and reset password.
- **Affected locations:** `ui/components/PasswordInput.tsx` (new), `ui/hooks/usePickupPlace.ts` (new), `ui/hooks/useOrder.ts`, `ui/App.tsx`, `ui/api/orders.ts`, `ui/pages/OrderDetailsPage.tsx`, `ui/pages/AcceptedOrderPage.tsx`, `ui/pages/OrdersPage.tsx`, `ui/pages/ProfilePage.tsx`, `ui/pages/CreateRequestPage.tsx`, `ui/pages/SignupPage.tsx`, `ui/pages/LoginPage.tsx`, `ui/pages/OtpVerifyPage.tsx`, `ui/pages/AdminPage.tsx`, `ui/tests/bugFixes.test.cjs` (new).
- **Checks:** `tsc --noEmit` passed; `vite build` passed; `node --import tsx --test tests/*.test.cjs` 22/22 passed (4 new); signup page checked in a headless browser (toggle and combined warning). Live backend test pending.
- **Human review/edits:** Pending. Author chose the bugs to fix; "show complete order" was interpreted by AI as showing full, untruncated details (to be confirmed by the author).
- **External sources:** None.

## 001: Review of PR #118 (ui-order-fix)

- **Timestamp:** 2026-11-12 (Asia/Singapore).
- **Tool/model:** Claude (Anthropic, claude.ai), Claude Opus 5.5.
- **Mode/scenario:** Code review of a teammate's PR before merging, plus help with GitHub's review flow.
- **Prompts:** [prompts/001-pr118-review.md](prompts/001-pr118-review.md).
- **Key response:** Checked the PR against the backend: `PATCH /users/me` and `PATCH /orders/:id` exist with matching fields, and the `scope=open` query is correct (empty when testing alone because your own requests are excluded). Reported it as safe to merge, with non-blocking notes: the reset-password page was not covered by the password fix, signup error order, `tsx` missing from devDependencies for the tests, an unclear "Paid for a completed request" label, and inconsistent "CampusDash"/"Campus Dash" naming. Explained that the review had been submitted as a comment and how to choose Approve.
- **Affected locations:** None (review only).
- **Checks:** `tsc --noEmit`, `vite build` and the PR's 18 tests passed locally; merge into `main` was conflict-free.
- **Human review/edits:** Author approved and merged PR #118.
- **External sources:** None.
