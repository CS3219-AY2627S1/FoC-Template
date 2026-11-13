# message-service

Direct messages between Relay accounts. Messages are saved in MongoDB and delivered live over Socket.IO. Every new account gets a welcome message from Relay, triggered by the `user.account.activated` event.

Node.js 24, TypeScript, Express 5, Socket.IO, MongoDB (Mongoose), RabbitMQ (amqplib)

## Running

From the repository root, `docker compose up --build` starts the service on http://localhost:3008 together with its database (`message-db`, published on `127.0.0.1:27018`). It needs the user-service for every protected request, the order-service for sending, and the broker for welcome messages. Without the broker the service still runs and keeps trying to connect.

Outside Docker: copy `.env.example` to `.env`, then `npm run dev`.

The browser reaches the service through the web client gateway: REST under `/api/message/messages/...`, Socket.IO on the path `/api/message/socket.io`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP and Socket.IO port (default 3008) |
| `LOG_LEVEL` | pino log level (default `info`) |
| `MONGO_URL` | MongoDB connection string |
| `USER_SERVICE_URL` | Base URL of the user-service, for `POST /internal/authorize` |
| `ORDER_SERVICE_URL` | Base URL of the order-service, for `GET /internal/orders/:id` |
| `BROKER_URL` | RabbitMQ connection string, for consuming events |

## Authorization

Every request under `/messages` and every socket connection carries the `relay_session` cookie. The service asks the user-service (`POST /internal/authorize`, role `member`) whether it belongs to a logged-in account, and uses only the `accountId` from that answer. Ids in a request body or event payload never decide who the sender is.

It fails closed: no answer, a timeout (2 s) or anything other than `authorized` is a refusal. Sockets are checked when they connect and again for every event they send.

### Errand chats

Every message from a person belongs to an errand (`orderId`). Before a message is saved, the service asks the order-service (`GET /internal/orders/:id`) for the errand's `requesterId`, `courierId` and `status`, and refuses unless:

- the sender is the requester or the courier, and the receiver is the other one. Otherwise `403 FORBIDDEN`, the same answer as for an errand that does not exist;
- the status is `Accepted`, `PickedUp` or `Delivered`. Before a courier accepts there is nobody to write to (`403`); after `Completed`, `Cancelled` or `Expired` the chat is closed (`409 CHAT_CLOSED`).

Closed chats stay readable. If the order-service cannot be reached (2 s timeout) the message is refused with `503 ORDER_SERVICE_UNAVAILABLE` and nothing is saved.

## API

All errors have the shape `{ "error": { "code": "...", "message": "...", "details": { ... } } }`. Validation errors list every invalid field in `details.fields`.

| Method | Path | Access | What it does |
| --- | --- | --- | --- |
| GET | `/health` | public | `200 {status:"ok",db:"up"}`, or `503` while the database is down |
| GET | `/messages/conversations` | member | One row per errand chat the caller takes part in, newest first |
| GET | `/messages/last-message/:userId` | member | The newest message between the caller and `userId`, or `null` |
| GET | `/messages/orders/:orderId?page=&pageSize=` | errand participant | One page of the errand's chat, with `otherId` and whether it is `open` |
| GET | `/messages/:senderId/:receiverId?page=&pageSize=` | participant | One page of the conversation |
| POST | `/messages/send` | errand participant | Saves a message and pushes it to the receiver like `sendMessage`, `201` with the message |

A refusal is `401 UNAUTHENTICATED` without a cookie and `403 FORBIDDEN` otherwise. Reading a conversation you are not part of is refused before anything is looked up, so the answer does not reveal whether it exists.

A message:

```json
{
  "_id": "6728a1f3c9e77b0012345678",
  "senderId": "1268c530-68bf-4a64-ae18-6884f0931741",
  "receiverId": "eeb4e173-feec-4d64-bed0-b6b42e7eaf4f",
  "orderId": "42",
  "content": "I can pick up your coffee",
  "status": "unread",
  "createdAt": "2026-11-06T05:07:12.000Z",
  "updatedAt": "2026-11-06T05:07:12.000Z"
}
```

`GET /messages/conversations` returns `[{ "otherId": "...", "orderId": "42", "lastMessage": <message>, "unread": 2 }]`, where `unread` counts the messages to the caller that are still unread. Two people who share several errands get one row per errand, since each errand has its own chat. Messages from Relay have `senderId` `"0"` and no `orderId`, and form one row without `orderId`.

`GET /messages/:senderId/:receiverId` returns `{ "items": [...], "page": 1, "pageSize": 20, "total": 27 }`. Page 1 holds the newest messages, and the items inside a page are oldest first, ready to show. `page` starts at 1, `pageSize` is 1 to 100 (default 20). The two ids can be given in either order.

`GET /messages/orders/:orderId` returns `{ "items": [...], "page": 1, "pageSize": 20, "total": 3, "otherId": "...", "open": true }`, paged like the conversation above. Only the errand's requester and courier may read it, also after it has closed.

`POST /messages/send` takes `{ "orderId": "42", "receiverId": "...", "content": "..." }` and follows the errand chat rules above. `content` must not be empty or longer than 2000 characters, and `receiverId` must not be `"0"`.

## Socket events

Connect with `io({ path: "/api/message/socket.io" })` through the gateway. Each socket joins a room named after its account, so a message reaches every open tab of the receiver.

| Direction | Event | Payload | Answer |
| --- | --- | --- | --- |
| client → server | `sendMessage` | `{ orderId, receiverId, content }` | ack with the saved message, or `{ error: { code, message } }`, with the same codes as `POST /messages/send` |
| client → server | `markAsRead` | `{ senderId, orderId? }` | ack `{ changed }`, the number of messages marked read. With `orderId` only that errand's chat, without it every message from `senderId` |
| client → server | `heartbeat` | none | emits `heartbeat:ack { timestamp }` |
| server → client | `receiveMessage` | a message | sent to the receiver |
| server → client | `messagesRead` | `{ readerId, orderId? }` | sent to the sender, only when `markAsRead` changed something |

A connection without a valid session is refused with the error `FORBIDDEN`. If the session ends while connected, the next event is refused and the socket is disconnected.

## Events

Consumed from the exchange `relay.events` on the queue `message-service.messages`:

| Event | What happens |
| --- | --- |
| `user.account.activated` | Saves a welcome message from Relay (`senderId` `"0"`) to `data.accountId` and pushes it to the account if it is online |

The broker delivers at least once. A partial unique index on `receiverId` for messages from Relay makes a repeated event a no-op, so every account gets exactly one welcome message. An event is acknowledged only after the message is saved; a failed save is requeued after 5 seconds. A malformed event goes to `message-service.messages.dead`. The full catalog is in `../docs/events.md`.

## Tests

`npm test` runs the tests in `test/` against an in-memory MongoDB (the first run downloads it) and a fake user-service and order-service from `test/helpers/auth.ts`. They cover REST refusals, the errand chat rules, sending and reading, the socket events, and repeated welcome events.
