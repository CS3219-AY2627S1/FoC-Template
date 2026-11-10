# Backend implementation and verification

Initial backend verified 10–11 October 2026 (Asia/Singapore), on `feature/chat-service`
in the assigned `worktrees/foc-chat-service` checkout, initially within `chat-service/**`.
Shared startup/browser routing was added and verified on 13 October as recorded below.
This is not full Sprint 3 UI acceptance or Sprint 4 performance certification.

## Actual results

- **40 tests passed** after a clean Chat Service Supabase migration reset and re-provisioning
  the disposable restricted login. All database/broker tests ran, including opt-in restart tests.
  Final run: 54.36 seconds. One upstream Starlette TestClient/httpx deprecation warning remains;
  no failed or skipped tests in this run.
- **13 October regression check:** 25 unit cases passed after separating backend service-identity
  failures from caller-session failures; 19 database/broker cases were deliberately deselected.
  The four new cases cover a valid caller with a wrong service secret, non-session upstream
  401s for participant/JWKS calls, and preserved 401 handling for a rejected search caller.
- Ruff lint and format checks passed for `app`, `tests`, and `scripts`.
- Supabase CLI 2.120.0 clean local resets applied both timestamped migrations successfully.
  No User Service or production/cloud database was reset by this worker.
- Docker image builds with Python 3.13 and locked dependencies. Disposable API/publisher
  container smoke passes: non-root API, SQL readiness, broker subscription, independently running
  publisher and API restart. Runtime grants deny schema creation, message update/deletion and
  event-payload mutation. Only counters/read cursors/publisher state are mutable.
- Service-local optional-profile Compose configuration validates with safe example environment.
- Actual production HTTP-client integration passed against the User Service worker's disposable
  running app at loopback port 18080, backed by its isolated PostgreSQL on 18422. Public JWKS,
  current sessions, paginated search, current `Renamed` display name, tombstone redaction and
  explicit missing IDs were verified. Two Chat API processes plus the independent publisher
  exchanged a real authenticated message through RabbitMQ, repeated the send idempotently and
  retrieved recipient history. No User Service Python modules, database credentials or private
  keys were imported/copied. Demo credentials were read in memory and never printed or committed.
  The owner stopped the demo and removed its credential fixture after these checks finished.

Single real integration baseline sample (development host, not a load/p95 result): local
verification of two identities 670.45 ms; durable acceptance 82.90 ms; SQL outbox occurrence
to broker-confirmed publication 709.44 ms; sender-send to recipient live frame 800.04 ms;
authenticated history request 41.82 ms. Publisher polling/default startup/backlog affect these
samples. Do not extrapolate throughput, p95, latest-50 formal performance or 1,000 connections.

## Shared startup and browser routing — 13 October 2026

- Root Compose validates with the optional `chat` profile enabled. Without the profile,
  base startup validates even when Chat's `.env` is absent. Chat's Docker database URL
  remains separate from User Service's overlapping configuration variable.
- **84 frontend tests passed**, including HTTP route/query/header preservation, bounded
  Chat prefix matching, and bidirectional WebSocket frames through the actual Vite proxy
  with a test backend. Frontend lint and the production web/Chat image builds passed.
- An isolated Nginx container started without any Chat DNS entry: website and User routes
  returned 200, lookalike Chat paths stayed with User, and disabled Chat returned 502.
  The temporary containers and network were removed after the check.
- The normal development stack was switched from the service-local Chat containers to
  root `foc-dev-chat-service-1` and `foc-dev-chat-outbox-1`. Both run as uid 1000, use Chat's
  database on 17422, and connect to the existing shared RabbitMQ. The real User Service
  participant identity probe still returned 200. API/database/broker readiness passed.
- Existing message/outbox row counts survived the switch. User, Supplier and Chat `.env`
  files remained byte-for-byte unchanged. No database was reset or migrated.
- Subsequent local-setup simplification, requested on 13 October: Chat's two database
  URLs now use the local Supabase `postgres`/`postgres` defaults on 17422. Both root
  API/publisher database connections and readiness passed; all 124 existing messages
  were retained. Other Chat settings and User/Supplier `.env` files were unchanged.
  Restricted-role privilege checks above apply to the isolated test login; deployment
  still requires a dedicated restricted login. No database password or schema was changed.
- Live Nginx on port 3000 and temporary Vite on 5173 both forwarded Chat HTTP requests
  and completed WebSocket upgrades (101). Chat rejected invalid tokens with close 4401
  and invalid browser origins with HTTP 403; the proxies preserved Origin and HTTP
  correlation IDs. All four exact allowed local origins worked through Nginx.
- The live routing probes deliberately used invalid tokens, not new authenticated message
  sends. Earlier real authenticated delivery evidence remains recorded above. The temporary
  Vite process was stopped; the integrated Docker stack remains running. Final Chat UI,
  refresh/recovery/read handling and an actual User + Chat CI regression remain follow-up.

From the repository root, the unified command is:

```sh
docker compose --env-file user-service/.env --profile chat up --build -d
```

To run the manual checks through the browser proxy, use `CHAT_BASE_URL=http://localhost:3000`,
`CHAT_WS_URL=ws://localhost:3000/v1/chat/ws`, and `WS_ORIGIN=http://localhost:3000` in Postman.
Direct API checks on port 8004 (Credit uses host port 8003) remain supported. See the root and Chat READMEs for the one-time
stop of the service-local API/publisher when changing launchers and the local origin override.

## Phase 6 browser UI

The protected Messages UI and its Sprint 3 acceptance are documented in
[UI verification](ui-verification.md), including browser/component checks and the
opt-in test against real User Service, Chat, PostgreSQL and RabbitMQ. The results
above remain historical backend/routing evidence; no Sprint 4 compliance is claimed.

## Manual Postman walkthrough

This is the ordered manual test guide. There is no bundled Chat Postman collection; import
each `curl` block below as a separate HTTP request. In Postman choose **Import**, paste the
complete command, and import/open the request. The single-line commands are intended for
Postman's importer; `{{...}}` values are Postman environment variables, not PowerShell variables.
See [Postman's curl import instructions](https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/#import-and-convert-curl-commands).

**Sending messages is WebSocket-only.** There is no HTTP `POST .../messages` endpoint. The JSON
frames below go in a Postman **WebSocket** request's message editor, not the curl importer.
HTTP checks and WebSocket frames are deliberately interleaved in execution order. See
[Postman's WebSocket request guide](https://learning.postman.com/docs/use/send-requests/protocols/websocket/create-a-websocket-request/)
and [WebSocket variables](https://learning.postman.com/docs/use/send-requests/protocols/websocket/use-variables-with-websocket/).

### 0. Start the services and prepare local variables

- Have a migrated Chat database, running Chat API, independent `chat-outbox` publisher, and
  RabbitMQ. Normal development can use the shared RabbitMQ on 5672. Broker restart exercises
  below require the isolated test broker on 17425 instead, configured in both Chat processes.
- Run User Service with `/v1/internal/chat/users` and `/participants`; these interfaces
  are included in the latest main merged into this branch.
  Configure the same dedicated `CHAT_SERVICE_SHARED_SECRET` in both backends. The old temporary
  demo on 18080 has been removed; these examples use the normal User Service port 8000.
  No internal service secret or Supabase credential is needed in these public Postman requests.
- Start the API/publisher using [README.md](../README.md). This walkthrough does not start
  services, apply migrations or reset a database. The automated reproduction section follows it.
- Use three **fresh disposable active accounts**, A, B and C, for the exact sequence/unread
  counts below. A/B are chat partners; C is an outsider to A/B even if C has another chat with A.
  Use real email addresses accessible in your configured development mail inbox for OTPs.
  The optional final deletion step permanently tombstones B; use disposable accounts only.

If Chat health is ready but search/create returns 503, check the configured User Service
address, interface availability and matching backend service secret before diagnosing chat
storage. Readiness checks Chat's database and broker subscription, not the full identity path.
An empty conversation list can succeed without a participant lookup, even when the backend
service secret is wrong. Search always uses the service identity as well as the caller token.
If User Service accepts `/v1/users/me` but rejects its internal chat endpoint with
`INVALID_SERVICE_IDENTITY`, align `CHAT_SERVICE_SHARED_SECRET` in the two backends and recreate
the affected container(s); editing an env file alone does not update a running container.
Chat maps this backend identity failure to `503 SERVICE_NOT_READY`. A genuine rejected caller
session remains `401 INVALID_SESSION`. Usernames matching the caller are simply excluded from
search results; searching for yourself is not an authentication error.

Create and select a local Postman environment with these initial values. Keep passwords,
access tokens and OTPs local/secret; do not export or commit their populated values.

| Variable | Initial value / where to obtain it |
|---|---|
| `CHAT_BASE_URL` | `http://127.0.0.1:8004` (direct API; or `http://localhost:3000` through the shared proxy) |
| `USER_BASE_URL` | `http://127.0.0.1:8000` |
| `CHAT_WS_URL` | `ws://127.0.0.1:8004/v1/chat/ws` (or `ws://localhost:3000/v1/chat/ws`) |
| `WS_ORIGIN` | `http://localhost:3000`, which must be in Chat's `ALLOWED_ORIGINS` |
| `EMAIL_A`, `EMAIL_B`, `EMAIL_C` | Your three disposable account emails |
| `PASSWORD_A`, `PASSWORD_B`, `PASSWORD_C` | Their passwords; use valid User Service password policy |
| `USERNAME_A`, `USERNAME_B`, `USERNAME_C` | Distinct valid usernames with a shared fragment, e.g. `chatmanual_a_01`, `chatmanual_b_01`, `chatmanual_c_01`; change the suffix for a new run |
| `SEARCH_FRAGMENT` | A shared fragment such as `CHATMANUAL` (case-insensitive) |
| `OTP_A`, `OTP_B`, `OTP_C` | Needed only for optional registration, from the dev mail inbox |
| `TOKEN_A`, `TOKEN_B`, `TOKEN_C` | Fill from each login response's `accessToken` |
| `USER_A`, `USER_B`, `USER_C` | Fill from each `/v1/users/me` response's `userId` |
| `CONVERSATION_AB`, `CONVERSATION_AC` | Fill from conversation creation responses |
| `SEARCH_CURSOR`, `CONVERSATION_CURSOR` | Fill only from a non-null `nextCursor` when testing pagination |
| `BOUNDARY_SEQUENCE`, `LAST_SEEN_SEQUENCE` | Numeric values copied from history/accepted-message responses |

For stable retries and valid Unicode boundary messages, add this **once** to the **Pre-request**
script of the first health request, send that request, then remove/disable the script. Do not
regenerate accepted client IDs midway through a retry test. Each new walkthrough needs new IDs.
`pm.variables.replaceIn` resolves Postman's dynamic UUID value in the HTTP script.

```javascript
[
  "CLIENT_A1", "CLIENT_B1", "CLIENT_A2", "CLIENT_4095", "CLIENT_4096",
  "CLIENT_INVALID", "CLIENT_BLOCKED_A", "CLIENT_BLOCKED_B", "CLIENT_OFFLINE",
  "CLIENT_DELETED", "CLIENT_PUBLISHER_PAUSE", "CLIENT_BROKER_DOWN", "CLIENT_DATABASE_DOWN",
  "UNKNOWN_USER_ID", "UNKNOWN_CONVERSATION_ID"
].forEach(name => pm.environment.set(name, pm.variables.replaceIn("{{$guid}}")));
pm.environment.set("TEXT_4095", "😀".repeat(4095));
pm.environment.set("TEXT_4096", "😀".repeat(4096));
pm.environment.set("TEXT_4097", "😀".repeat(4097));
pm.environment.set("PADDED_4097", " " + "a".repeat(4096));
```

If using existing active accounts, skip registration and continue with login. Otherwise import
and send these three registrations; expect `202` and an OTP email for each:

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/registrations' --header 'Content-Type: application/json' --data-raw '{"username":"{{USERNAME_A}}","email":"{{EMAIL_A}}","password":"{{PASSWORD_A}}","displayName":"Manual A"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/registrations' --header 'Content-Type: application/json' --data-raw '{"username":"{{USERNAME_B}}","email":"{{EMAIL_B}}","password":"{{PASSWORD_B}}","displayName":"Manual B"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/registrations' --header 'Content-Type: application/json' --data-raw '{"username":"{{USERNAME_C}}","email":"{{EMAIL_C}}","password":"{{PASSWORD_C}}","displayName":"Manual C"}'
```

Copy each OTP into its matching variable, then verify the accounts; expect `201`:

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/email-verifications' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_A}}","otp":"{{OTP_A}}"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/email-verifications' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_B}}","otp":"{{OTP_B}}"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/email-verifications' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_C}}","otp":"{{OTP_C}}"}'
```

### 1. Health, public keys and unauthenticated rejection

Expect `200 {"status":"live"}`. This is also the first request on which to run the one-time
UUID/text initialization script above.

```curl
curl --request GET '{{CHAT_BASE_URL}}/health/live' --header 'X-Correlation-ID: postman-chat-live'
```

Expect `200`, `status: ready` and `delivery: ready`. `delivery: degraded` means the API can
persist messages but live broker subscription is unavailable. A missing database/schema is 503.

```curl
curl --request GET '{{CHAT_BASE_URL}}/health/ready'
```

Expect `200` and public RSA keys only:

```curl
curl --request GET '{{USER_BASE_URL}}/.well-known/jwks.json'
```

Both requests below must return `401 INVALID_SESSION`. Set **No Auth** for the first request
so Postman does not inherit collection-level authentication.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer invalid-test-token'
```

### 2. Log in A, B and C, then resolve immutable IDs

Expect `200` for each login. Copy `accessToken` into the matching `TOKEN_*` variable, without
the `Bearer ` prefix. Login cookies share a host, so use these explicit bearer tokens to keep
the identities separate; re-login an account when its token expires rather than using another
account's refresh cookie.
If the walkthrough outlasts a token's `expiresAt`, repeat that account's login, update its
`TOKEN_*` and reconnect/authenticate its sockets; the immutable user/conversation IDs stay the same.

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/sessions' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_A}}","password":"{{PASSWORD_A}}"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/sessions' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_B}}","password":"{{PASSWORD_B}}"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/sessions' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_C}}","password":"{{PASSWORD_C}}"}'
```

Expect `200` and `accountStatus: ACTIVE`. Copy each `userId` into `USER_A`, `USER_B` or `USER_C`,
and confirm the matching `USERNAME_*`. Usernames/display names are never conversation keys.

```curl
curl --request GET '{{USER_BASE_URL}}/v1/users/me' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{USER_BASE_URL}}/v1/users/me' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{USER_BASE_URL}}/v1/users/me' --header 'Authorization: Bearer {{TOKEN_C}}'
```

For convenience, a login request's Post-response script can save its token (change the suffix
for B/C); the corresponding `/me` request can likewise save its ID:

```javascript
// Login A request only:
if (pm.response.code === 200) pm.environment.set("TOKEN_A", pm.response.json().accessToken);
// Put this separate line on GET /me as A, not on the login request:
// if (pm.response.code === 200) pm.environment.set("USER_A", pm.response.json().userId);
```

### 3. Username-only search and continuation

Expect `200` with B/C matching the shared username fragment, A excluded, and only
`userId`/`username` in each item. Uppercase query input still matches lowercase usernames.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{SEARCH_FRAGMENT}}&limit=1' --header 'Authorization: Bearer {{TOKEN_A}}'
```

If `nextCursor` is non-null, copy it into `SEARCH_CURSOR`, send the following request, and
repeat with each new cursor until null. Keep the same query. Skip continuation if there is no
next page; do not send literal `null` or an empty cursor. The User cursor is URL-safe.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{SEARCH_FRAGMENT}}&limit=1&cursor={{SEARCH_CURSOR}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Expect B's ID in this exact-username search (substring matches may include other active users):

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{USERNAME_B}}&limit=100' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Invalid limit, empty query and malformed cursor each produce `422 VALIDATION_ERROR`:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{SEARCH_FRAGMENT}}&limit=101' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username=' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{SEARCH_FRAGMENT}}&cursor=not-a-valid-cursor' --header 'Authorization: Bearer {{TOKEN_A}}'
```

### 4. Create/reopen pairs, list conversations and deny outsiders

Create A/B; expect `200`. Save `conversationId` as `CONVERSATION_AB`. Fresh accounts yield an
empty conversation; repeated execution and the reverse B/A request return that same ID.

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B}}"}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_A}}"}'
```

Create a separate A/C conversation and save its ID as `CONVERSATION_AC`. This enables list
pagination and the cross-conversation retry-ID conflict test. It does not let C access A/B.

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_C}}"}'
```

Expect `200`, current counterpart identity, null `latestMessage`, `lastSequence: 0`,
`unreadCount: 0` and `messagingAvailable: true` for the fresh A/B pair:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

List A's chats; both A/B and A/C must be present:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations?limit=50' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Test list pagination. Copy the first response's non-null `nextCursor` to `CONVERSATION_CURSOR`.
UUID ordering determines which chat comes first; no recency ranking is promised.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations?limit=1' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations?limit=1&cursor={{CONVERSATION_CURSOR}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

C's metadata/history requests and A's unknown-ID lookup each return the same non-disclosing
`404 CONVERSATION_NOT_FOUND`, without A/B content:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_C}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_C}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{UNKNOWN_CONVERSATION_ID}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Self-conversation gives `422 INVALID_RECIPIENT`; a valid but unknown recipient UUID gives
`409 RECIPIENT_UNAVAILABLE`; a client-supplied sender field gives `422 VALIDATION_ERROR`:

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_A}}"}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{UNKNOWN_USER_ID}}"}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B}}","senderUserId":"{{USER_C}}"}'
```

### 5. Connect WebSockets, send text, retry and validate boundaries

Create separate Postman **New → WebSocket** requests named A, B and C, all with URL
`{{CHAT_WS_URL}}`. In **Headers**, set `Origin: {{WS_ORIGIN}}` before connecting. Do not add
tokens to the URL. Prepare the JSON authentication frame before clicking **Connect**, then
send it within **five seconds**. A bearer header alone is not WebSocket authentication.
Use the corresponding frame in each request; expect `ready` with the matching `userId`.

```json
{"type":"authenticate","accessToken":"{{TOKEN_A}}"}
```

```json
{"type":"authenticate","accessToken":"{{TOKEN_B}}"}
```

```json
{"type":"authenticate","accessToken":"{{TOKEN_C}}"}
```

Optionally connect a second B socket with the same B authentication to watch multi-tab unread
updates. To test two API processes, run a second API in another terminal from `chat-service`
using the same backend configuration and connect B to `ws://127.0.0.1:8005/v1/chat/ws`:

```powershell
uv run uvicorn app.main:app --host 127.0.0.1 --port 8005 --no-access-log --ws-max-size 65536
```

On A, send ping; expect `pong` with the same request ID:

```json
{"type":"ping","requestId":"10000000-0000-4000-8000-000000000001"}
```

On A, send message 1. Expect A's `message.accepted`, B's `message.created`, sequence 1, server
timestamp and trimmed text `Hello  B\nsecond line 😀`. Internal spaces/newline stay unchanged.
A may also receive `message.created`; deduplicate by message/client ID. C receives no A/B data.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000002","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_A1}}","text":"  Hello  B\nsecond line 😀  "}
```

Send that exact frame again on A: the accepted `messageId`/sequence/text/timestamp are unchanged,
with no second message or newly created outbox event. Then send these two conflict attempts
on A; each returns an `error` frame with `RETRY_ID_CONFLICT`:

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000003","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_A1}}","text":"Edited accepted draft"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000004","conversationId":"{{CONVERSATION_AC}}","clientMessageId":"{{CLIENT_A1}}","text":"  Hello  B\nsecond line 😀  "}
```

On B, send reply 2; on A, send message 3. Expect accepted/live frames with sequences 2 and 3:

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000005","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_B1}}","text":"Reply from B"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000006","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_A2}}","text":"Another message from A"}
```

On C, attempt to send to A/B; expect `CONVERSATION_NOT_FOUND` and no message insertion:

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000007","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"Outsider attempt"}
```

On A, send each invalid frame below separately. Each returns `VALIDATION_ERROR`, without
advancing the sequence. Reusing `CLIENT_INVALID` is safe because none of these sends is accepted.
The cases are empty, whitespace-only, raw 4097 emoji, raw 4097 characters that would trim to
4096, NUL, an isolated surrogate, and an undeclared sender field. `TEXT_*`/`PADDED_*` were
initialized in step 0.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000020","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":""}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000008","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":" \t\n "}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000009","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"{{TEXT_4097}}"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000010","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"{{PADDED_4097}}"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000011","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"\u0000"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000021","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"\ud800"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000012","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_INVALID}}","text":"Spoofed sender","senderUserId":"{{USER_B}}"}
```

On A, send both valid Unicode boundary frames. Expect sequence 4 with 4095 emoji and sequence 5
with 4096 emoji. A supplementary emoji counts as one code point, despite occupying two UTF-16
code units. No request ID or client message ID here is used as the sender identity.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000013","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_4095}}","text":"{{TEXT_4095}}"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000014","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_4096}}","text":"{{TEXT_4096}}"}
```

### 6. History pagination, unread state and read acknowledgements

Expect `200` with sequences 1–5 exactly once in chronological order and `boundarySequence: 5`.
Copy that number to `BOUNDARY_SEQUENCE`. Failed/retried commands above must not add messages.
GET history does not automatically mark anything read.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_B}}'
```

Latest two: expect sequences 4,5 and `hasMore: true`. Older than 4: expect 2,3. Catch-up after 3:
expect 4,5. The latest-page default/maximum is 50; smaller limits make this manual check short.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?limit=2' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?beforeSequence=4&limit=2' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?afterSequence=3&limit=2' --header 'Authorization: Bearer {{TOKEN_B}}'
```

Supplying both boundaries, requesting 51 messages, and adding undeclared query fields each
return `422 VALIDATION_ERROR`:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?beforeSequence=4&afterSequence=0' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?limit=51' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations?unexpected=ignored' --header 'Authorization: Bearer {{TOKEN_A}}'
```

B's unread count is 4 (messages 1,3,4,5); A's is 1 (B's reply 2). Own sends never count, and
opening these HTTP/WS requests did not acknowledge reads or imply a focused/visible UI thread.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Advance B through the history boundary. Expect `200`, `lastReadSequence: 5`, `unreadCount: 0`.
B's connected sockets receive `unread.updated`; A does not receive a sender-facing read receipt.
`BOUNDARY_SEQUENCE` is a number: the JSON placeholder intentionally has no surrounding quotes.

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/read' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"upToSequence":{{BOUNDARY_SEQUENCE}}}'
```

An older acknowledgement cannot move B backwards; expect the cursor to remain 5 and unread 0:

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/read' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"upToSequence":0}'
```

A future boundary gives `422 INVALID_READ_BOUNDARY`. C's attempt to mark A/B read gives 404:

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/read' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"upToSequence":999999999}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/read' --header 'Authorization: Bearer {{TOKEN_C}}' --header 'Content-Type: application/json' --data-raw '{"upToSequence":0}'
```

On A's WebSocket, test the alternate read command. Expect correlated `unread.updated` with
unread 0, and confirm it with the A metadata GET above. Hidden/unfocused clients should omit
this automatic command; the server does not infer focus from an open connection.

```json
{"type":"conversation.read","requestId":"10000000-0000-4000-8000-000000000015","conversationId":"{{CONVERSATION_AB}}","upToSequence":{{BOUNDARY_SEQUENCE}}}
```

### 7. Current display names

Rename disposable B through User Service; expect `200`. Then retrieve A's conversation again:
`counterpart.displayName` is `ManualBRenamed`, with B's current username unchanged. A reload of
the conversation list also resolves the current name; no creation-time name snapshot is used.

```curl
curl --request PATCH '{{USER_BASE_URL}}/v1/users/me' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"displayName":"ManualBRenamed"}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Searching solely for that display name produces no match unless some account's **username**
also contains it. Discovery searches usernames, not display names or email.

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username=ManualBRenamed' --header 'Authorization: Bearer {{TOKEN_A}}'
```

### 8. Bilateral blocking, own-block removal and explicit retry

As B, block A. Expect `200`, `blockedByMe: true`, `messagingBlocked: true`. Repeat the PUT:
it stays idempotent. B's blocks list includes A, and A's metadata reports blocked/unavailable.

```curl
curl --request PUT '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_A}}' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/blocks?limit=50' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Send the following on A and B respectively. Both produce `MESSAGING_BLOCKED`; no message is
inserted and no failed draft is queued. Retrying the previously accepted message-1 frame from
step 5 still returns its original acceptance even while blocked; it is not a new send.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000016","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_BLOCKED_A}}","text":"Explicit retry after unblock"}
```

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000017","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_BLOCKED_B}}","text":"Blocked reply from B"}
```

Existing conversation creation/reopen and history remain available while blocked. The POST
returns the same `CONVERSATION_AB`; the history boundary remains 5.

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B}}"}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Now A also blocks B. Both users have an independent block. B removes only B's block:
`blockedByMe: false` but `messagingBlocked: true` because A's block remains. Retry B's failed
frame above; it must still fail. A's blocks list includes B.

```curl
curl --request PUT '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_B}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request DELETE '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_A}}' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/blocks?limit=1' --header 'Authorization: Bearer {{TOKEN_A}}'
```

A removes A's block. Expect `messagingBlocked: false`; repeating the DELETE remains safe.
Both block lists are empty for these fresh accounts. Reload history **before retrying**: it
still has only sequences 1–5. Unblocking alone did not insert or replay either rejected draft.

```curl
curl --request DELETE '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_B}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/blocks' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/blocks' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Now explicitly resend A's `CLIENT_BLOCKED_A` frame with its unchanged text. Because that ID
was never accepted, it is evaluated afresh and succeeds as sequence 6. B gets one new unread
message. The rejected B draft still has not appeared.

### 9. Blocks also prevent new pair creation

No B/C conversation was created earlier. C blocks B, then B's attempt to start B/C returns
`409 MESSAGING_BLOCKED`. Finally C removes this block; leave the B/C pair uncreated for the
optional deleted-user test later.

```curl
curl --request PUT '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_B}}' --header 'Authorization: Bearer {{TOKEN_C}}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_C}}"}'
```

```curl
curl --request DELETE '{{CHAT_BASE_URL}}/v1/chat/blocks/{{USER_B}}' --header 'Authorization: Bearer {{TOKEN_C}}'
```

### 10. Disconnected recipient and sequence-based recovery

Set `LAST_SEEN_SEQUENCE` to 6, then disconnect all B WebSockets. On A, send this new message;
expect durable acceptance at sequence 7 even though B is offline:

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000018","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_OFFLINE}}","text":"Stored while B was disconnected"}
```

Reconnect B, authenticate within five seconds, and reload summaries/history. Reconnect itself
does not clear unread. This catch-up request returns the missed sequence 7 exactly once:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?afterSequence={{LAST_SEEN_SEQUENCE}}&limit=50' --header 'Authorization: Bearer {{TOKEN_B}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_B}}'
```

Copy the new history `boundarySequence` into `BOUNDARY_SEQUENCE` and repeat B's read POST from
step 6 after presenting the content. For more than 50 missed entries, continue catch-up using
the last returned sequence while `hasMore` is true.

Optional large-history check: send more than 50 additional messages on A with distinct client
IDs. This saved frame uses Postman's dynamic UUID variables, so each **Send** is a new message:

```json
{"type":"message.send","requestId":"{{$guid}}","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{$guid}}","text":"Additional history item"}
```

The default history GET returns at most 50 in chronological order and `hasMore: true` when
older entries remain. Use its first returned sequence as `beforeSequence` for older pages.
Copy its full `boundarySequence` to `BOUNDARY_SEQUENCE` and acknowledge B through that value:
the authoritative unread count becomes zero, including entries outside the initial page.
Further exercises must use response boundaries rather than the earlier fixed sequence numbers.

### 11. Optional publisher, broker and database recovery

These are operational exercises, not curl imports. Use the dedicated local Chat resources
only; do not stop the shared User/Supplier broker or reset any database. Both Chat API and
publisher must be configured for the resource you interrupt. Keep the A/B sockets open.

To isolate publisher behaviour, stop just `chat-outbox` (Ctrl+C in its native terminal, or
`docker compose --env-file user-service/.env --profile chat stop chat-outbox` from the
repository root for the unified launcher). Send this
on A: A receives durable acceptance, and HTTP history contains it, while B's live event waits.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000022","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_PUBLISHER_PAUSE}}","text":"Persisted while publisher stopped"}
```

Restart with `uv run chat-outbox` for native startup, or
`docker compose --env-file user-service/.env --profile chat start chat-outbox` from the root.
For the service-local launcher, use its own `.env` and Compose directory for both commands.
B receives the event after confirmed publication. Record its
persisted message/client ID before retrying the same payload to check duplicate-safe acceptance.

For broker recovery, only when both Chat processes use `foc-chat-test-rabbitmq` on 17425:

```powershell
docker stop foc-chat-test-rabbitmq
```

Expect `delivery: degraded` with database readiness still 200. Send this on A: it remains
durably accepted and appears in HTTP history, with publication pending. Retry the unchanged
frame to confirm the same accepted message ID/sequence is returned while the broker is down.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000023","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_BROKER_DOWN}}","text":"Persisted while broker stopped"}
```

Restore:

```powershell
docker start foc-chat-test-rabbitmq
```

Connected clients receive `sync.required` on subscription changes/recovery; reload summaries
and catch up by sequence even if no live message arrives. Temporary queues are not offline
mailboxes. Do not require automatic replay of every offline live event. The following HTTP
requests are useful during and after either publisher/broker exercise:

```curl
curl --request GET '{{CHAT_BASE_URL}}/health/ready'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages?afterSequence={{LAST_SEEN_SEQUENCE}}' --header 'Authorization: Bearer {{TOKEN_B}}'
```

For database recovery, only when Chat uses its own local Supabase database on 17422:

```powershell
docker stop supabase_db_foc-chat-service
```

Readiness and protected SQL operations return safe 503 responses. Send this on A; it can close
with recoverable code 1013. Preserve the unchanged draft/client ID because a transport failure
can leave its outcome uncertain:

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000024","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_DATABASE_DOWN}}","text":"Retry this exact draft after database recovery"}
```

Restore the same container, then reauthenticate/reload/catch up and explicitly retry that exact
frame. An uncertain accepted send resolves to its original message; an uncommitted send can
now be accepted once:

```powershell
docker start supabase_db_foc-chat-service
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/health/ready'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Previous history survives. This test stops/starts the database; it never runs `db reset`.

### 12. Current-session revocation and WebSocket rejection

As A, revoke this bearer session in User Service; expect `204`. The old A token is then
rejected by Chat with `401 INVALID_SESSION` even though its signed JWT has not yet expired.
A's existing socket closes on its next protected command/forward, or periodic session check
(default 15 seconds). A normal ping no longer keeps a revoked session authorized.

```curl
curl --request DELETE '{{USER_BASE_URL}}/v1/auth/sessions/current' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Log A back in, replace `TOKEN_A`, and reconnect/authenticate A for the remaining steps. Existing
conversations remain associated with the same immutable `USER_A`:

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/sessions' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_A}}","password":"{{PASSWORD_A}}"}'
```

Additional independent Postman WebSocket checks (use new request tabs, not the live A/B tabs):

- `Origin: https://outsider.example`, or an absent Origin: upgrade rejected; no chat data.
- URL `{{CHAT_WS_URL}}?probe=1`: rejected because query parameters are forbidden; never put
  a real bearer token in the URL to test this.
- Correct Origin, connect but send nothing for five seconds: close code 4401.
- Correct Origin, send the ping frame **before** authentication: close code 4401.
- Correct Origin, send `{"type":"authenticate","accessToken":"invalid-test-token"}`:
  close code 4401.
- With a genuinely expired access token (retain one until its login `expiresAt` passes), HTTP
  requests return 401 and new WebSocket authentication closes with 4401. Re-login to continue.

### 13. Optional deleted counterpart and username reuse (disposable B only)

Run this last; it permanently tombstones B and revokes B's sessions. Keep the original `USER_B`
and `CONVERSATION_AB` values for retained-history checks. Expect `204`:

```curl
curl --request DELETE '{{USER_BASE_URL}}/v1/users/me' --header 'Authorization: Bearer {{TOKEN_B}}' --header 'Content-Type: application/json' --data-raw '{"currentPassword":"{{PASSWORD_B}}","acknowledgeDeletion":true}'
```

As A, expect current counterpart `displayName: Deleted User`, `username: null`,
`accountStatus: DELETED`, `messagingAvailable: false`; all previously accepted history remains:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB}}/messages' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Old B is absent from search. C, which has no B/C conversation, cannot start a new pair with
the tombstone (`409 RECIPIENT_UNAVAILABLE`). A can reopen the retained A/B pair (200, same ID).

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{USERNAME_B}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_C}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B}}"}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B}}"}'
```

On A's authenticated socket, a **new** send fails with `RECIPIENT_UNAVAILABLE`, without an
outbox event. Retrying an already accepted message ID still returns its original persisted
message after A's authentication/membership checks; this does not create a new interaction.

```json
{"type":"message.send","requestId":"10000000-0000-4000-8000-000000000019","conversationId":"{{CONVERSATION_AB}}","clientMessageId":"{{CLIENT_DELETED}}","text":"Cannot send new text to a tombstone"}
```

The old B token no longer accesses Chat (401); existing B sockets also close after revalidation:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_B}}'
```

To exercise released-username reuse, set fresh `EMAIL_B2`, `PASSWORD_B2`, `OTP_B2`. Register
with B's former username, verify its OTP, and save the returned new `userId` as `USER_B2`:

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/registrations' --header 'Content-Type: application/json' --data-raw '{"username":"{{USERNAME_B}}","email":"{{EMAIL_B2}}","password":"{{PASSWORD_B2}}","displayName":"Replacement B"}'
```

```curl
curl --request POST '{{USER_BASE_URL}}/v1/auth/email-verifications' --header 'Content-Type: application/json' --data-raw '{"email":"{{EMAIL_B2}}","otp":"{{OTP_B2}}"}'
```

`USER_B2` must differ from `USER_B`. Search finds the new active ID, and A starts a new, empty
conversation with it. Save this different conversation ID as `CONVERSATION_AB2`:

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/users?username={{USERNAME_B}}' --header 'Authorization: Bearer {{TOKEN_A}}'
```

```curl
curl --request POST '{{CHAT_BASE_URL}}/v1/chat/conversations' --header 'Authorization: Bearer {{TOKEN_A}}' --header 'Content-Type: application/json' --data-raw '{"recipientUserId":"{{USER_B2}}"}'
```

```curl
curl --request GET '{{CHAT_BASE_URL}}/v1/chat/conversations/{{CONVERSATION_AB2}}/messages' --header 'Authorization: Bearer {{TOKEN_A}}'
```

Expect empty `items`, `boundarySequence: 0`; the original A/B history still belongs to the
original UUID pair. Repeat the original A/B history GET to confirm it is retained separately.

This manual guide exercises public behaviour. Concurrent transaction/lease races, injected
message/outbox rollback, publisher-confirm uncertainty, bounded-buffer saturation and malformed
internal User Service responses remain covered by the automated tests below. The commands in
this section are examples for the human to run; adding the guide did not execute mutations,
delete accounts, restart services or rerun the recorded 40-test suite.

## Reproduce locally

Use only the isolated Chat project and dedicated test broker. These commands assume the current
directory is `chat-service`; none target another service. Native Windows sandbox access to
Docker, the Python base installation/uv cache, and some Git worktree operations required normal
escalation during this session. GitHub/gh was not used.

```powershell
uv sync --locked --extra dev
npm ci
npx supabase start -x studio,imgproxy,inbucket,postgrest,realtime,storage-api,edge-runtime,logflare,vector,supavisor
npx supabase db reset --local
uv run python -m scripts.provision_test_role
docker run --detach --name foc-chat-test-rabbitmq --publish 127.0.0.1:17425:5672 rabbitmq:4.1-management
$env:CHAT_TEST_DATABASE_URL='postgresql+asyncpg://chat_test:local-chat-test-only@127.0.0.1:17422/postgres'
$env:CHAT_TEST_RABBITMQ_URL='amqp://guest:guest@127.0.0.1:17425/'
$env:CHAT_TEST_BROKER_RESTART='1'
$env:CHAT_TEST_DATABASE_RESTART='1'
uv run ruff check app tests scripts
uv run ruff format --check app tests scripts
uv run pytest -q --tb=short
docker build --tag foc-chat-service:test .
uv run python -m scripts.container_smoke
```

The displayed database/broker credentials are deliberately public, disposable local test values,
not production secrets. `provision_test_role` verifies the Chat container/port and creates a
test login only if absent; it does not overwrite existing passwords. Clean reset removes local
login state, so re-provision afterwards. Do not run restart tests while another job uses these
Chat resources. Tests use unique user/conversation UUIDs and do not truncate tables. They refuse
database hosts outside loopback/17422 and broker hosts outside loopback/17425. The restart tests
additionally verify their exact container port bindings. Unit tests remain runnable without
infrastructure, with integration tests explicitly skipped.

If the dedicated test broker already exists, use `docker start foc-chat-test-rabbitmq` instead
of `docker run`. After verification, stop only this broker and run Supabase `stop` from this
directory to preserve the Chat database volume. Disposable API/publisher smoke containers and
test subprocesses clean themselves up; existing root-stack containers remain untouched.

The two-process fixture starts a test-only loopback User contract fake at 17430, APIs at
17431/17432, and a publisher. It generates its own ephemeral RSA key in memory; that fake is
never shipped in the Docker image. The actual User Service smoke is separate:

```powershell
uv run python -m scripts.verify_user_service --fixture <owner-provisioned-disposable-fixture.json>
```

This starts APIs at 17433/17434 and its own publisher, consumes credentials in memory, emits
only sanitized check names/timings, and terminates its child processes. User Service owns the
fixture/app/database setup and teardown. Its fields are `userServiceBaseUrl`,
`chatServiceSharedSecret`, `callerAccessToken/callerUserId`,
`counterpartAccessToken/counterpartUserId/counterpartUsername`, `deletedUserId`, `unknownUserId`
and `usernameQuery`; the counterpart display name in this demo is `Renamed`.

## Coverage tied to implementation

| Requirement/behaviour | Delivered backend evidence | Remaining acceptance |
|---|---|---|
| `N1F1.1`, `.1.1`–`.1.3` | Real User search; unique pair creation under concurrent requests; immutable user IDs; outsider HTTP/WebSocket denial | Search/open/send UI flow |
| `N1F1.2`, `.2.1`, `.2.3`, `.2.4` | Durable SQL messages; UTC timestamps; deterministic sequences; bounded latest/older/catch-up history; current counterpart names/usernames | Final conversation-list/thread presentation |
| `N1F1.2.2`–`.2.2.4` | Own sends excluded from unread; monotonic persisted cursors; no future reads; snapshot clears messages outside initial 50; reader-only cross-process sync; concurrent incoming/read races | Selected + focused + visible detection and automatic client acknowledgements/badge behaviour |
| `N1F1.3`–`.3.4` | Directional blocks; bilateral prevention; shared pair lock with sends/creation; mutual unblock; rollback/no queued rejected sends; live skipped events consumed without unblock replay | Block management UI/state labels |
| `N1F1.4`–`.4.3` | Raw 4095/4096/4097 and outer-whitespace boundaries; supplementary Unicode; internal whitespace preserved; empty/invalid text rejected | Matching browser code-point counting and validation feedback |
| `N1F1.5`–`.5.2` (including source alias `NF1F1.5.2`) | Durable acceptance; lost acknowledgement retry; concurrent same/different-conversation retry keys; changed-text conflict; atomic message/outbox rollback | Optimistic bubble deduplication and pending/sent/failed/retry presentation |
| `N1F1.6`–`.6.5` | Retained blocked/deleted history; UUID username-reuse separation; real tombstone/missing lookup; denied new deleted/unknown interaction | Deleted counterpart UI and actual end-to-end deletion/reuse flow with final client |
| Delivery/security support | Two real API processes; confirmed publication; leases/stale ownership/backoff; duplicate/out-of-order events; real broker/database interruptions; session revocation/expiry, origin/auth timeout checks; bounded buffer | Final client reconnect/backoff/resynchronization and real slow-network UI demonstration |
| `N1NFR3.1`–`.3.4` (source M1 aliases retained in PLAN) | Backend contracts support direct start, explicit send outcomes/retry and read recovery | Three-action flow, visual states, desktop/mobile and keyboard acceptance are **not implemented** |
| Sprint 4 N1 scalability/performance aliases | Async I/O, indexes, process fan-out and baseline measurements | 1,000 connections, sustained 25 msg/s for 15 min, formal latest-50/p95 delivery/loading and errand context deferred |

## Logical commits

- `98cb471` — prepared planning/skeleton files.
- `28cc0dd` — runnable foundation and isolated schema.
- `8b17f92` — current identity and private conversations/history.
- `1d7555f` — atomic/idempotent messages and pair-locked bilateral blocking.
- `a7a19a3` — authenticated WebSockets and confirmed per-process RabbitMQ fan-out.
- `858a35a` — unread cursors and reconnect recovery.
- Final verification/handoff commit follows these phases and includes the least-privilege
  migration, expanded failure/security checks, runnable service-local configuration and docs.

No push, merge or pull request was performed. Shared integration and UI work is listed in
[integration-follow-up.md](integration-follow-up.md); concrete frames/DTOs and client obligations
are in [backend-contract.md](backend-contract.md).
