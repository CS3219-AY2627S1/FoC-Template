<!-- AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12. Scope: Exact prompt and implementation record. Human review pending. -->

# UI order fix usage record

- Tool/model: ChatGPT, Codex agent based on GPT-6.
- Dates: 2026-11-12, Asia/Singapore.
- Modes: implementation, debugging, refactoring, regression tests, documentation.
- Human request: use branch ui-order-fix, connect UI order editing to the existing
  backend, identify orders in credit history, fix confirmation overflow, and
  remove unnecessary staged additions.
- Policy reference: CS3219-ProjectDocument-FoC.pdf, Appendix 2, pages 15–17.
- Human author review: pending. Automated checks below do not constitute author approval.

## Exact user prompts

First implementation request (attachment showed the existing Credit History):

> Switch branch to ui-order-fix. We have to check connections between UI and the backend, especially order service, check where or implement an edit order button and also it should show some order detail or name and then (Reserved for transaction) instead of just Held for transaction.

Follow-up (attachments were the project PDF and confirmation-page overflow image):

> Refer to the AI policy. And also check why are so many files being added within this commit. Remove anything unnecessary. Fix the issue of overflow on the UI found within the request confirmation page. After everything is completed, give me a runthrough of what has been done, what files and microservices have been modified. Any new coupling or dependencies and any concerns. Thank you and I look forward to it

## Key responses

> Order service already supports editing an unassigned order, but the UI has no edit button or PATCH client.

> Credit history now shows the store and instructions before “(Reserved for transaction).”

> The index contains exactly 10,000 staged files, mostly installed dependencies and runtime logs. Those additions were already present before the branch switch.

> I also found a bug in my earlier edit flow: it called crypto.randomUUID() directly, which can fail on the application’s plain-HTTP deployment. I’m reusing the existing HTTP-compatible request-key helper for both creation and editing.

## Implementation and affected files

- ui/App.tsx: retain the raw expiry timestamp on UI order data.
- ui/api/client.ts: expose response status through apiResponse while retaining
  the existing api return contract.
- ui/api/orders.ts: existing PATCH endpoint client and shared HTTP-compatible
  request-key helper moved from the creation page.
- ui/api/credits.ts: reservation wording and order-description formatting.
- ui/hooks/useOrder.ts: expose the order state setter for confirmed edit refresh.
- ui/pages/OrderDetailsPage.tsx: requester-only open-order edit form for
  instructions, credits, and deadline; unchanged retries reuse the same key;
  HTTP 202 shows pending confirmation; confirmed edits reload order details.
- ui/pages/ProfilePage.tsx: identify history entries using the existing requested
  and assigned order lists, falling back to order ID if unavailable.
- ui/pages/CreateRequestPage.tsx: summary values can shrink and wrap long tokens,
  preserve newlines, and reuse the shared request-key helper.
- ui/tests/orderEditing.test.cjs: PATCH contract, pending response, history labels,
  HTTP-compatible key, and edit-button visibility checks.
- README.md: consolidated disclosure in the final AI-use section.
- This record: exact prompts, key responses, affected files, validation, review state.

No backend service code, database schemas, API routes, package manifests, or lockfiles
were modified. The implementation uses the existing Order PATCH contract and existing
Credit/order read endpoints. No package dependencies were added.

## Staging cleanup

Before the branch switch, the index already contained 10,000 staged additions:
9,998 under node_modules and two credit-service/logs RabbitMQ log files.
They were unstaged using git restore --staged, leaving local files intact.
The branch's existing .gitignore already excludes node_modules and logs.
No new commit was created and no source changes were staged.

## Verification

- UI TypeScript check passed using Node 22.22.0 and tsc --noEmit.
- UI Vite production build passed.
- node --import tsx --test tests/*.test.cjs, run from ui: 11 tests passed.
  An earlier root-directory invocation used the wrong JSX configuration and
  failed the render tests; running from ui uses the UI tsconfig and passes.
- Browser test used the real CreateRequestPage with mocked Supplier/location
  responses, selected a supplier and destination, and reached confirmation through
  the wizard. It entered a newline and 600 consecutive A characters.
- At viewport widths 320, 375, 768, and 1280, the page had no horizontal overflow,
  summary text scroll width stayed within its column, and rendered text rectangles
  stayed within the column bounds.
- Visually inspected the 375px screenshot. Long instructions wrap inside the card.
- Temporary browser harness files were removed after verification.
- Browser verification used mocked APIs. Live Order/Credit integration and author
  review remain pending. Pending edits require retrying the same details or
  reopening the order later. Profile history uses available order lists and falls
  back to the order ID when an order is unavailable.
- The default npm-launched Node 20.10.0 could not run the installed Vite version.
  Verification used the already installed Node 22.22.0.

## Follow-up: empty Open Requests

Exact user prompt (attachment compared My Orders and empty Open Requests):

> If not fixed already, resolve issue where there are no errands (do not populate with fake data, just ensure that connection works).

Key response:

> Open Requests excludes your own orders and shows only other users’ unassigned, unexpired requests. Your two requests can therefore appear in My Orders while Open Requests is empty.

Inspected ui/pages/OrdersPage.tsx, UI listOrders client, development/production
proxies, Order router/controller and listUserOrders query. Existing scope=open
excludes the signed-in requester, assigned orders and expired orders using database
time. The UI endpoint matches this route. No visibility rule was changed.

Changes: OrdersPage adds manual refresh, explains the existing visibility rule,
and aborts/discards outdated requests. listOrders accepts an optional abort signal.
The existing test file covers authenticated scope=open requests, returned order
mapping, empty results, HTTP failures and network failures. Test fixtures are
confined to tests; runtime results come from the API.

Additional affected file: ui/pages/OrdersPage.tsx, with attribution header.
README consolidated disclosure updated. Human review pending.
Live localhost:3003/health was unreachable, so live records remain unverified.
Follow-up validation: all 12 UI tests, TypeScript and the production build passed
using Node 22.22.0. A root-directory test invocation matched no test files; the
successful test run used the ui working directory. git diff --check passed.

## Follow-up: combined signup password validation

Exact user prompt (attachment showed one password error):

> For user creating password when creating an account, can you also resolve one where they are prompted one by one with their password issues but showing them separate lines of whatelse is necessary. For instanace "Password requires at least one number. Password requires at least one special character." so whatever their password is missing, show them at once.

Key response: Signup now collects every missing password requirement and renders
each on a separate list line when the form is submitted. Existing backend rules
were checked in user-service/src/api/dto/registerDto.ts: at least eight characters,
one uppercase letter, one number, and one special character. Confirmation mismatch
is also collected with other form errors.

Affected files: ui/pages/SignupPage.tsx and ui/tests/signupValidation.test.cjs.
No backend validation or password policy was changed. README disclosure updated.
Human review pending.
Signup follow-up verification: all 14 UI tests, TypeScript, production build and
whitespace checks passed using Node 22.22.0.

## Follow-up: minimum credit message

Exact user prompt (attachment showed a zero-credit request validation error):

> Change the text to "A minimum of 1 Credit is required to create an order."

Key response: CreateRequestPage displays that exact message for credit amounts
below one, disables submission, and guards the submit handler before making an API
request. Other backend errors retain their original meaning.
Affected file: ui/pages/CreateRequestPage.tsx. Human review pending.
Minimum-credit follow-up verification: UI TypeScript and git diff --check passed.

## Follow-up: credit picker boundaries

Exact user prompt (attachment showed zero balance and an offered credit):

> when this user has 0 credits and tries to create an order, it goes from 4 to 3 to 2 to 1, and then only goes to 0 if i press on the + sign. once it reaches 0 and i press on the minus sign credit offered goes from 0 to 1 credit for some reason

Key response: Both buttons now use the same limits. A zero balance initializes
the offer to zero and disables both buttons. Positive balances initialize to
the smaller of four and the balance, with a one-credit minimum. Balance updates
clamp the existing offer. Submission remains blocked below one credit or above
a known balance. Unknown balances retain the existing backend-check behavior.

Affected files: ui/pages/CreateRequestPage.tsx and ui/tests/creditOffer.test.cjs.
No backend or dependencies changed. Human review pending.
Credit-picker verification: all 16 UI tests, TypeScript, production build and
whitespace checks passed with Node 22.22.0. Tests were run from ui after an initial
root-directory invocation matched no test files.
