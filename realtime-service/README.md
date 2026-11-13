# Realtime service

Run the local AWS emulator with `docker compose up -d`. Its initialization hook
creates the realtime queue and subscribes it to supplier events.

```sh
npm ci
NODE_ENV=development \
JWKS_URL=http://localhost:8080/api/.well-known/jwks.json \
SQS_QUEUE_URL=http://localhost:4566/000000000000/foc-dev-realtime-events \
AWS_REGION=ap-southeast-1 AWS_ENDPOINT_URL=http://localhost:4566 \
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test npm run dev
```

The shared `RealtimeService` run configuration supplies these local settings.
The service listens on port `8084`.
`NODE_ENV`, `AWS_REGION`, `JWKS_URL`, and `SQS_QUEUE_URL` are required.
Startup fails if any are missing or invalid. `AWS_ENDPOINT_URL` is optional for local emulation.
Production uses the ECS task role for AWS credentials.

`npm run build` compiles the service; `npm start` runs the compiled output.

`src/index.ts` starts HTTP, Socket.IO, and the SQS consumer. Configuration and token
verification live in `src/config.ts` and `src/auth.ts`; event parsers live in
`src/events.ts`. `src/event-handlers.ts` routes by the SQS `eventType` message
attribute. `src/sqs.ts` long polls and deletes messages only after successful handling.
Failed or malformed messages remain for retry and eventually move to the queue's DLQ.

Connect with Socket.IO at the same origin as the HTTP server. Pass the access token
on the handshake:

```js
io({auth: {token}})
```

The handshake verifies ES256 tokens against user-service JWKS. The token `sub` is
the user id, and the socket joins `user:{userId}`.

Terraform subscribes the realtime queue to `SupplierChangedEvent` from the supplier
SNS topic. Every connected socket receives `supplier.changed` with `{supplierId, change}`.
It also subscribes the queue to the errand chat events from the order SNS topic. The
errand's requester and courier (only) receive:

- `errand.message` with `{id, errandId, senderId, body, attachmentType, sentAt}` for
  `ErrandMessagePostedEvent` (`body` is null for a photo or video without text; the
  app fetches the conversation to get the file's link);
- `errand.read` with `{errandId, readerId, lastReadAt}` for `ErrandChatReadEvent`.
The consumer also understands `UserUpdatedEvent` with `{userId, event, data}` for
user-scoped notifications, but no producer or subscription for that event exists yet.
SNS subscriptions must use raw delivery and preserve the `eventType` message attribute.

Run one realtime instance. Multiple consumers of one queue would split updates
between instances rather than deliver them to all connected clients. Clients refetch
current state after reconnecting; duplicate notifications are possible on retries.

## Verification

```sh
npm ci
npm run check
```

`check` typechecks source and tests, runs unit tests, and builds the service.
Tests use mocked AWS operations and do not need a broker or AWS credentials.
