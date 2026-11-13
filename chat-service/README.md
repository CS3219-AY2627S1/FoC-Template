# Chat Service — Friend on Campus (FoC)

N2H feature: chat between the requester and courier of an errand (F10), with
content filtering (F10.5). Owner: Maliha.

> AI-assisted (Claude), reviewed and tested by Maliha.

## Stack

- Express 5 + Socket.IO 4, Node 22, TypeScript
- Optional Redis (`@socket.io/redis-adapter`) to share chat rooms between instances
- PostgreSQL 16 through `pg`. Tables are created on startup from `schema.sql`
  (`IF NOT EXISTS`), so there is no separate migrate job
- Verifies user-service's RS256 access tokens with its public key
- Content filter: [`obscenity`](https://www.npmjs.com/package/obscenity) for
  swearing, plus a short pattern list for threats

## How it fits with the other services

```text
browser ──/backend/chat──▶ ui (nginx) ──▶ chat-service ──▶ chat-db
                                              │
                                              └─ GET /orders?scope=requested|assigned ─▶ order-service
                                                 (with the user's own token)
```

order-service has no `GET /orders/:id`, and gRPC `GetOrder` is still a stub, so
chat-service asks for the user's own requested/assigned orders with the user's
token and looks for the errand there. That means order-service decides who is on
an order; chat-service never trusts an id the browser sends.

## How it maps to the requirements

| Req | How |
| --- | --- |
| F10.1 | One chat per errand. It opens once a courier accepts |
| F10.1.3 | Messages are pushed over Socket.IO. The sender gets an ack (sent), and a `chat:read` event when the other person has seen it (read) |
| F10.2 | Every join and send re-checks with order-service that the caller is the requester or courier. Nobody else can read or post, admins included |
| F10.3 | History comes back oldest first, each message with its `senderId` |
| F10.4.1 | A job every 5 min deletes chats (and their messages) 1 h after the errand was delivered or cancelled |
| F10.4.2 | The chat stays fully open for 1 h after the errand ends, then closes (reading and sending are both refused). The join reply includes `closesAt` so the UI can tell both people when it closes |
| F10.5 | Swearing is masked (`****`) and still sent. Threats and "kys"-type messages are blocked. Both create a flag (user, order, original text) for admins. Flags are kept after the chat is deleted |

## Run

Needs user-service's keys (`npm run keys:generate --prefix user-service`).

**Full stack:** it is in the root `compose.yaml`. `cp chat-service/.env.example chat-service/.env`,
then `docker compose up --build -d` from the repo root.

**Standalone (Docker):** from this folder, with order-service on port 3003:

```sh
cp .env.example .env
docker compose up -d --build
curl http://localhost:3005/health
```

**Dev (hot reload):**

```sh
npm install
cp .env.example .env
docker compose up -d chat-db
npm run dev
```

**Tests:** `npm test` (content filter and chat open/close rules).

**Running several instances** (EKS, see `k8s/README.md`): set `REDIS_URL`. The
Socket.IO Redis adapter then passes room events between instances, so a requester
and courier connected to different pods still get each other's messages. The UI
connects with WebSocket only, so each connection stays on one pod and no sticky
sessions are needed. Instances that start together take turns creating the
tables (a Postgres advisory lock in `migrate()`). Without `REDIS_URL`, rooms stay
in memory, which is fine for one instance.

## Ports

| | Host (standalone only) | Container |
| --- | ---: | ---: |
| REST + Socket.IO | 3005 | 3005 |
| PostgreSQL | 5436 | 5432 |

Everything is under `/chat`, so the UI forwards `/backend/chat` → `chat-service:3005/chat`.

## API

### Socket.IO

```ts
io({ path: '/backend/chat/socket.io', transports: ['websocket'], auth: { token } })   // through the UI
```

A missing or bad token fails with connect error `unauthorized`.

| Event (client → server) | Payload | Ack |
| --- | --- | --- |
| `chat:join` | `{ orderId }` | `{ messages, canSend, me, other }` or `{ error }` |
| `chat:send` | `{ orderId, text }` (1–1000 chars) | `{ message, masked }` or `{ error }` |
| `chat:read` | `{ orderId }` | `{}` |
| `chat:leave` | `{ orderId }` | — |

| Event (server → room) | Payload |
| --- | --- |
| `chat:message` | `{ id, orderId, senderId, body, sentAt, readAt }` |
| `chat:read` | `{ orderId, readerId }` |

Error codes: `invalid-input`, `forbidden` (not your errand), `not-started` (no
courier yet), `closed` (errand ended), `blocked` (message filtered), `unavailable`
(order-service or the database is down).

### REST (admin only)

| Method | Path | |
| --- | --- | --- |
| GET | `/chat/flags` | Unreviewed flags, newest first. `?include=reviewed` for all |
| POST | `/chat/flags/:id/review` | Mark reviewed. 204, or 404 if already reviewed |
| GET | `/health` | Pings the database |

## Known gaps

- **Cleanup needs the chat to be used after the errand ends.** chat-service only
  learns that an errand ended when someone opens or sends in it. If order-service
  starts publishing `order.*` events on RabbitMQ, chat-service should listen for
  delivered/cancelled instead.
- **F10.5 says to flag the user's account.** The flag lives here (user + message).
  A real account flag would need a field in user-service.