## What

<!-- What does this PR change, and in which service? -->

## Why

<!-- Link the backlog item(s), e.g. Supplier F4.1 -->

## How to test

<!-- Commands, endpoints or UI steps a reviewer can follow -->

## Checklist

- [ ] Follows [AGENTS.md](../AGENTS.md) (folder layout, API conventions, runtime contract)
- [ ] Every new or changed endpoint is documented in OpenAPI (`@Operation` summary, parameters, responses)
- [ ] Tests added/updated; `./mvnw verify` (or `npm run lint`) passes locally
- [ ] New env vars documented in `.env.example`
- [ ] No secrets or key files committed
