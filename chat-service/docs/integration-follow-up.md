# External integration follow-up

The backend was initially implemented within `chat-service/**`. The latest main merge
includes User Service's Chat interfaces and the Chat CI job. Root Compose and the
Vite/Nginx browser proxies now include Chat. Phase 6 adds the Chat UI; production deployment work remains.
Actual User Service endpoints were exercised over HTTP independently of contract-fake tests.

## User Service

The User Service interfaces are integrated. Match the dedicated
`CHAT_SERVICE_SHARED_SECRET` through secret management and configure `USER_SERVICE_BASE_URL`
to the direct internal User Service address. No Supplier secret fallback, signing private key,
User Service database URL or Supabase client key belongs in Chat Service. Public JWKS use
`/.well-known/jwks.json`, issuer `foc-user-service` and audience `foc-services` by default.

Search: `GET /v1/internal/chat/users` with service header and caller bearer.
Batch: `POST /v1/internal/chat/participants` with service header only and 1–100 user IDs.
Use the worker's `user-service/docs/chat-integration-contract.md` as the authoritative contract.

## Compose and secrets

Root Compose has optional `chat-service` and `chat-outbox` services with `profiles: [chat]`.
Run `docker compose --env-file user-service/.env --profile chat up --build -d` from the root.
Chat's own `chat-service/.env` supplies both processes. Each command selects its Docker
database/broker URLs at container startup, avoiding the root User environment's overlapping
variable names. A missing Chat env file does not prevent base-profile startup; enabling
Chat requires its own Docker URLs and matching service secret. User's publisher is separate.

The API publishes loopback port 8004 (container port 8003) and joins edge, user-internal and support networks.
The publisher joins support and can restart independently. Both use the existing broker's
`foc.chat.events` topic exchange and per-API exclusive queues. The service-local launcher
remains available on the existing `foc-dev_*` networks; stop its API/publisher before
switching to root Compose so host port 8004 and the Chat service DNS alias have a single owner.

Production migration tooling provisions a dedicated Chat Service Supabase project and a
restricted login inheriting `chat_runtime`. Migrations contain no passwords and execute only
via the deployment/migration workflow. Use TLS/database and broker secret policy appropriate
to deployment; never run the local test login in production. Browser configuration receives
only application routes and no infrastructure credentials.

## Proxy routing

Vite routes the bounded `/v1/chat` prefix before generic `/v1` to `http://127.0.0.1:8004`
with `ws: true`. Nginx dynamically resolves `chat-service:8003`, preserving path/query,
HTTP/1.1 WebSocket upgrades, bearer/correlation headers and browser Origin. Its timeout
is 60 seconds; clients should send keepalive pings every 20 seconds. Dynamic DNS permits
website startup with the optional Chat profile disabled. Lookalike paths such as
`/v1/chat-other` remain under generic User Service handling.

Root Chat permits exact browser origins on localhost/127.0.0.1 ports 3000 and 5173.
Set Compose's `CHAT_ALLOWED_ORIGINS` to a JSON array before startup to override that list.
Native/service-local startup uses `ALLOWED_ORIGINS` from Chat settings. Configure the
deployment allow-list to actual deployed browser origins; never rewrite the Origin in a proxy.

## CI

The existing `validate-chat` job detects Chat changes and runs Python 3.13 lint/format,
unit tests, isolated PostgreSQL/RabbitMQ tests including guarded restarts, and non-root
API/publisher container smoke. Its User identity dependency is a test-only HTTP fake.
The CLI is pinned in Chat's `package.json` and lockfile: install with `npm ci`, then
use `npx supabase` from `chat-service` for local and CI database commands.

Remaining CI integration: run actual User Service with disposable accounts alongside Chat
and exercise HTTP/JWKS, search, participant updates and authenticated delivery. The existing
`scripts.verify_user_service` and User's disposable contract demo are reusable building blocks.
Never reset a shared User database or print/persist credentials in test reports.

Do not run database tests in parallel against the same disposable state or restart resources
used by other jobs. The test suite uses unique UUID fixtures rather than truncating tables.

## Phase 6 UI and acceptance

The protected `/messages` and `/messages/:conversationId` screens are implemented in
`web-client`. They reuse WorkspaceShell, WorkspaceTopbar and the existing design tokens.
Live username search opens/creates directly, conversation rows use current display names
and smaller usernames, and tombstones retain history without a username or enabled composer.

The browser implements first-frame socket authentication, existing-session refresh,
keepalive/reconnect, optimistic deduplication, explicit retries, read acknowledgements and
paginated catch-up. Selected + visible + focused gates automatic reads; hidden/unfocused
threads keep persisted unread state. `sync.required` reloads summaries and visited history
without requiring the socket to close. `conversation.updated` remains reserved; metadata
refreshes after message/read/block events, recovery, focus and explicit refresh.

See [UI verification](ui-verification.md) for the complete FR/NFR mapping, browser fixtures,
component focus/visibility checks, real User/Chat/PostgreSQL/RabbitMQ browser acceptance,
responsive screenshots and a manual two-browser procedure. Exact Figma-frame comparison
requires authenticated access; the implemented shell and tokens follow the existing FoC UI.
Sprint 4 errand context and formal scale/p95 criteria remain outside this work.
