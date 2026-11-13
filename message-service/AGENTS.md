# message-service

See ../AGENTS.md for repository-wide rules.

This service owns direct messages between accounts: saving them, delivering them live and their read status. It decides nothing about who someone is or what they may do; the user-service answers that for every request.

Stack: Node.js 24 running TypeScript directly (no build step), Express 5, Socket.IO, MongoDB through Mongoose, amqplib for RabbitMQ, zod for validation, pino for logging.

Layout: `routes` map paths to `controllers`, controllers only handle HTTP, `services` hold the rules and never import Express, `models` hold schemas and indexes. `webSocket.ts` handles socket events, `consumer.ts` consumes broker events, `middleware/auth.ts` asks the user-service for both HTTP and sockets. Request schemas live in `schemas/`.

Conventions:

- The sender is always `res.locals.accountId` or `socket.data.accountId`, the id the user-service confirmed. Never take it from a body, query or socket payload.
- Fail closed: anything other than `authorized` from the user-service is a refusal. Check access before looking anything up.
- Validate every body, query and socket payload with a zod schema from `schemas/`. A socket event answers through its ack, with the saved object or `{ error: { code, message } }`.
- Consume idempotently and acknowledge only after the save. A repeated `user.account.activated` must never create a second welcome message.
- Import with the `.ts` extension. `enum`, `namespace` and constructor parameter properties are not allowed (`erasableSyntaxOnly`); use `as const` arrays and union types.
- Never log message content or session tokens.
- After changing code, `npm test` and `npm run typecheck`, then rebuild the container with `docker compose up -d --build message-service`.

The API, socket events and consumed events are documented in `README.md`. Keep it in sync when any of them change, and add new events to `../docs/events.md`.
