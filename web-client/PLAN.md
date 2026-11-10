# Responsive Sprint 1 Web Client

## Goal

Build the FoC web client as a React, Vite, and TypeScript application with
first-class desktop and mobile layouts. It implements only User Service Sprint
1 flows: registration, email OTP verification, session management, self-owned
profile updates, logout, and confirmed deletion.

## Design and scope

- Match the Figma desktop Profile & Security frame at 1440px and mobile account
  frame at 375px. Use Inter, `#F7F8FC`, `#FFFFFF`, `#0B4F87`, `#33506E`,
  `#718196`, `#E6EBF2`, and `#A95000`.
- Desktop uses an FoC account rail, context bar, profile card, and separated
  danger zone. Mobile uses a stacked account surface. Tablet preserves the
  desktop hierarchy with fluid widths.
- Do not add Supplier, Errand, Wallet, Credit, Message, or administration
  routes, API calls, metrics, or placeholder UI.
- Keep access tokens in memory. Use only the FoC User Service through `/v1`;
  never expose Supabase values or service credentials to the browser.

## Container integration

- `Dockerfile` builds static assets in a Node stage and serves only `dist/`
  from an Nginx runtime image.
- `nginx/default.conf` proxies the present catch-all `location /v1/` to
  `http://user-service:8000` without a trailing slash, preserving request URIs.
  The SPA fallback is `try_files $uri $uri/ /index.html`.
- `user-service/compose.yaml` runs Web Client on `3000:80` after User Service
  becomes healthy. It preserves User Service's existing host port and adds no
  CORS or backend endpoints.

## Validation

- Run `npm ci`, `npm run build`, `npm test`, and `npm run test:e2e` after the
  browser runtime is installed.
- Verify mobile, tablet, and desktop at 375×812, 768×1024, 1024×768, and
  1440×1024.
- With `docker compose up --build` running from `user-service/`, confirm an
  SPA deep-link resolves to `index.html`, static files resolve normally, and
  `/v1/users/me` returns User Service's unauthenticated response rather than
  SPA HTML. Smoke-test registration through Mailpit, OTP verification, login,
  profile updates, refresh, logout, and deletion.

## Future routing

`/v1/` remains a temporary catch-all while User Service owns every available
public API. Once another service has a real agreed contract, add a more
specific unchanged-path location such as `/v1/orders/`; Nginx selects that over
the current catch-all. Reconsider an API gateway or BFF if this routing grows
complex.
