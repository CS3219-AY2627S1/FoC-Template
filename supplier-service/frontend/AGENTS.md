# Supplier frontend

## Design and API sources

- Apply the root [product design contract](../../design.md) for the shared shell, foundations and
  cross-service journeys. Use the service-specific sources below for Supplier behavior and detail.
- Before implementing screens, inspect relevant desktop/mobile/component Figma nodes from
  [design sources](docs/design-source.md). Preserve the visual language; document material
  adaptations for API fit, accessibility or usability. Edit Figma only when explicitly requested.
- Use the running OpenAPI contract and Supplier README for fields/behavior, including building,
  optional details/hours, status and optimistic-lock versions. Draft forms do not define the API.
- Reuse local tokens/components in one responsive component tree. Store required Figma assets
  locally; expiring asset URLs must not remain in production code.

## Architecture and checks

- Use the shared typed API client and TanStack Query; share public/admin components where
  behavior matches. Do not hand-write generated contracts.
- UI guards support navigation only; backend authorization is authoritative. Never trust fake
  roles, browser admin flags or simulated JWT claims.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` here.
- After a Supplier OpenAPI change, run `npm run api:generate` against the running gateway contract
  at `http://localhost:8088/docs/supplier/openapi.json`. Review the generated
  `src/api/schema.d.ts` diff with its backend change; never hand-edit it.
- Manually check affected flows at 375px and desktop, including keyboard/focus, reduced motion,
  validation/error feedback, and affected-route regressions.
