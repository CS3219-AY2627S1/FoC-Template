# order-service

See ../AGENTS.md for repository-wide rules.

This service owns the domain rules for errands and their lifecycle states. The web client presents them and never reimplements them, so any rule that belongs here stays here.

Node 24 runs the TypeScript directly (no build step), with Express 4, PostgreSQL through `pg` and zod for input. `README.md` describes the API, the creation flow and the events.

- The state machine lives in one place, `USER_TRANSITIONS` in `src/services/order.service.ts`. Every status change goes through a conditional `UPDATE ... WHERE status = <expected>` that writes its row in `order_transitions` and, for an outcome, its outbox event in the same statement. Keep it that way, so concurrent requests cannot both win and no change goes unrecorded.
- Pending and Rejected orders are not errands (`isErrand`). No endpoint returns them.
- Errors are `AppError` from `src/errors.ts`, thrown and answered by the handler in `src/app.ts` as `{ error: { code, message, details } }`. Field errors go in `details.fields`, built with `validationError` from `src/util/validation.ts`.
- `src/schema.sql` runs on every start. A change to an existing table has to be idempotent (`ADD COLUMN IF NOT EXISTS`, drop and re-add a constraint).
- Run `npm run typecheck` and `npm test` in `order-service`; CI runs the same.
