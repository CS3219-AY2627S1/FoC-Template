<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
Scope: Refactoring and documentation improvements — write the "Notification Service" section covering the relay routes, live stream, UI, errors, and configuration (ai-20261111-001). The AI Use Summary section is a disclosure record.
Author review: Not confirmed (pending).
Details: frontend-service/ai/usage-log.md; ai-20261111-001
-->

# React NextJS Shadcn + TailwindCSS Template

Components installed in template:

- Shadcn component library
- TailWindCSS
- ESLint + Prettier

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
yarn install
```

Then, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Adding shadcn Components

This template is preconfigured for [shadcn](https://ui.shadcn.com). Add new components with:

```bash
npx shadcn@latest add <component>
```

Components are added to `components/ui`.

## Linting & Formatting

```bash
yarn lint          # ESLint
yarn format        # Prettier (writes changes)
yarn format:check  # Prettier (check only)
```

## Test Production Build

First build the project:

```bash
yarn build
```

Then serve the production build:

```bash
yarn start
```

## Running with Docker

Build the image (run from the `frontend-service` directory):

```bash
docker build -t frontend-service .
```

Run the container:

```bash
docker run -p 3000:3000 frontend-service
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

## Supplier Service

The store directory (`/request/store`) and the store preselected on the
request form (`/request?store=<supplier id>`) come from Supplier Service's
public reads: `GET /suppliers`, `GET /suppliers/{id}`, `GET /categories` and
`GET /areas`.

- **Server-side only** (`lib/supplier-service.ts`): Supplier Service sets no
  CORS headers, so it is called from Server Components and the
  `loadSuppliers` Server Action (`lib/supplier-actions.ts`), never from the
  browser. Set `SUPPLIER_SERVICE_URL` at runtime; Compose uses
  `http://supplier-service:8080`, and `yarn dev` defaults to
  `http://localhost:8081`, the port Compose publishes on the host.
- **Filtering**: the directory filters by area and category (any of the
  selected categories) and pages 20 suppliers at a time, matching what the
  service supports. There is no free-text search because the service has none.
- **Display** follows the service's suggested UI behaviour: missing building or
  floor labels are omitted, null hours show "Hours unknown", equal opening and
  closing times show "Open 24 hours", and all times are Asia/Singapore.
- **Images**: Supplier Service returns only an `image_key` filename. The
  browser loads it directly from `NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL`,
  defaulting to the seed images the CSV references
  (`raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images`);
  the frontend neither stores nor proxies image files. Suppliers without an
  image or with a failed image load show the existing fallback icon. `NEXT_PUBLIC_*` values are inlined at build time.
- **Unavailable service**: the frontend does not depend on Supplier Service to
  start (no Compose `depends_on`). If the service is down, unreachable, slow
  (5 s timeout) or returns an invalid response, supplier pages show an error
  message instead of failing, and the rest of the app works as normal.
  `docker compose up frontend-service` therefore does not start Supplier
  Service; use `docker compose up` for the full stack.

Supplier Service never seeds itself. To fill an empty local database, run from
the repository root:

```bash
docker compose --profile tools run --rm supplier-seed
```

## Order and Credit Services

The feed (`/home`), the request form (`/request`), the errand list (`/orders`)
and the credit page (`/credits`) are backed by Order Service and Credit
Service. Both require the User Service bearer token, which is read from the
`foc_session` cookie on the server and forwarded as `Authorization: Bearer`.

- **Server-side only** (`lib/order-service.ts`, `lib/credit-service.ts`):
  neither service sets CORS headers, and the token must stay out of the
  browser. Pages call them from Server Components; client components use the
  Server Actions in `lib/order-actions.ts` and `lib/credit-actions.ts`. Set
  `ORDER_SERVICE_URL` and `CREDIT_SERVICE_URL` at runtime; Compose uses
  `http://order-service:8080` and `http://credit-service:8080`, and `yarn dev`
  defaults to `http://localhost:8082` and `http://localhost:8083`.
- **Creating an errand**: `POST /orders` takes the supplier UUID from the store
  directory, an item description, a credit amount (1–1000) and a delivery
  location. The requester pins the spot on a Leaflet map with OpenStreetMap
  tiles (`components/orders/drop-off-map.tsx`), or picks one of the campus
  buildings in `lib/drop-off.ts`. Order Service only accepts coordinates
  inside the NUS campus box, so pins outside it are refused. A pin is named
  by OpenStreetMap's Nominatim reverse geocoder, through the
  `lookUpPlaceName` server action (`lib/place-name.ts`), which sets a
  User-Agent (override with `NOMINATIM_USER_AGENT`), sends at most one
  request per second and caches names. Until a name arrives, or when OSM has
  none, the label is the nearest building, or "Near <building>" beyond 40 m.
  The label is the "Drop-off Point" field itself, so the requester can
  rename the spot there, and choosing a suggested building moves the pin.
  Order Service requires non-blank details, so when
  the requester leaves them empty the label is sent instead, and the
  order cards hide details that only repeat the label. The form sends one `Idempotency-Key` per errand, so a retry
  cannot post it twice. There is no delivery-time option, because the service
  has none: an errand expires one hour after it is posted.
- **Credit reservation is asynchronous**: a new order is `PENDING_CREDIT` until
  Credit Service reserves the amount over Kafka. The confirmation screen polls
  the order until it is `OPEN` or `REJECTED` (for example
  `INSUFFICIENT_CREDIT`).
- **Feed**: `GET /orders/open` lists other users' open errands, newest first.
  Orders carry only ids, so the store is looked up in Supplier Service; there
  are no requester names, ratings or distances. Accepting an errand that
  another courier took first shows the `409` as a message.
- **Errand list**: `GET /orders?role=requester|courier` for each tab, with the
  actions each role is allowed: the requester can change the drop-off or
  cancel before pickup and confirm delivery after pickup; the courier marks
  the errand as picked up.
- **Credits**: `GET /credits/me` and `GET /credits/me/transactions`. A user has
  no credit account (Credit Service answers `404`) until their first errand,
  when the starting allocation is granted, so the balance shows "No credits
  yet". Until then the request form caps the offer at
  `INITIAL_CREDIT_ALLOCATION` (default `100`), which must match Credit
  Service's value; Compose passes the same variable to both. Balances change
  only through order events, and completing or cancelling an errand refreshes
  the sidebar balance, which can still trail the Kafka update by a moment. The
  frontend never writes to Credit Service. Administrator credit routes have no
  UI yet; see
  [TODO: Administrator UI](#todo-administrator-ui).
- **Paging ("Load more")**: the feed, both errand tabs and the credit history
  show 20 items at a time. Both services page by `limit`/`offset` only, and the
  lists are newest first, so an item that leaves the list between reads (for
  example an errand another courier accepts) would shift later pages up and
  make a plain offset read skip one. To avoid that, "Load more" re-reads the
  whole list from the start with a larger `limit` and replaces it
  (`lib/paging.ts`). Both services cap `limit` at 100, so past 100 items it
  falls back to offset paging, where an item can still be skipped until the
  next refresh. A cursor parameter on the list routes would remove the limit.
  Refresh always goes back to the first 20.
- **Store details are cached for 30 minutes**: orders only carry a supplier
  id, so every order card needs a Supplier Service lookup. Those lookups go
  through Next's data cache (`lib/order-views.ts`), so a renamed or deleted
  store can take up to 30 minutes to show on order cards. Next serves an
  expired entry once while it refreshes it in the background. A failed lookup
  is not cached. The store directory and the request form still read Supplier
  Service directly, so they are always current.
- **Errors**: a `401` shows "Your session has expired"; any other failure shows
  the service's message instead of failing the page. Server Actions turn
  service errors into `{ ok: false, message }` results (`lib/action-result.ts`)
  and rewrite the ones a user can act on, such as an errand another courier
  accepted first, so components never check HTTP status codes.

## Notification Service

Notifications about the user's own errands (opened, accepted, picked up,
completed, expired, rejected or cancelled) come from Notification Service.
See its [API reference](../notification-service/README.md#api-reference) for
who receives which notification.

- **Relay routes** (`app/api/notifications/`, `lib/notification-relay.ts`):
  the browser never calls Notification Service, which is published only on
  the host's loopback interface. Each route reads the `foc_session` cookie,
  sends it as `Authorization: Bearer`, and passes the upstream status and
  JSON body back unchanged. If the service can't be reached, the route
  answers `503` itself; a request with no cookie gets a `401` without calling
  the service. `proxy.ts` lets `/api/` requests through without a cookie so
  they get that JSON `401` rather than a redirect to the login page.

  | Relay route                           | Notification Service              | Forwards          |
  | ------------------------------------- | --------------------------------- | ----------------- |
  | `GET /api/notifications`              | `GET /notifications`              | `cursor`, `limit` |
  | `GET /api/notifications/unread-count` | `GET /notifications/unread-count` | —                 |
  | `POST /api/notifications/[id]/read`   | `POST /notifications/{id}/read`   | `[id]` as is      |
  | `POST /api/notifications/read-all`    | `POST /notifications/read-all`    | —                 |
  | `GET /api/notifications/stream`       | `GET /notifications/stream`       | `Last-Event-ID`   |

- **Live stream**: the stream route pipes the Server-Sent Events body through
  as it arrives, with `Cache-Control: no-cache, no-transform` (which also
  keeps Next's gzip from buffering it) and `X-Accel-Buffering: no`. It has no
  timeout of its own; Notification Service ends each stream after
  `SSE_MAX_LIFETIME_SECONDS` and `EventSource` reconnects with
  `Last-Event-ID`, which replays anything missed. Closing the page aborts the
  upstream request. A `401` or `503` before the stream starts comes back as
  JSON.
- **UI** (user view only): `NotificationProvider` in the main layout holds
  one `EventSource` for the whole app and counts unread notifications. The
  count is read when a fresh stream opens and whenever the tab becomes
  visible again, and each live event adds one. The bell shows the count as
  "Alerts" in the side navigation on desktop and in a slim bar above the page
  on mobile. `/notifications` lists the history newest first, 20 at a time
  with "Load more" (Notification Service pages by cursor, so nothing is
  skipped), shows new notifications at the top as they arrive, and has "Mark
  all read". Opening a notification marks it read and goes to the Orders tab
  for the user's role on that order. The admin view shows no bell and opens no
  stream, and `/notifications` redirects administrators in that view to the
  admin pages.
- **Errors**: a `401` from any relay route goes to `/auth/expired`, which logs
  the user out once User Service confirms the session ended. If the stream is
  refused before it starts (for example during a Notification Service
  outage), the provider retries every 15 seconds.
- **Configuration**: set `NOTIFICATION_SERVICE_URL` at runtime. Compose uses
  `http://notification-service:8080`; `yarn dev` defaults to
  `http://127.0.0.1:8084`. Notification Service isn't deployed to the
  Kubernetes manifests yet, so `deploy/k8s` doesn't set it.

## Authentication

Authentication goes through User Service, but the browser never talks to it
directly. Server Actions call User Service from the Next.js server and keep
its bearer token in an httpOnly `foc_session` cookie, so client JavaScript
never sees the token and User Service needs no CORS configuration.

- **User Service client** (`lib/user-service.ts`): typed `fetch` wrapper for
  the User Service endpoints the app uses. Its base URL comes from
  `USER_SERVICE_URL`, which is read at runtime on the server and defaults to
  `https://localhost:8080`. Compose sets it to `https://user-service:8080`.
  User Service only serves HTTPS with a certificate from the local internal
  CA (see [`docs/internal-https.md`](../docs/internal-https.md)), so Node
  must trust that CA through `NODE_EXTRA_CA_CERTS`. Compose mounts `ca.crt`
  into the container and sets it.
  It builds every request body field by field, so nothing extra from the
  browser reaches User Service. It and `lib/session.ts` import
  `server-only`, so importing either from a client component fails the build.
- **Server Actions** (`lib/auth-actions.ts`): `login`, `signup`,
  `logout`, `updateProfile` and `deactivateAccount`. They return
  `{ ok, error, fieldErrors }` instead of throwing, so forms can show User
  Service validation messages next to the matching field.
- **Session** (`lib/session.ts`): sets and clears the cookie. The cookie is
  `Secure` unless `COOKIE_SECURE=false`; Compose sets that because it serves
  plain http.
  `requireCurrentUser()` calls `GET /users/me` once per request. The `(main)`
  layout calls it, so every private page confirms the session is still valid.
  A 401 redirects to `/auth/expired`, which clears the cookie and returns to
  the login page. Any site can link there, so it first checks the token with
  User Service and keeps a session that is still valid. A User Service outage shows the error page and does not log
  the user out.
- **Route gating** (`proxy.ts`): only checks that the cookie is _present_.
  - No cookie + private route → redirect to `/` (login) with
    `?from=<original path>`; after login the form returns there (same-origin
    paths only).
  - Cookie present + public route (`/`, `/signup`) → redirect to `/home`.

| Page                | User Service endpoints                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `/` login           | `POST /login`                                                          |
| `/signup`           | `POST /users`, then `POST /login`                                      |
| `/profile`          | `GET /users/me`, `PATCH /users/me`, `DELETE /users/me`, `POST /logout` |
| every `(main)` page | `GET /users/me`                                                        |

Login uses the **NUS student number** (for example `A1234567B`) and
password. The frontend offers no way to reactivate a deactivated account;
only an administrator can restore it. A password change revokes every session, so `updateProfile` logs in
again with the new password to keep the current device signed in.

Not integrated yet: the admin endpoints (`/admin/users/{id}/suspend`,
`/unsuspend` and `/revoke-admin`) have no UI. `userService.getDisplayName()`
(`GET /users/{id}`) is ready for showing requester and courier names once the
feed and orders pages use Order Service data.

### Tests

```bash
yarn test
```

Vitest covers the User Service client, the auth Server Actions and the
`?from=` redirect check. CI runs it before the build.

### Running against User Service locally

With `yarn dev`, start User Service from the repo root. Compose publishes it
on `127.0.0.1:8080`. Generate the development certificates once first
(`.\scripts\generate-dev-tls.ps1`); User Service will not start without them:

```bash
docker compose up --build user-db user-migrate user-bootstrap user-service
```

Then start the dev server trusting the internal CA, from `frontend-service/`:

```bash
NODE_EXTRA_CA_CERTS=../certs/ca.crt yarn dev
```

Create an account at `/signup`, or set the `BOOTSTRAP_ADMIN_*` values in
`.env` to create an administrator. The full stack (`docker compose up`)
needs only the certificates: the frontend container reaches User Service over
the Compose network and trusts its CA through the mounted `ca.crt`.

Chrome and Firefox keep the `Secure` session cookie on `http://localhost`.
If you open the dev server another way, such as Safari or a LAN address,
start it with `COOKIE_SECURE=false yarn dev`.

## TODO: Administrator UI

Credit Service's administrator routes are implemented, but no page uses them.
They require `role=admin`:

| Route                                       | Purpose                                   |
| ------------------------------------------- | ----------------------------------------- |
| `GET /admin/credits/{user_id}`              | A user's balance                          |
| `GET /admin/credits/{user_id}/transactions` | A user's credit history                   |
| `POST /admin/credits/{user_id}/adjust`      | Add or remove credit with a reason        |
| `PUT /admin/credit-accounts/{user_id}`      | Create a missing account (safe to repeat) |

- **Blocker**: every route takes a `user_id`, and User Service has no way to
  list or search users, so an admin can't look one up. Add an admin-only
  search to User Service first (for example `GET /admin/users?query=…`);
  without it, the page can only ask for a pasted UUID.
- **Page**: an admin-only `/admin/credits` that searches for a user, shows
  their balance and history, and offers an adjust form. Credit Service accepts
  an amount from -1000 to 1000 (not 0) and a 5–500 character reason, and
  rejects any adjustment that would make available credit negative
  (`INVALID_CREDIT_ADJUSTMENT`).
- **Client**: add the admin calls to `lib/credit-service.ts` and Server
  Actions that check `user.role === 'admin'` before calling them.
- **Same page**: User Service's `/admin/users/{id}/suspend`, `/unsuspend` and
  `/revoke-admin` (see [Authentication](#authentication)) need the same user
  lookup.
- **Orders**: Order Service has no admin routes. An admin can read and cancel
  any order through `GET /orders/{id}` and `POST /orders/{id}/cancel`, even
  after pickup, but cannot list orders. Order Service needs a list-all route
  before an admin order page is worth building.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

See [supplier image setup](../data/images/README.md) for the Docker build argument,
local Nginx, browser-reachable URLs, and CloudFront configuration.

## AI Use Summary (Frontend Service)

### Notification Service integration (ai-20261111-001)

Claude Code (model: claude-opus-5-5) provided **Writing implementation code**,
**Boilerplate generation**, and **Refactoring and documentation improvements**
for the notification integration: the relay Route Handlers under
`app/api/notifications/` and `lib/notification-relay.ts`, the browser and
server helpers (`lib/notifications.ts`, `lib/notification-service.ts`), the
provider, bell and list components under `components/notifications/`, the
`/notifications` page, the changes to `app/(main)/layout.tsx`,
`components/app-nav.tsx` and `proxy.ts`, unit tests
(`lib/notification-relay.test.ts`, `lib/notifications.test.ts`), the
"Notification Service" section of this README, and `NOTIFICATION_SERVICE_URL`
in root `compose.yaml`. The relay follows the handover contract in the
Notification Service README, and the UI follows the user's answers on
placement, live behaviour, click target and the admin view. A planned
Kubernetes setting was dropped because Notification Service isn't deployed
there. The same exchange also explained a Docker Desktop engine error and when
notifications are sent, with no file changes.

Observed verification (agent only): Prettier, ESLint and `tsc --noEmit`
passed; `vitest run` passed 111 tests in 16 files; `next build` succeeded. A
local `next start` against a fake SSE upstream showed the stream relayed
unbuffered with its headers, `Last-Event-ID` and the token forwarded, the
upstream closed on client disconnect, and JSON 401s passed through. The real
Notification Service, Compose stack and browser UI were not exercised, because
the Docker Desktop engine was failing. No human test rerun is claimed.

Author review: Not confirmed (pending). See the
[usage record](ai/usage-log.md#ai-20261111-001). Original per-message
timestamps are unavailable; no redactions; no header exceptions.
