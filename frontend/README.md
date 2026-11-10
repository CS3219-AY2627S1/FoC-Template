<!--
Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09.
Scope: Credit history usage documentation for #65. Author review: Reviewed and approved by @phuc.
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
Scope: Documented how to run the frontend and how requests are routed.
Author review: Reviewed and approved by @t-leongchuan
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the Supplier API foundation and frontend test commands added for issue #28.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the responsive live member Supplier catalogue and detail routes added for
issue #29. Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the Supplier administrator routes and lifecycle/form boundaries for issue #30.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the isolated real-browser Supplier UI verification and D2 rehearsal for issue #31.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: documented
the expanded live validation, concurrency, and mobile administrator checks for
issue #34. Author review: Reviewed and approved by @ron.
Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: documented
the member errand pages, routes and the Order Service API calls.
Author review: Reviewed and approved by @mattis.
Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: documented
the N2 description box on the create page and ApiError's retryAfterSeconds.
Author review: Reviewed and approved by @mattis.
-->

# Frontend

React + TypeScript + Vite, Tailwind, React Router. D2 scope includes sign in,
create account, log out, session-expiry toasts, and live Supplier catalogue and
detail screens for authenticated members, plus administrator Supplier management.
Members can also post, browse, accept and run errands through Order Service (the
administrator dispute screens are not built yet).

## Running it

**Everything in Docker** (from the repository root):

```bash
docker compose up --build
# open http://localhost:8080   (FRONTEND_PORT in .env)
```

**Frontend with live reload** (backends running, e.g. via Docker Compose):

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

## Checking it

```bash
cd frontend
npm ci
npm test
npm run lint
npm run build
```

For the repeatable integrated browser check, install its Chromium once and run:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

Or run the dependency install, browser setup, lint, component tests, production build,
and live browser workflow together from anywhere in the repository:

```bash
./frontend/scripts/run-supplier-ui-demo.sh
```

`test:e2e` chooses available host ports and creates a uniquely named disposable
Compose project. It starts the real nginx frontend, User Service, Supplier Service,
and both PostgreSQL databases with non-secret test-only credentials. Chromium then
checks the MEMBER catalogue/detail journey and the ADMINISTRATOR
create/edit/archive/restore journey at desktop and mobile widths. It also exercises a
real backend 400 in the form, two stale editor tabs with 412 recovery, missing `If-Match`
428, mobile confirmations, and horizontal overflow assertions. The project and its
volumes are removed after success or failure.
Failure traces, screenshots, and videos are written under the ignored `test-results/`;
an HTML report is written under ignored `playwright-report/`.

This browser check complements, rather than replaces, the API-only verification:

```bash
cd supplier-service
npm run test:integration
```

That command remains usable with the frontend stopped and covers direct MEMBER 403s,
ETag races/preconditions, database state, repeatable seed behavior, and service outages.

For a presentation rehearsal, start the ordinary stack with `docker compose up --build`,
open `http://localhost:8080`, and follow the MEMBER then ADMINISTRATOR flow in
`supplier-service/SPEC.md` section 9.2. Use Archive as the approved delete behavior;
do not claim physical deletion or Order Service integration.

## How requests reach the services

The browser only talks to one origin: the Vite dev server in development, or nginx in
Docker. It forwards API calls:

| Browser calls | Goes to |
| --- | --- |
| `POST /api/v1/auth/login` | user-service `POST /auth/login` |
| `POST /api/v1/auth/register` | user-service `POST /auth/register` |
| `GET`/`PATCH /api/v1/whoami` | user-service `GET`/`PATCH /whoami` |
| `PUT /api/v1/users/{id}/role` | user-service `PUT /users/{id}/role` |
| `/api/v1/suppliers...` | supplier-service (same path) |
| `/api/v1/errands...` | order-service `/errands...` |
| `/api/v1/admin/errands...` | order-service `/admin/errands...` (no screens yet) |
| `/assets/suppliers/...` | supplier-service (same path) |

`/auth/verify` is not exposed. Rules live in `vite.config.ts` and `nginx.conf`; keep them in sync.

## Where things are

| Path | What it does |
| --- | --- |
| `src/api/client.ts` | `apiRequest()`: every backend call. Adds the login token and turns error replies into `ApiError` |
| `src/api/supplierApi.ts` | Typed Supplier list/detail/mutation calls, including ETag handling |
| `src/auth/tokenStorage.ts` | The only place the token is stored (sessionStorage) |
| `src/auth/AuthProvider.tsx` | Who is logged in, login/logout, expiry notices |
| `src/components/RequireAuth.tsx` | Wrap a page in `<RequireAuth>` to make it members-only |
| `src/suppliers/types.ts` | Supplier API models and controlled values |
| `src/suppliers/presentation.ts` | Shared category and typical-hours formatting |
| `src/suppliers/SupplierListPage.tsx` | URL-backed live search, filters, sorting, pagination, loading, empty and retry states |
| `src/suppliers/SupplierDetailPage.tsx` | Live Supplier detail, coordinates, typical hours and image fallback |
| `src/suppliers/admin/SupplierAdminPage.tsx` | Administrator ACTIVE/ARCHIVED management, archive and restore |
| `src/suppliers/admin/SupplierFormPage.tsx` | Metadata-backed create/edit and stale-ETag recovery |
| `src/api/errandApi.ts` | Typed Order Service calls: open list, my errands, detail, create, and the member actions |
| `src/auth/tokenSubject.ts` | Reads the account id (`sub`) from the token, for display only (see below) |
| `src/errands/types.ts` | Errand API models and the Order Service limits |
| `src/errands/presentation.ts` | State labels, which actions each party may take in each state, guidance and history wording |
| `src/errands/errandFormModel.ts` | Create-errand form checks, keyed by the server's field names |
| `src/errands/OpenErrandsPage.tsx` | Other members' OPEN errands, paged through the URL, with Accept on each card |
| `src/errands/MyErrandsPage.tsx` | Your errands as requester or courier, with a state filter |
| `src/errands/CreateErrandPage.tsx` | Post an errand: supplier search, items, drop-off, notes, credits, deadlines |
| `src/errands/DescribeErrand.tsx` | N2: the "Describe your errand" box above the create form (status check, counter, fill, failure and rate-limit messages) |
| `src/errands/ErrandDetailPage.tsx` | Errand detail, actions with confirmations, deadlines and history; polls while credits are reserved |
| `src/App.tsx` | URL → page table |

Authenticated users land on `/suppliers`; `/suppliers/:id` shows detail. Catalogue
query state stays in the URL so refresh and browser navigation preserve it. The UI
gets building labels from the authenticated Supplier metadata endpoint and reads all
catalogue records from live Supplier APIs.

Administrator routes are `/suppliers/admin`, `/suppliers/new`, and
`/suppliers/:id/edit`. Forms intentionally do not accept `imagePath`, `status`, `version`,
or timestamps because those fields are server-owned. Archive retains the Supplier record
and ID; there is no physical-delete control. Conditional writes use the ETags retained by
`src/api/supplierApi.ts`. The shared client attaches the token and logs the user out after
an authenticated 401.

### Errand pages

Member routes are `/errands` (open errands), `/errands/mine` (`?as=courier` for the ones you
deliver, `&state=` to filter), `/errands/new` (`?supplierId=` preselects a supplier; the Supplier
detail page links here) and `/errands/:id`. The top bar links to all of them.

- **Who you are in an errand.** `/whoami` has no account id and errands name people only by id,
  so the pages read the token's `sub` claim (as `tokenExpiry.ts` reads `exp`). It only decides
  which buttons to show; Order Service checks the party on every action. No endpoint resolves
  other users' names, so they appear as "Requester", "Courier" or "Another member".
- **Actions** follow the Order Service transition table: a non-requester may accept an OPEN
  errand; the courier may pick up or withdraw (ACCEPTED) and deliver (PICKED_UP); the requester
  may cancel (OPEN, ACCEPTED) and confirm or report a problem (DELIVERED). Each asks for
  confirmation. A 409 (lost accept race, repeated step, passed deadline) is explained and the
  errand is re-read so the page shows its real state.
- **Accepting from the board.** Each open-errand card has an Accept button with the same
  confirmation as the detail page. When the accept succeeds, or fails because the errand is no
  longer available (lost race, cancelled, expired, deadline passed), the card is dropped at once
  and the page of results is reloaded; other failures (e.g. 503) leave it listed.
- Cards show the total item quantity ("3 items" for 2 × latte and 1 croissant).
- **Posting** answers 202 with the errand in `PENDING_RESERVATION`. The detail page re-reads it
  every 2 seconds until Credit Service opens or declines it, and explains a decline by its
  reason code. The form checks the same limits as `order-service/src/domain/validation.ts` and
  shows the server's 400 `details` next to the matching fields.
- Deadlines are entered in the browser's time zone and sent as UTC ISO timestamps.
<!-- AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
Scope: Credit frontend usage documentation for #65. Author review: Reviewed and approved by @phuc. -->

### Credit transactions

Open **My credits** in the main navigation (`/credits`). This protected page calls
`GET /api/v1/me/credit/transactions` using the shared authenticated client.
It shows all six ledger types, transaction/errand/reservation references, and signed
available/reserved credit changes. A compact block beside the user details in the shared
top bar stacks Reserved above Available, using `GET /api/v1/me/credit`
independently of history filters and pagination. Refresh on the Credit page reloads
the balance and history. If the balance is unavailable or the account is still
being created, the header shows unknown amounts and a compact Retry control.

The optional From/To dates include both selected calendar days in Singapore time
(UTC+08:00). The frontend converts the inclusive end date to the following midnight
for the API's exclusive `to` timestamp. Filters and pagination survive refresh and
browser back/forward through `/credits?from=YYYY-MM-DD&to=YYYY-MM-DD&page=0&size=20`.
Applying dates or changing the selected page size resets the page after Apply filters.
Page sizes are 20, 50 and 100. Clear filters restores all history and the default size.

The page validates dates before requesting data, cancels superseded requests,
and supports loading, empty, out-of-range, failure/retry and refresh states.
Authenticated 401 responses use the existing global logout handler.

Focused tests cover date boundaries, query/auth serialization, filtering, paging,
request races, error recovery, and route protection. `e2e/credit-ui.spec.ts` adds a
live User/Kafka/Credit/nginx browser journey to the existing disposable Compose test
runner; it also checks mobile overflow and captures desktop/mobile screenshots.
- **Filling the form from a description (N2).** `/errands/new` opens with a "Describe your
  errand" box. On load it calls `GET /api/v1/errands/extract/status`; if the feature is
  unavailable, or that call fails, the box says so and the form works as before. "Fill in the
  form" sends up to 1000 characters to `POST /api/v1/errands/extract`; only fields that come
  back with a value are filled, returned items replace the item rows (a missing quantity shows
  1), a field the requester edits while the request runs keeps their edit, and each filled field
  shows "From your description" until it is edited. Nothing is submitted automatically. Any
  failure shows one message; a 429 shows a countdown from `Retry-After`, read through the
  shared client's `ApiError.retryAfterSeconds`.
