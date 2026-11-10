# FoC Web Client

The React, Vite, and TypeScript client uses same-origin `/v1/` requests for
User/Order/Credit/Chat Services and `/api/v1/` for Supplier Service. The APIs own authentication
and authorization decisions. The client does not connect to any service database.

## Local development

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Vite listens on port 5173. It proxies `/v1/chat` HTTP and WebSocket requests to
Chat on port 8004, Order paths under `/v1/` to port 8002,
wallet paths to Credit on port 8003,
other `/v1/` paths to User Service on port 8000, and Supplier API requests to
Supplier Service on port 8001. Start the required services
and their local databases using the [root setup guide](../README.md) for the
complete UI. Sign in before opening Supplier pages.

Enable Chat with the root Compose `chat` profile described in the root guide.
Use `ws://localhost:5173/v1/chat/ws` in Vite development and
`ws://localhost:3000/v1/chat/ws` with Docker. Both proxies preserve the path,
query, bearer/correlation headers and browser Origin. Chat still requires its
authentication frame within five seconds of connecting. The root profile's
allow-list includes both browser ports; native/service-local Chat uses
`ALLOWED_ORIGINS` from its own settings. Nginx resolves Chat only on requests,
so the base website starts when the optional Chat profile is disabled.
Open `/messages` after signing in. Username search opens a private conversation directly;
`/messages/:conversationId` shows paginated history, live sends, explicit retry and
block controls. The browser handles session refresh/reconnection, duplicate-safe optimistic
messages, sequence catch-up and focused/visible read acknowledgements. Mobile uses a
single-pane flow with back navigation. See [Chat UI verification](../chat-service/docs/ui-verification.md)
for FR/NFR mapping, focus/read rules and real-service browser test commands.

| Route | Audience | Purpose |
| --- | --- | --- |
| `/suppliers` and `/suppliers/:id` | Any signed-in user | Browse active suppliers, search names/areas/pickup locations, filter categories, sort, paginate, and view details. |
| `/admin/suppliers` and `/admin/suppliers/:id` | Admin or Super Admin | Browse active and inactive suppliers and view full details. |
| `/admin/suppliers/new` and `/admin/suppliers/:id/edit` | Admin or Super Admin | Create and edit supplier records. |

Management pages include activation and deactivation. Deactivate calls the
current Supplier Service `DELETE`, which returns `DEACTIVATED` and retains the
row. The API checks current permissions again for every management request.

See [Supplier UI traceability](SUPPLIER_UI.md) for backlog and Milestone D2
coverage and remaining service-level requirements.

## Order create/browse UI

Signed-in users can open `/orders` (available errands), `/orders/new` (create),
`/orders/mine` (requester/courier lists) and `/orders/:orderId` (detail and
participant-only history). The UI reuses the current shared workspace shell,
navigation, design tokens and `WorkspaceTopbar`. The older supplied Figma screens
are layout references, not a new visual system or feature specification.

- Active suppliers use one searchable dropdown backed by Supplier Service, with
  more results loaded inside the dropdown as you scroll. Open-order
  lists support the backend's supplier filter and newest-first pagination only.
- Dates entered/displayed by Order UI use Singapore time (UTC+08:00), irrespective
  of the device timezone. The API receives offset-aware UTC timestamps.
- Credit rewards are whole numbers. No balance is fabricated: successful creation
  still requires the real Credit integration. With Credit unconfigured, expect
  `CREDIT_UNAVAILABLE`, not an OPEN errand.
- A 202 response is pending. Progress is checked every five seconds while this
  page is open; `READY_TO_FINALIZE` requires clicking **Finish creating errand**,
  using the current authenticated session and the original body/key.
- A request and its idempotency key are saved in per-user `sessionStorage` before
  POST. A lost response/reload reuses that same attempt. No tokens are stored
  there. Do not close/clear the tab or start a separate request while its result
  is unknown. Session storage is tab-local, not a cross-device recovery system;
  avoid entering sensitive information on a shared computer. Corrupted/unavailable
  storage blocks new submissions rather than silently forgetting a pending request.
- Once a courier is assigned, the requester and courier can use the message icon
  beside the errand title to create or reopen their private Chat conversation.
  Unassigned errands and nonparticipant assessment views do not show the icon.
  Chat must be running; failed opens stay on the errand with an error and allow
  another explicit attempt. Admins use the same participant rules in User mode.

### Running with Vite

Start the existing User/Supplier APIs and their databases, and Order's database
and API on port 8002 as described in `order-service/README.md`. Run `npm run dev`
here and open `http://localhost:5173/orders`. Vite sends only Order paths to 8002,
User paths to 8000, and Supplier paths to 8001. Run the Order recovery worker for
pending creation reconciliation. Changing UI code reloads the development page.

### Running with Docker

The root Compose file has an optional `order` profile so existing User/Supplier
startup remains usable without Order configuration. For a fresh setup, copy
`order-service/.env.docker.example` to the ignored `.env.docker` and populate only
Order's own database connection. **Do not overwrite an existing local file.**
The database hostname from Docker is `host.docker.internal`; Compose overrides
User/Supplier origins with container DNS. Keep Credit settings blank until ready.

Start the local Supabase stacks and apply reviewed Order migrations first
(see Order README; do not reset an existing populated database). Then, from the
repository root:

```sh
docker compose --env-file user-service/.env --profile order up --build -d
```

Open `http://localhost:3000/orders`. This starts the website, Order API and its
recovery worker alongside the existing services. Nginx routes Order paths only;
it makes no authentication or role decisions. A standalone Order process/container
already using port 8002 must be stopped before starting the Compose Order API.
API readiness does not prove the worker is healthy: inspect `order-recovery`
status/logs as well. No database migration runs automatically on startup.

### UI checks and mocked previews

`npm run test:e2e -- orders.spec.ts --headed` shows the Order browser scenarios
with **test-only mocked API responses** (including successful creation, unavailable
Credit, pending/retry and closed attempts). They are UI previews/tests, not real
reservations or proof of Order/Credit integration. There is no production or
development runtime fake-credit switch. These tests need Playwright Chromium but
not Docker; the default test setup starts Vite when no E2E_BASE_URL is supplied.

Order advances M3F1/M3F2 and participant history in M3F7 at the UI layer. Automated
browser checks do not establish the M5 usability-study or NFR load targets. Docker
runtime/live dependency verification remains separate from these mock-backed tests.

## Checks

```sh
npm run build
npm test
npm run test:e2e
```

The browser suite covers the supported 375×812, 768×1024, 1024×768, and 1440×1024 layouts.

## Container

From `foc/user-service/`, start the integrated stack with:

```sh
docker compose up --build
```

The web client is served at `http://localhost:3000`. Nginx preserves both API
path prefixes and falls back to the SPA for client routes. For the integrated
User and Supplier stack, use the root [`compose.yaml`](../compose.yaml) as
described in the repository README.
