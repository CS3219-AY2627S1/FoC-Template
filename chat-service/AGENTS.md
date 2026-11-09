# AGENTS.md — chat-service

See the root `AGENTS.md` for monorepo-wide conventions.

## Service specifics

- FastAPI app; entrypoint `app.main:app`, port `8000` in-container.
- Owns its own PostgreSQL database (`chat-db`). Never access another service's DB.
- Exposes `GET /health` returning `{"status": "ok"}` (and `GET /health/ready`, which
  also checks the database).
- A **generic** chat service (conversations, members, messages, receipts, typing,
  system messages). Keep the core (`app/services/chat.py`, `app/api`, `app/realtime`)
  free of FoC domain concepts: no orders, couriers or credits there. FoC-specific
  behaviour lives in `app/integrations/` and must only call the generic service methods.
- Caller identity comes from the gateway-injected `X-User-Id` header
  (`CHAT_AUTH_MODE=gateway`, the default). `CHAT_AUTH_MODE=jwt` verifies a bearer
  JWT instead, for running without the gateway. Never trust client-asserted roles.
- WebSockets authenticate with one-time tickets (`POST /chat/ws-ticket`, then
  `/chat/ws?ticket=...`). Do not add token-in-URL or first-frame JWT auth.
- `/internal/*` is for other backends (`X-Service-Key`). The gateway must never expose it.
- Side effects follow the transaction: socket frames are published after commit
  (`AppState.run`), domain events go through the `outbox` table.
- Photos go through `app/services/photos.py` and `foc_shared.images`. Never return
  object keys or pre-signed URLs; every read is checked by `ChatService.attachment_for`.
  Objects are deleted only by the purge sweep, after which their row goes.

## Layers

Same layering as the other services:

`api/routes` (HTTP) and `realtime/ws.py` (WebSocket) → `services` (business rules,
side effects such as socket fan-out and outbox events) → `repositories` (all SQL) →
`models` (one module per table). Request/response and WebSocket shapes live in
`schemas`. Keep HTTP concerns out of `services` and SQL out of everything but
`repositories`.

## Tests

Tests need PostgreSQL: `pytest --postgres-url postgresql+asyncpg://foc:foc@localhost:5432/chat_test`
(or set `CHAT_TEST_DATABASE_URL`). Without a URL they are skipped. The suite drops and
recreates the chat tables in that database.

## AI usage

Add a file-header attribution comment to every AI-influenced file and log
prompts in `../ai/usage-log.md`.
