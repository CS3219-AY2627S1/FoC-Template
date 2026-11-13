# Prompt archive: 009

Received 2026-11-12 (Asia/Singapore).

## Prompts

```text
can we add the necessary code changes for this on ui/final-n2h?
```

## Response (summary)

Made the code changes on `ui/final-n2h` (in a separate git worktree, so the
uncommitted Kubernetes work on `k8s-ui-chat` was left alone):

- `chat-service`: added `@socket.io/redis-adapter` and `redis`; optional
  `REDIS_URL` in `src/env.ts`; `src/index.ts` attaches the Redis adapter when
  `REDIS_URL` is set, logs Redis errors instead of crashing, and closes the
  Redis clients on shutdown.
- `chat-service/src/db.ts`: `migrate()` runs `schema.sql` inside a transaction
  holding `pg_advisory_xact_lock`, because two pods starting at once can fail
  with a duplicate-key error even with `CREATE TABLE IF NOT EXISTS`.
- `ui/api/chat.ts`: `transports: ["websocket"]`, so each connection stays on one
  pod and no sticky sessions are needed.
- `chat-service/README.md` and `.env.example`: documented `REDIS_URL` and
  running several instances.

The first build failed on a Redis client type in the shutdown list; it was
narrowed to `{ quit(): Promise<unknown> }[]`.

Checks run: chat-service build, test type-check and `npm test` (6/6); UI build.
Two chat instances against one Postgres and one Redis, started together on a
fresh database, with a stand-in order service and test-signed tokens: a
requester on instance A and a courier on instance B received each other's
messages. Control run without Redis: neither message arrived.
