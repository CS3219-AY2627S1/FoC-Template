# user-service

See ../AGENTS.md for repository-wide rules.

This service owns the domain rules for users, authentication and sessions. The web client presents them and never reimplements them, so any rule that belongs here stays here.

Stack: Node.js 24 running TypeScript directly (no build step), Express 5, MongoDB through Mongoose, zod for validation, pino for logging.

Layout: `routes` map paths to `controllers`, controllers only handle HTTP, `services` hold the rules and never import Express, `models` hold schemas and indexes. `lib` has shared helpers, `middleware` has authentication and roles.

Conventions:

- Services take `unknown` input and validate it with a zod schema from `schemas/`. Throw `AppError` for expected failures; the error handler turns it into the JSON error shape. Controllers have no try/catch, Express 5 forwards rejected promises.
- Import with the `.ts` extension. `enum`, `namespace` and constructor parameter properties are not allowed (`erasableSyntaxOnly`); use `as const` arrays and union types.
- Never return or log a password, password hash, session token or verification code. API responses go through `toPublicUser`.
- Operations that count or limit something (verification attempts, the last administrator) must stay correct under parallel requests. Use conditional atomic updates, not read-then-write.
- After changing code, `npm run typecheck`, and rebuild the container with `docker compose up -d --build`.

The API and the contract for other services are documented in `README.md`. Keep it in sync when an endpoint changes.
