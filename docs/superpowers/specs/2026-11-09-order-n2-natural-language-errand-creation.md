<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
Scope: transcribed the author's N2 decisions word for word, recorded the facts they rest on (read from the code and from
       Anthropic's structured-outputs documentation), drafted the details the author asked Claude to propose, and listed
       open questions. No requirement, interface or trade-off was decided by the AI.
Author review: Pending review by @mattis.
-->

# Order Service: N2 Natural Language Errand Creation

A requester types their errand in their own words; Order Service asks Claude Haiku 5.5 to pull out the create-errand
fields; the frontend fills the existing create form with them; the requester reviews, edits and submits as usual.

Branch `feat/order-nl-errand-creation`, stacked on `feat/order-member-frontend` (the create form lives there). Spec
first; no code until the author approves it.

Every decision below is @mattis's, quoted word for word from the request of 2026-11-09 (round 1) and the reply to the
open questions (round 2, section 7), the acceptance of section 8 (round 3, section 9), and the answers to the two questions raised after implementation (round 4, section 10). Section 3 holds the details the author asked Claude to propose; the author
approved them in round 2, with the round 2 changes applied. Section 8 holds the remaining answers, all accepted.

## 1. Facts the decisions rest on

Read from the code on `feat/order-member-frontend` (9e90c6c):

- **Gateway.** `frontend/nginx.conf` (`location /api/v1/errands`) and `frontend/vite.config.ts` (`'^/api/v1/errands'`)
  already forward every `/api/v1/errands...` path to Order with the prefix stripped, so `/api/v1/errands/extract` and
  `/api/v1/errands/extract/status` need no gateway change. `nginx.conf` sets no `proxy_read_timeout`, so nginx's
  default of 60 s applies (see question Q1).
- **Order's request pipeline** (`src/http/app.ts`): `authenticate` runs before `express.json()`, so a caller with no
  valid session gets `401 UNAUTHENTICATED` whatever the body. `express.json()` uses the default 100 kB limit (413
  `PAYLOAD_TOO_LARGE`); bad JSON is `400 VALIDATION_ERROR` from `errorHandler`.
- **Roles** (`src/http/auth.ts`): `requireRole("ADMINISTRATOR")` exists; there is no member-only check (none is needed after round 2). Order's 403 body
  is `{ "error": "FORBIDDEN", "message": "You do not have permission to do this" }`.
- **Route order** (`src/http/routes.ts`): `/errands/open` and `/errands/mine` are registered before `/errands/:id`
  for the same reason the new routes must be.
- **Supplier Service list** (`supplier-service/src/suppliers/...`): `GET /api/v1/suppliers?page&size` needs a session,
  lists `ACTIVE` suppliers when `status` is omitted, allows `size` up to 100, and returns
  `{ items, page, size, totalItems, totalPages }`. Each item has `id`, `name`, `categories`, `buildingCode`,
  `buildingLabel`, `floor`, `locationDescription` (plus fields not needed here). A member asking for `ARCHIVED` gets 403.
- **Order's Supplier adapter** (`src/adapters/supplierDirectory.ts`, `upstream.ts`): only `findSupplier(id,
  authorization)` exists. It forwards the caller's `Authorization`, uses `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS`, makes no
  retries, and maps Supplier `401` to `401 UNAUTHENTICATED`, `5xx`/timeout/network to `UpstreamUnavailableError`
  (`503 SERVICE_UNAVAILABLE`), and any other status or body to `UpstreamContractError` (`500`). The stub
  (`STUB_SUPPLIERS`) has three suppliers with `id`, `name`, `buildingCode`, `locationDescription` and no categories or
  building label.
- **Settings** (`src/config.ts`, `compose.yaml`, `.env.example`): `config.ts` is the only reader of `process.env`. Mode
  variables go through `mode()`, which defaults to `stub` and refuses to start on an unknown value. Compose maps each
  `.env` name `ORDER_X` onto the service's `X`, e.g. `AUTH_MODE: ${ORDER_AUTH_MODE:-http}`,
  `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS: ${ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS:-2000}`. Timeouts end in `_MS`.
- **POST /errands rules** (`src/domain/validation.ts`): credits integer 1–1000; 1–20 items; item name 1–100 characters
  after trimming; quantity integer 1–99; drop-off 1–200 characters after trimming; notes at most 500; deadlines ISO 8601
  with an offset, in the future, `listing <= pickup <= delivery`.
- **Frontend.** `ApiError` (`frontend/src/api/client.ts`) keeps `status`, `code`, `message`, `details`,
  `fieldErrors`, `requestId`, `existingSupplierId` and `currentState`, but no response headers. The create form
  (`CreateErrandPage.tsx`, `errandFormModel.ts`) starts with one item row of quantity `1` and deadlines now + 1, 2 and
  3 hours rounded up to the quarter hour, held as `datetime-local` strings in the browser's time zone. The supplier
  picker looks up a preset `supplierId` with `getSupplier`.

From Anthropic's structured-outputs documentation (fetched 2026-11-09,
`platform.claude.com/docs/en/build-with-claude/structured-outputs`):

- JSON output is requested with `output_config: { format: { type: "json_schema", schema } }`. `claude-haiku-5-5` is
  a supported model. The TypeScript SDK's `jsonSchemaOutputFormat()` (`@anthropic-ai/sdk/helpers/json-schema`) takes a
  plain JSON schema with `messages.parse()`, so no Zod (no extra package).
- Supported: all basic types including `null`, type arrays / `anyOf` (each counts as a union-typed parameter, at most
  16 per request), `enum`, `required`, string `format: "date-time"`. `additionalProperties` must be `false`.
  **Not supported:** `minimum`/`maximum`, `minLength`/`maxLength`, array limits other than `minItems` 0 or 1. So the
  range checks can only be done by Order after the reply, which the decisions already require.
- A reply with `stop_reason: "refusal"` or `"max_tokens"` may not match the schema.
- The first use of a schema compiles a grammar (extra latency); compiled grammars are cached for 24 hours; a change to
  the schema's structure invalidates the cache.
- From the SDK reference: Claude Haiku 5.5 runs adaptive thinking by default with effort `medium`; thinking tokens
  count toward `max_tokens`. The SDK's `maxRetries` defaults to 2 and its `timeout` is in milliseconds.

## 2. The author's decisions (word for word)

**Scope**

> The next piece of work is our N2 nice-to-have, Natural Language Errand Creation, from the team's D1 backlog. A requester describes their errand in their own words, an LLM pulls out the details, and those details fill in the existing create-errand form. The requester then reviews, edits and submits it as normal.

**Branch**

> Create the branch feat/order-nl-errand-creation from feat/order-frontend, the member-frontend branch, which might still be called feat/order-member-frontend if the rename hasn't happened yet. It's stacked on that branch because the create form lives there, and I'll retarget it to main once the frontend PR merges.

(`feat/order-frontend` does not exist yet, so the branch was created from `feat/order-member-frontend` at 9e90c6c,
which matches `origin/feat/order-member-frontend`.)

**SDK**

> For the Anthropic SDK, use the official TypeScript SDK, @anthropic-ai/sdk, and follow Anthropic's current documentation for structured outputs instead of going from memory. Adding that one dependency to order-service is approved. No other new packages.

**What the requester sees**

> Here's what the requester sees. At the top of /errands/new there's a description box with a "Fill in the form" button above the existing form. The box takes at most 1000 characters, stops accepting text at that point, and shows a character counter. Clicking the button sends the description to the server, which tries to work out every create field: the Supplier, the items, the drop-off location, the credit amount, the notes, and the listing, pickup and delivery deadlines. Any field it can't work out comes back as null and stays blank. Filling only overwrites the fields that came back with a value, and anything else the requester has typed is left alone. Each field that got filled shows a small "From your description" label, which disappears as soon as the requester edits that field. While the request is running, the button says "Filling in…" and is disabled, the form stays editable, and there's no cancel. If the requester edits a field by hand while the request is running, their edit wins, even if the extraction later comes back with a value for that field. Nothing is ever submitted automatically.

> When the page loads, it calls the status endpoint. If the feature is unavailable, or the status call itself fails, the description box is shown as unavailable from the start, using one piece of text whatever the reason. Suggest that wording in the spec. There's no "demo mode" note when the stub is running. If an extraction fails, show one short message under the box saying we couldn't fill the form and they can fill it in themselves, and leave the form exactly as it was. The one exception is the rate limit: then show a specific message with a countdown in seconds, taken from the Retry-After header. The shared ApiError in client.ts doesn't keep response headers yet, so make a small, additive change for that, and the Supplier behaviour must stay exactly the same.

**Routes**

> There are two new routes in the Order Service, and both must be registered before /errands/:id so Express doesn't read them as an errand id. The gateway already forwards /api/v1/errands, so don't touch nginx.conf or vite.config.ts. The first is POST /errands/extract, for logged-in members only. Its body is { "description": string }. Unknown fields, a missing description, or one that's blank or only spaces get a 400 VALIDATION_ERROR, and so does one over 1000 characters. On success it returns 200 with exactly the field names of the POST /errands body: supplierId, items, dropoffLocation, notes, creditAmount, listingDeadline, pickupDeadline, deliveryDeadline. Any field it couldn't work out is null, and that includes items. An item whose name is clear but whose quantity wasn't stated keeps its name, with quantity null. The second route is GET /errands/extract/status, for any logged-in user. It always answers 200 with { available, reason }, where reason is null when the feature is available, "DISABLED" when the mode is off, and "NOT_CONFIGURED" when the mode is anthropic but there's no API key.

**Errors**

> The extraction errors use Order's usual { error, message } body. If the feature is off, the response is 503 EXTRACTION_UNAVAILABLE. If a member goes over the rate limit, it's 429 RATE_LIMITED with a Retry-After header in seconds. If the LLM call times out, errors, or gives back something unusable, it's 502 EXTRACTION_FAILED. A refusal or a cut-off reply counts as unusable. If the Supplier list can't be fetched, it's 503 SERVICE_UNAVAILABLE, the same as Order's existing outage response. An administrator gets 403 FORBIDDEN.

**Extraction**

> Here's how the extraction works. On every call, Order Service fetches the active Suppliers fresh from Supplier Service, passing on the caller's Authorization header, and gets every page if there are more than one. If that fails, the whole extraction fails with the 503 above and the LLM isn't called. It then makes one call to Claude Haiku 5.5 with a structured output schema shaped like the response. That call includes the description, each Supplier's id, name, building, location description and categories, and the current date and time in Singapore time. Nothing about the requester goes to Anthropic: no user id, no username, no email. The model has to pick a supplierId from the list it was sent, or none. An id that isn't in the list is treated as no match. Several plausible Suppliers, or none, also means no match. In those cases the Supplier stays null.

> For deadlines: if the text gives one time, only fill the deadline the wording clearly points to. Vague times like "tomorrow morning", times that are already past, and anything ambiguous stay null. All times are read in Singapore time and returned as ISO 8601 with an offset, the same format the create form uses. Make no retries, so set the SDK's maxRetries to 0. One attempt is allowed the configured timeout, which defaults to 60 seconds.

**Checking the reply**

> After the reply comes back, Order Service checks every value against the same rules POST /errands uses. Any value that fails becomes null. That covers credits outside 1 to 1000, item names outside 1 to 100 characters, quantities outside 1 to 99, more than 20 items, a drop-off location outside 1 to 200 characters, notes over 500 characters, and deadlines not in the future. If the deadlines that are left are out of order (listing, then pickup, then delivery), set all three to null. Treat the description purely as data. All of these checks are what keep a description that tries to instruct the model from getting a bad value through.

(Changed in round 2: administrators may use extraction too, so no 403, and the timeout defaults to 50 seconds.)

**Rate limit**

> Each member can make 3 extraction calls per minute, counted in memory in the Order Service process. A restart resets the count, and each replica keeps its own count, which is fine. Only calls that actually reach the LLM count, and they count whether they succeed or fail. Validation errors, the feature being off, a Supplier outage, and calls already over the limit don't count. In the spec, propose exactly how the window works and how Retry-After is calculated.

**Logging**

> Each call logs one JSON line in the same style as Order's other logs. It contains the user id, how long the call took, the outcome, which fields were filled, and the token counts. It must never contain the description text or the model's reply.

**Settings**

> There are four settings. ORDER_LLM_MODE can be anthropic, stub or off. Outside Compose it defaults to stub, and Compose sets anthropic. ORDER_LLM_API_KEY is the API key. It goes into .env.example with a blank value, Compose passes it through, and it must never be committed. In anthropic mode with no key, the feature is off. There's also a model setting that defaults to claude-haiku-5-5, and a timeout setting that defaults to 60 seconds. Name those two the same way the existing Order settings are named and put the names in the spec. Follow the existing pattern in config.ts and compose.yaml for how the ORDER_ names map onto the service's own variable names.

**Stub mode**

> Stub mode always returns the same fixed extraction, whatever the text says, and it still goes through the same validation. Put the exact fixed values in the spec. It should take its Supplier from the list it was given, so the value is valid with either Supplier mode. In stub mode, two magic words trigger the failure paths: a description containing "stub:fail" gives a 502, and one containing "stub:slow" waits until the timeout is reached. The unit tests use stub mode or a fake client injected in code, and nothing in the test suite calls the real API. Please don't run anything against the real Anthropic API without asking me first, because it costs money.

**Testing**

> Testing. On the backend, cover the following: validation and unknown fields; members against administrators against no login; the status endpoint in all three cases; Supplier matching, including an id that wasn't in the list; nulling out invalid values and deadlines that are out of order; the rate limit and its Retry-After, including that only calls reaching the LLM count; the stub's failure and timeout words; the 503 when the Supplier list can't be fetched; and that logs never contain the description. On the frontend, cover the following: the counter and the 1000-character cap; the unavailable state, including when the status call fails; filling only the fields that came back with a value; the labels disappearing on edit; a manual edit made during a request winning over the result; the general failure message; the rate-limit countdown; and the Retry-After change in client.ts, with Supplier behaviour unchanged.

**Docs and boundaries**

> For docs, add an N2 section to order-service/README.md in the same table style as the rest of that README. It should list the two endpoints, the settings, the error codes and the decisions above. Add the new settings to .env.example and compose.yaml. Don't add an ADR, don't change the root README's text about the feature, and don't touch CONTEXT.md.

> Please don't touch user-service, supplier-service, credit-service, nginx.conf or vite.config.ts, and don't touch any Supplier frontend files. Don't add admin screens, Playwright tests or CI changes, and don't push or open a PR.

## 3. Details the author asked Claude to propose

**Approved by the author in round 2** ("proposals in section 3 approved"), with the round 2 answers applied below.

### 3.1 Setting names

Following `AUTH_MODE: ${ORDER_AUTH_MODE:-http}` and `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS: ${ORDER_SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS:-2000}`:

| Service variable (read in `config.ts`) | `.env` name (mapped in `compose.yaml`) | Default outside Compose | Compose value |
|---|---|---|---|
| `LLM_MODE` | `ORDER_LLM_MODE` | `stub` | `${ORDER_LLM_MODE:-anthropic}` |
| `LLM_API_KEY` | `ORDER_LLM_API_KEY` | unset | `${ORDER_LLM_API_KEY:-}` (blank in `.env.example`) |
| `LLM_MODEL` | `ORDER_LLM_MODEL` | `claude-haiku-5-5` | `${ORDER_LLM_MODEL:-claude-haiku-5-5}` |
| `LLM_TIMEOUT_MS` | `ORDER_LLM_TIMEOUT_MS` | `50000` (round 2) | `${ORDER_LLM_TIMEOUT_MS:-50000}` |

`LLM_MODE` goes through the existing `mode()` helper, so an unknown value stops the service at startup, like the other
modes. `LLM_TIMEOUT_MS` goes through `positiveInteger()`. The key is passed to the SDK client explicitly, so the SDK's
own `ANTHROPIC_API_KEY` lookup is not used.

| `LLM_MODE` | `LLM_API_KEY` | Status response |
|---|---|---|
| `anthropic` | set | `{ "available": true, "reason": null }` |
| `anthropic` | unset or blank | `{ "available": false, "reason": "NOT_CONFIGURED" }` |
| `stub` | ignored | `{ "available": true, "reason": null }` |
| `off` | ignored | `{ "available": false, "reason": "DISABLED" }` |

### 3.2 Rate-limit window

A sliding window per member, held in a `Map<userId, number[]>` in the Order process:

- The window is the 60 seconds before now. The list for a member holds the start times (ms) of their calls that
  reached the LLM. Times older than 60 s are dropped whenever the list is read.
- A call may go ahead while the member has fewer than 3 times in the window.
- **Check before, record at the LLM.** The limit is checked after validation and the feature check and before the
  Supplier fetch, so a call already over the limit makes no Supplier request. It is checked again, and the start time
  recorded in the same synchronous step, immediately before the LLM call. Node runs that step without interleaving, so
  two concurrent calls can't both take the last slot. A call that passed the first check but lost the slot gets the
  same 429.
- A call is recorded when it is sent to the LLM, so it counts whether it then succeeds, fails or times out. Nothing is
  recorded for a 400, a 503 (feature off or Supplier outage) or a 429.
- Members with an empty list are removed from the map when their list is next read empty, so the map doesn't grow
  with members who stopped calling.

### 3.3 Retry-After

When a call is refused: `Retry-After = max(1, ceil((oldest + 60000 − now) / 1000))`, where `oldest` is the earliest
start time still in the member's window. That is the number of whole seconds until a slot frees, never 0. The 429 body is
`{ "error": "RATE_LIMITED", "message": "Too many extraction requests; try again in <n> seconds" }`, with the same
`<n>` as the header.

### 3.4 Order of checks for POST /errands/extract

1. `authenticate` (existing): no valid session → `401 UNAUTHENTICATED`. Members and administrators both go on (round 2).
2. Body: not exactly `{ description }`, not a string, blank or only spaces, or over 1000 characters →
   `400 VALIDATION_ERROR` with `details`.
3. Mode `off`, or `anthropic` with no key → `503 EXTRACTION_UNAVAILABLE`.
4. Rate limit (first check) → `429 RATE_LIMITED`.
5. Fetch every page of active Suppliers (`size=100`) with the caller's `Authorization` → `503 SERVICE_UNAVAILABLE` on
   an outage (see Q3 for other Supplier replies).
6. Rate limit (check and record) → `429 RATE_LIMITED`.
7. One LLM call (stub or Anthropic), `maxRetries: 0`, timeout `LLM_TIMEOUT_MS` → `502 EXTRACTION_FAILED` on timeout,
   API error, refusal, `max_tokens`, or a reply that isn't the schema.
8. Check every value (section 2, "Checking the reply", and round 2: an item whose name fails is dropped, and `items`
   becomes `null` only if none are left) → `200` with the eight fields.

### 3.5 Stub extraction (fixed values)

The same reply for every description that has no magic word, then the normal checks. Times are in Singapore time
(`+08:00`), computed when the call is made, so they are always in the future:

| Field | Stub value |
|---|---|
| `supplierId` | `id` of the first Supplier in the list it was given (Supplier Service's default order, or `STUB_SUPPLIERS[0]` in stub Supplier mode); `null` if the list is empty |
| `items` | `[{ "name": "Iced latte", "quantity": 2 }, { "name": "Croissant", "quantity": null }]` |
| `dropoffLocation` | `"COM1 level 2 study area"` |
| `notes` | `"Less ice, please"` |
| `creditAmount` | `15` |
| `listingDeadline` | now + 1 hour, rounded up to the next quarter hour, e.g. `"2026-11-09T15:15:00+08:00"` |
| `pickupDeadline` | `listingDeadline` + 1 hour |
| `deliveryDeadline` | `null` |

The second item and `deliveryDeadline` are `null` on purpose, so the stub shows the "left blank" paths.
`stub:fail` anywhere in the description → `502 EXTRACTION_FAILED` at once. `stub:slow` → the stub waits
`LLM_TIMEOUT_MS`, then the call fails as a timeout (`502 EXTRACTION_FAILED`). Stub token counts are logged as `0`.

### 3.6 Wording on the create page

| Situation | Text |
|---|---|
| Unavailable (any reason, or the status call failed) | "Filling in the form from a description isn't available right now. You can still fill in the form below." |
| Extraction failed (any error but the rate limit) | "We couldn't fill in the form from your description. Please fill it in yourself." |
| Rate limited | "You've reached the limit for filling in forms. Try again in <n> seconds." (`<n>` counts down once a second) |
| Label on a filled field | "From your description" |

### 3.7 Log line

One line per POST /errands/extract call, through Order's `log` helper (`src/log.ts`), event `errand_extraction`:

| Field | Value |
|---|---|
| `userId` | the caller's id |
| `durationMs` | from the request reaching the route to the response |
| `outcome` | `ok`, `invalid_request`, `unavailable`, `rate_limited`, `supplier_unavailable`, `timeout`, `llm_error`, `refused`, `truncated`, `unusable_reply` |
| `filledFields` | names of the fields returned non-null after the checks (empty unless `ok`) |
| `inputTokens`, `outputTokens` | from the reply's `usage`; `null` when the LLM wasn't reached; `0` in stub mode |

No description text, reply text, supplier list or model output is logged. A test checks the log output for the
description.

### 3.8 ApiError change

`ApiError` gains one optional, read-only field, `retryAfterSeconds?: number`, set by `toApiError` only when the response
has a `Retry-After` header holding whole seconds. Nothing else in `ApiError` or `apiRequest` changes, so Supplier
errors look exactly as before. A test pins that.

### 3.9 Schema sent to the model

A JSON schema with the eight fields, every one `required` and nullable (type arrays), `additionalProperties: false`;
`supplierId` is an `enum` of the ids sent plus `null` (round 2), so the schema changes when the catalogue does and its
grammar is recompiled on the first call after a change; the code check against the list stays. `items` is an array of
`{ name: string, quantity: integer | null }` or `null`; the three deadlines are `string | null` with
`format: "date-time"`. That is 9 union-typed parameters, under the documented limit of 16. Effort is `medium`
(round 2), set explicitly. The instructions go in the system prompt; the description goes in the user message inside a
clearly marked block, to be read as data. The Supplier list and the Singapore date and time are sent with it.

## 4. Planned changes (for review, not decisions)

| Area | Files |
|---|---|
| Order config and adapters | `src/config.ts` (four settings), `src/adapters/supplierDirectory.ts` (list active Suppliers, http and stub), new `src/adapters/errandExtractor.ts` (Anthropic and stub extractors behind one interface, so tests inject a fake) |
| Order domain and HTTP | new `src/domain/extraction.ts` (request checks, reply checks, deadline order), new `src/http/extractionRateLimit.ts`, `src/http/routes.ts` (two routes before `/errands/:id`), `src/http/app.ts`, `src/index.ts` (wiring) |
| Order tests | new `test/extraction.test.ts` (and helpers as needed); no test calls the real API |
| Order docs and config | `order-service/README.md` (N2 section), `order-service/package.json` + lockfile (`@anthropic-ai/sdk`), `compose.yaml`, `.env.example` |
| Frontend | `src/api/client.ts` (+ spec), `src/api/errandApi.ts` (+ spec), new `src/errands/DescribeErrand.tsx` (box, counter, status, messages), `src/errands/CreateErrandPage.tsx`, `src/errands/errandFormModel.ts` (filling, labels), their specs, `frontend/README.md`, `frontend/AI-DISCLOSURES.md` |
| Records | `ai/usage-log.md` |

## 5. Verification (from the request)

In `order-service`: `npm run typecheck`, and `npm test` against a throwaway PostgreSQL as the README describes. In
`frontend`: `npm run lint`, `npm test`, `npm run build`. Then, if possible, `docker compose up -d --build`. With no key
set, the box should show as unavailable. With `ORDER_LLM_MODE=stub`, the form should fill in, and `stub:fail` and
`stub:slow` should show the failure message. Nothing is sent to the real Anthropic API without the author's go-ahead.

## 6. Open questions — round 1

1. **Gateway timeout.** nginx's default `proxy_read_timeout` is 60 s and `nginx.conf` doesn't change it, while the
   LLM timeout defaulted to 60 s (plus the Supplier fetch before it). A call that reaches the timeout (including
   `stub:slow`) will usually be cut off by nginx first with a `504` and an HTML body, not Order's `502`. The frontend
   shows the general failure message either way. Keep 60 s and accept that, or lower the default `LLM_TIMEOUT_MS`
   (e.g. 30 s)? `nginx.conf` is off limits, so changing nginx isn't an option without your say-so.
   **Answered (round 2):** lower the default to 50 seconds.
2. **Administrators on /errands/new.** The status endpoint answers any logged-in user, but extraction is 403 for an
   administrator. Should an administrator see the box as available (a click gives the general failure message), see
   it as unavailable, or not see it at all?
   **Answered (round 2):** administrators may use extraction; it does not refuse them.
3. **Other Supplier list replies.** The decisions cover an outage (503). For the list call, should Order reuse its
   existing Supplier mapping (Supplier `401` → `401 UNAUTHENTICATED`; `400`/`403` or an unexpected body → `500`, logged)?
   And should each page get `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` (default 2000 ms), or should the whole fetch get one
   deadline?
4. **What "building" means.** Supplier gives `buildingCode`, `buildingLabel` and `floor`. Which go to the model? The
   stub Suppliers have only `buildingCode` and no categories. Send what they have (empty categories)?
5. **An item that fails its name check.** Drop just that item (and `null` the list only if none are left), or set the
   whole `items` list to `null`? And should an invalid quantity become `null` while the item is kept, as an unstated
   quantity does?
   **Answered in part (round 2):** drop an item whose name fails. The quantity part is still open (section 8).
6. **Filling the item rows.** When `items` comes back, does it replace all the item rows the form has? Is an item
   with `null` quantity shown with an empty quantity box (the form's default is `1`), so the requester must fill it in?
   Is there one "From your description" label for the item list, removed by an edit to any row?
   **Answered in part (round 2):** returned items replace the existing rows. The rest is in section 8.
7. **"Stays blank" and the form's defaults.** The form already holds default deadlines (now + 1, 2, 3 h) and quantity
   `1`. A `null` field leaves whatever is there, so a `null` deadline keeps its default rather than becoming blank.
   Is that what you want?
   **Answered (round 2):** yes, keep the default deadline or quantity.
8. **Model call settings not covered.** (a) Effort and `max_tokens`: Haiku 5.5 thinks by default (effort `medium`)
   and thinking counts toward `max_tokens`, and a cut-off reply is a failure. Which effort, and what `max_tokens`?
   (b) Should `supplierId` in the schema be a plain nullable string checked against the list in code, or an `enum` of
   the ids sent? An enum stops the model from naming an unknown id, but the schema then changes whenever the catalogue
   changes, which recompiles the grammar (extra latency on the first call after each change). The code check stays
   either way.
   **Answered (round 2):** medium effort; "anthropic defaults" for `max_tokens` (see section 8); an enum of the sent
   ids, or null.
9. **Stub mode and the rate limit.** Does a stub call count as "reaching the LLM"? If yes, the 429 path can be shown
   on the stack without a key.
10. **The countdown.** While the rate-limit countdown runs, is the "Fill in the form" button disabled until it ends?
11. **Counting characters.** Should "1000 characters" mean JavaScript string length (UTF-16 code units) on both
    sides? The textarea's `maxLength` counts this way, so the two would agree, though an emoji counts as 2.

## 7. Decisions — round 2

The author's reply to section 3 and section 6 (2026-11-09), word for word:

> proposals in section 3 approved, lower timeout to 50 seconds, we should allow adminstrators to have access to this feature extraction should not refuse them with a 403, drop item with bad name, returned items replace existing rows, and yes keep default deadline or quantity. medium effort, we can use anthropic defaults for max tokens, and we can use an enum of the sent ids, or null

What changes:

| Topic | Round 1 | Round 2 |
|---|---|---|
| `LLM_TIMEOUT_MS` default | 60000 | 50000 |
| Who may call `POST /errands/extract` | members only; administrators 403 | any logged-in user |
| Item whose name fails the check | open | dropped; `items` is `null` only when none are left |
| Returned items on the form | open | replace all existing item rows |
| A `null` field on the form | open | leaves the current value, including the default deadlines and quantity |
| Effort | open | `medium` |
| `supplierId` in the schema | open | `enum` of the sent ids, or `null` |

## 8. Suggested answers (accepted in round 3)

Each suggestion below was accepted by the author in round 3.

1. **`max_tokens`.** The Messages API has no default: every request must set `max_tokens`. Anthropic's guidance for
   a non-streaming request is about 16000. *Suggested:* 16000.
2. **An item's quantity on the form when it comes back `null`** (an item with a clear name and no stated quantity).
   Round 2 says to keep the default quantity. *Suggested:* the row shows the form's default, `1`. Also, an item whose
   quantity fails the 1–99 check: *suggested:* keep the item with quantity `null`, the same as an unstated quantity.
3. **The "From your description" label on items.** *Suggested:* one label on the "What to get" list, removed by an
   edit to any item row.
4. **The rate limit with administrators allowed.** *Suggested:* the limit is per user, whatever the role (3 per
   minute for administrators too). And Q9: *suggested:* a stub call counts as reaching the LLM, so the 429 path can be
   shown without a key.
5. **Supplier list details (Q3, Q4).** *Suggested:* reuse Order's existing Supplier mapping (Supplier `401` → `401
   UNAUTHENTICATED`; `400`/`403` or an unexpected body → `500`, logged), with `SUPPLIER_SERVICE_LOOKUP_TIMEOUT_MS` per
   page. Send `buildingLabel` and `floor` as the building, plus `buildingCode`; stub Suppliers send their
   `buildingCode` with empty categories.
6. **Countdown and character count (Q10, Q11).** *Suggested:* the button stays disabled until the countdown ends, and
   "1000 characters" means JavaScript string length on both sides.

## 9. Decisions — round 3

The author's reply to section 8 (2026-11-09), word for word:

> take the suggestions and go ahead

So `max_tokens` is 16000; a `null` or failing quantity keeps the item and the form shows quantity `1`; one label covers
the item list; the rate limit is 3 calls a minute per user of any role, and stub calls count; the Supplier list call
reuses Order's Supplier mapping and per-page timeout and sends `buildingLabel`, `floor` and `buildingCode`; the button
stays disabled during the countdown; and characters are counted as JavaScript string length. The spec is approved.

## 10. Decisions — round 4

Two questions came up during implementation: should the 20-item limit count the list the model sent, or the items
left after dropping those with a bad name; and is it fine that the status endpoint says "available" to a user who has
used up their 3 calls this minute. The author's reply (2026-11-09), word for word:

> count after dropping, status is fine

So items with a bad name are dropped first, and `items` is `null` only if more than 20, or none, are left. The status
endpoint stays as it is and never looks at the rate limit.
