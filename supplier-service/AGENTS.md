# supplier-service

See ../AGENTS.md for repository-wide rules.

This service owns the domain rules for the campus supplier catalogue. The web client presents them and never reimplements them, so any rule that belongs here stays here.

Stack: TypeScript on Node 24, Fastify, PostgreSQL through `pg`. Node runs the
`.ts` files directly by stripping the types, so there is no build step and the
code must stay erasable: no enums, no namespaces, no constructor parameter
properties. There is no ORM, no test runner package and no linter. Tests use
`node:test`, and `tsc` only checks types.

Read `README.md` for the schema, the API and how authorization works.

Who may do what is decided by the user-service, never here. Do not decide access
from a token or a cookie, and do not keep a copy of roles. Ask through
`src/auth.ts`, which calls `POST /internal/authorize` as described in
`user-service/README.md`, and do it before the route reads the body or touches the
database. The role each operation needs (`member` or `administrator`, F1.5.4) is
kept in `src/auth.ts`.

`dev/fake-user-service.ts` fakes that endpoint for the automated tests. It is not
part of the compose stack or the image, so the demo and the running system use the
real user-service.

Before you call it done, run `npm run typecheck` and `npm test`. The API tests
need the database from `docker compose up -d supplier-db` and skip themselves
without one, so a green run with skipped tests has not exercised the SQL.

The service is stateless apart from two short in-memory caches (`src/cache.ts`).
Keep it that way, and never cache a write, a refusal or an availability answer.
