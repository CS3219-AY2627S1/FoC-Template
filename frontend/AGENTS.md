# Frontend conventions

Use these conventions to keep frontend structure consistent. Let the task and
existing code guide implementation details.

## Cross-repository context

FoC is a monorepo. Inspect the available service code for API contracts,
validation, and authentication behavior when integrating the frontend.

## Feature ownership

Feature code belongs under `src/features/<feature>/`.

| Feature     | Owns                                                          |
| ----------- | ------------------------------------------------------------- |
| `auth`      | Session flows and the current user's profile/account settings |
| `orders`    | Requestor and courier home screens and request flows          |
| `suppliers` | Supplier listing and management for both users and admins     |
| `credits`   | Credit balance and history once the backend exposes an API    |

Requestor and courier are modes of one `USER` account. `ADMIN` is a separate role.

## Code placement

Use the same standard folder names at both levels. The folder describes the
responsibility. Its location determines the scope:

- `src/<folder>/` holds application-wide or shared code.
- `src/features/<feature>/<folder>/` holds code owned by that feature.

Keep domain-specific code in its feature. Place code designed for reuse across
features at the shared level.

| Folder        | Under `src/`                                          | Under `src/features/<feature>/`                |
| ------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `pages/`      | Screens without a feature owner, such as NotFound     | Feature route screens, such as RegisterPage    |
| `components/` | Reusable UI, such as Button, Accordion, and Checkbox  | Feature-specific UI pieces                     |
| `layouts/`    | Shared page structure, such as user and admin layouts | Feature-specific page structure                |
| `hooks/`      | Shared React hooks                                    | Feature hooks and TanStack Query orchestration |
| `api/`        | Backend adapters with no single feature owner         | Feature backend adapters                       |
| `utils/`      | Shared helper functions                               | Feature-specific helpers and non-React logic   |
| `schemas/`    | —                                                     | Feature validation schemas                     |
| `types/`      | Shared types                                          | Feature types                                  |
| `lib/`        | Shared clients and library integrations               | Integrations used only by the feature          |

Use `.api.ts`, `.schema.ts`, and `.types.ts` suffixes at either level, such as
`api/registerUser.api.ts` and `schemas/register.schema.ts`. Infer schema-backed
types from Zod.

Shared code should remain independent of features.

Utilities may have side effects, including browser API interactions.

## Layouts

Layouts arrange headers, sidebars, and page content. Define them in `layouts/`
and apply them through `routes.tsx`.

| Audience          | Header and sidebar                                   |
| ----------------- | ---------------------------------------------------- |
| Signed-in `USER`  | Top header shared across requestor and courier modes |
| Signed-in `ADMIN` | Admin sidebar                                        |
| Auth screens      | No signed-in header or sidebar                       |

## Data boundaries

- Use TanStack Query through custom hooks in `hooks/`.
- Keep HTTP calls in `api/` adapters using the shared Axios client and relative
  API paths.
- Keep temporary mock data inside its owning feature.

## UI and styling

Use Base UI with Sass.

Build shared components with focused, extensible APIs using composition,
relevant Base UI props, and styling hooks.

| Style scope                           | Placement                                             |
| ------------------------------------- | ----------------------------------------------------- |
| Global tokens, reset, and base styles | `src/styles/`, composed through `index.scss`          |
| Feature or component styles           | Beside the UI they style, such as `RegisterForm.scss` |
