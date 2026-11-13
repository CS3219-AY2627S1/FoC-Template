# Chat Service - Local Setup and Demo Guide

Live chat between the requester and the courier of an errand, with image support (our nice-to-have feature). A chat opens when a courier accepts, only those two people can use it, messages are kept, and the chat is deleted 3 hours after the errand ends.

Stack: Deno + Oak, Prisma 8 (`@prisma/orm-postgres`), PostgreSQL 18, RabbitMQ, WebSocket. The same as the order and credit services.

The frontend developer should read the **Chat Service: Frontend Guide** doc (REST calls, WebSocket events, image handling, UI checklist). This file is for running and demoing the service.

## 1. Start the Service

No new variables are required. `docker compose` has defaults. Optionally add to the root `.env` (see `.env.example`):
```env
CHAT_DB_PW=mysecretpassword
CHAT_RETENTION_MINUTES=180
```
From the repository root:
```
docker compose --profile dev up -d --build chat_db chat_dev
docker compose --profile dev restart api_gateway edge_dev
```
The restart is needed once: the gateway and edge nginx configs gained the chat route and WebSocket support, and nginx also caches container addresses.

Check it is healthy:
```
docker compose --profile dev logs chat_dev --tail 20
docker compose --profile dev exec rabbitmq rabbitmqctl list_queues name messages consumers
```
Expect `RabbitMQ connected. Chat Service is listening for events.` and `chat.events.queue` with 1 consumer and `chat.events.dlq` with 0 messages.

URLs: through the edge (as the frontend does) `http://localhost:8000/api/public/chat/...`. Directly, for debugging, `http://localhost:8005/public/...`.

## 2. How a Chat Lives (events)

The service only listens, it publishes nothing. All events arrive on the `app.events` exchange in the queue `chat.events.queue` (dead letters go to `chat.events.dlq`).

| Event | From | What the chat service does |
| --- | --- | --- |
| `order.created` | Order | Remembers who the requester is (`requestorId`), because `order.accepted` does not carry it |
| `order.accepted` | Order | Remembers the courier. Once both are known the chat is open and both people are pushed `chat.opened` |
| `order.completed` | Order | Marks the chat ended (DELIVERED) and sets its deletion time to now + retention (3 hours) |
| `order.cancelled` | Order | Same, with reason CANCELLED (this includes expired errands). If nobody had accepted, there was no chat, so the empty record is removed |
| `credits.accepted.rejected` | Credit | Credit refused the courier, so Order puts the errand back to OPEN. The chat and its messages are deleted for both people. A new courier gets a fresh chat |

Order is not changed. Every handler is safe to run twice and in any order between the `order.*` events: each one only fills in or changes its own part of the chat. A message that fails is retried once, then dead-lettered.

A chat can only open for errands created after the chat service was started (it learns the requester from `order.created`).

## 3. Data (`chat_sessions`, `chat_messages`)

- `chat_sessions`: one row per errand: `errandId`, `requesterId`, `courierId`, `endReason`, `deleteAt`, and the last message each person has read.
- `chat_messages`: `id` (only goes up, used for ordering and paging), `errandId`, `senderId`, `type` (TEXT or IMAGE), `body`, the image (type and base64 bytes), and a `clientMessageId` that is unique.

Show them:
```
'select "errandId","requesterId","courierId","endReason","deleteAt" from chat_sessions;' | docker compose --profile dev exec -T chat_db psql -U postgres -d chat
'select id,"errandId","senderId",type,left(body,30) as body,"createdAt" from chat_messages order by id;' | docker compose --profile dev exec -T chat_db psql -U postgres -d chat
```

## 4. Changing the Schema
1. Edit `src/prisma/contract.prisma`
2. Regenerate `contract.json` and `contract.d.ts`: `docker compose --profile dev exec chat_dev deno task contract:emit`
3. Apply it to the database: `docker compose --profile dev exec chat_dev deno task db:update`

## 5. API (summary)

Every call needs `Authorization: Bearer <accessToken>` (login as in the order README). `errandId` is the order id.

| Call | Purpose |
| --- | --- |
| `GET /api/public/chat/chats` | My chats, most recently active first, with unread count and last message |
| `GET /api/public/chat/chats/:errandId` | One chat |
| `GET /api/public/chat/chats/:errandId/messages?limit=30&before=<id>` | History, oldest first, with `hasMore` |
| `POST /api/public/chat/chats/:errandId/messages` | Send text `{ "clientMessageId": "<uuid>", "body": "hello" }` |
| `POST /api/public/chat/chats/:errandId/images` | Send an image (form-data: `image`, `clientMessageId`) |
| `POST /api/public/chat/chats/:errandId/read` | Mark as read (204) |
| `GET /api/public/chat/images/:messageId` | Image bytes (token as header, or `?token=`) |
| WebSocket `/api/public/chat/ws?token=<accessToken>` | Live pushes: `message`, `chat.opened`, `chat.updated`, `chat.deleted` |

Status codes: 401 no or bad token, 404 not found / not your chat / deleted (the same answer for all three, so nobody can tell which errands have a chat), 400 invalid body (with per-field reasons), 409 `clientMessageId` already used by someone else's message, 413 image over 2 MB, 415 not JPEG, PNG or WebP.

## 6. Demo Walkthrough

You need two users, for example the Order demo's Sarah (requester) and the admin account (courier). Keep both access tokens.

1. **Create and accept.** As in the order demo: Sarah creates an errand and waits for OPEN, the admin accepts it (PATCH `ACCEPTED`). Note the order id.
2. **The chat exists for both and nobody else.** `GET /api/public/chat/chats` as Sarah and as the admin: one chat each, `otherUserId` is the other person. A third user gets an empty list, and `GET .../chats/<ORDER_ID>` as a third user returns 404 (even an admin cannot read other people's chats).
3. **Live push.** In a browser tab on `http://localhost:8000`, open the developer console and paste, using the admin's token:
   ```js
   const ws = new WebSocket('ws://localhost:8000/api/public/chat/ws?token=PASTE_ADMIN_TOKEN');
   ws.onmessage = e => console.log(JSON.parse(e.data));
   ```
4. **Send text.** As Sarah: `POST .../chats/<ORDER_ID>/messages` with `{ "clientMessageId": "<any new UUID>", "body": "I'm at the lobby" }`. The console shows the `message` push, and the admin's chat now has `unreadCount: 1`. Send the same request again: 200 with the same message and no new push (duplicate protection). Mark it read as the admin: `POST .../read`, and `unreadCount` becomes 0.
5. **Send an image.** In Thunder Client, Body, Form, add the field `image` as a File (JPEG, PNG or WebP under 2 MB) and `clientMessageId` as text. Then `GET .../images/<messageId>` shows it. A `.txt` renamed `.png` gives 415.
6. **History.** `GET .../messages?limit=2`, then again with `before=<first id>` for older ones.
7. **The errand ends.** The admin collects and delivers (PATCH). The chat now has `endReason: "DELIVERED"` and a `deleteAt` 3 hours ahead, the console gets `chat.updated`, and sending still works.
8. **Deletion (live).** Put `CHAT_RETENTION_MINUTES=1` in the root `.env` and run `docker compose --profile dev up -d chat_dev`. Repeat steps 1 and 7. About a minute after delivery (the job checks every 15 seconds) the console gets `chat.deleted`, the chat returns 404, and the two `psql` queries above show no rows for that errand, images included. Set it back to 180 afterwards.
9. **Cancel path.** Create and accept another errand, then Sarah cancels it (PATCH `CANCELLED`): `endReason: "CANCELLED"`.

## 7. Design Notes (for the Q&A)

- **Why its own service:** own database and lifecycle (deletion after 3 hours), and a chat problem can never break orders. It follows Order's pattern: events in, no shared database.
- **Why events and not calls to Order:** the chat reacts to `order.*` events, so Order does not need to know the chat service exists, and Order keeps working if Chat is down. The events wait in the queue until Chat is back.
- **Why text goes through the server:** history, messages for offline users, and a server that can enforce who is allowed in a chat. Peer-to-peer would lose messages when someone is offline. WebSocket is used only to push to the browser; sending is a normal REST call, which gives clear status codes and retry safety.
- **Authorization:** identity comes from the signed token, and the chat's two participants come from the stored chat (set from order events). A client cannot send a sender id (unknown fields are rejected). Anyone who is not a participant gets the same 404 as a missing chat.
- **Duplicate sends:** each message carries a `clientMessageId` that is unique in the database, so a retry returns the first message.
- **Atomic and race-safe:** every change is one SQL statement. Saving a message checks that the chat still exists in the same statement, so a message can never land in a chat the cleanup just deleted.
- **Deletion:** a background job every 15 seconds deletes chats past `deleteAt`, with their messages and images. A chat past its time is already invisible before the job runs.
- **Images:** kept in the database as base64 text (JPEG, PNG or WebP, max 2 MB). The type is decided from the file's first bytes, not the file name. They are deleted with the chat, so there is no file storage to clean up.
- **Token expiry:** the WebSocket is closed (code 4401) when its token expires, and the app reconnects with a fresh one.

Known limits: live pushes are held in this process's memory, so run **one copy** of the service (more copies would need a shared bus such as Redis pub/sub). Logs only, no OpenTelemetry metrics. Old errands (created before the service existed) have no chat.
