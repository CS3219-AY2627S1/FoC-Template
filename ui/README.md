# CampusDash UI

React and TypeScript app built with Vite 8 and Tailwind CSS 4.

## Run locally

From this directory:

```sh
nvm use
npm ci
npm run dev
```

If you do not use nvm, use Node.js 20.19+ or 22.12+ as required by Vite.
The `.nvmrc` selects Node.js 22.22.0. Check `node --version` if startup
fails with a `node:util` / `styleText` error.

## Run with Docker

Start the backend services first (each from its own folder with
`docker compose up -d`, on ports 3001 user, 3002 supplier, 3003 order, 3004
credit). Then from `ui/`:

```sh
docker compose up -d --build
```

Open <http://localhost:8080>. Stop it with `docker compose down`.

The image is built in two stages: Node builds the app into static files, then
nginx serves them. nginx also forwards `/backend/users`, `/backend/suppliers`,
`/backend/orders` and `/backend/credits` to the services, so the browser only
ever talks to this one container. Service addresses come from the
`*_SERVICE_URL` variables and are looked up per request, so the UI still starts
if a service is down and recovers when it comes back:

- Standalone, `compose.override.yaml` (loaded automatically from this folder)
  points them at the host (`http://host.docker.internal:3001`, ...).
- In the full stack, `compose.yaml` uses service names on the internal network
  (`http://user-service:3001`, ...); the UI's port is the only one published.

Use `UI_PORT=9090` to pick a different port.

## Checks

```sh
npx tsc --noEmit
npm run build
```

Tailwind is compiled by `@tailwindcss/vite` in `vite.config.ts`.
`main.tsx` imports `index.css`, which imports Tailwind and defines the theme.
Restart the dev server after changing the Vite configuration.