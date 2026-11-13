# web-client

The browser client of Relay (Friend on Campus): a React app, served by an nginx container that is also the gateway to the services. It presents what the services answer and owns no domain rules.

Before you change anything, read `AGENTS.md` (rules, your files, templates) and `DESIGN.md` (the design system).

## Stack

React 19, React Router 8 (data mode), TanStack Query 5, Vite 8, TypeScript 6, Tailwind CSS 4 with our own theme, oxlint, lucide-react icons. nginx (unprivileged image) serves the build and forwards `/api/<service>/...` to the services.

## Running it

| What | Command | URL |
| --- | --- | --- |
| Everything, as built images | `docker compose up --build` in the repository root | http://localhost:8080 |
| Development with live reload | the line above, then `npm install` and `npm run dev` in `web-client/` | http://localhost:5173 |

Development needs Node 24 or newer; run `npm ci` after pulling to install exactly the locked packages. Develop on :5173. Vite forwards every `/api` request to the gateway on :8080, so development and production take the same path to the services. The gateway container must be running for that. :8080 shows the state of the last image build; after changing anything under `nginx/`, run `docker compose up --build -d web-client`.

| Script | Does |
| --- | --- |
| `npm run dev` | dev server with hot reload on :5173 |
| `npm run build` | type check, then the production build into `dist/` |
| `npm run lint` | oxlint, including the import rules between areas |
| `npm run preview` | serves `dist/` locally, without the gateway |

## Logging in before the login screen exists

The login page is still a placeholder. Log in from the browser console on :5173 (Chrome asks you to type "allow pasting" first):

```js
await fetch('/api/user/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: '<username or email>', password: '<password>' }) }); location.reload()
```

The first administrator is described in the root `README.md`. No real emails are sent locally: they all land in Mailpit, and the verify page links there while `DEV_MAILBOX_URL` is set (compose sets it to http://localhost:8025; set it to empty wherever real emails go out). For an account without the administrator role, register it through the gateway (`POST /api/user/auth/register`), take the six-digit code from Mailpit on http://localhost:8025 and send it to `POST /api/user/auth/verify`. The Postman collection in `postman/` does the same with `userServiceUrl` set to `http://localhost:8080/api/user`.

Log out with `await fetch('/api/user/auth/logout', { method: 'POST' })` or the "Log out" entry in the app.

If the administrator login fails, check `ADMIN_PASSWORD` in your `.env`, or reset the local data with `docker compose down -v` (this deletes every local account).

## Running your own service on your machine

To work on a service outside Docker while the web client keeps using it, point the gateway at your machine in a `compose.override.yaml` next to `compose.yaml`. Do not commit that file.

```yaml
services:
  web-client:
    environment:
      SUPPLIER_SERVICE_URL: http://host.docker.internal:3002
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then stop the container of your service (`docker compose stop supplier-service`), start your service on that port and run `docker compose up -d web-client`.

## The gateway

| Path | Goes to |
| --- | --- |
| `/healthz` | 200, used by the compose healthcheck |
| `/api/config` | settings for the app from this container's environment, for now `DEV_MAILBOX_URL` |
| `/api/user/(auth\|users)/...` | `USER_SERVICE_URL`, without the `/api/user` prefix |
| `/api/supplier/suppliers/...` | `SUPPLIER_SERVICE_URL`, without the `/api/supplier` prefix |
| any other `/api/...` | 404 as JSON. `/internal/*` and `/health` of the services stay unreachable. |
| everything else | `index.html`, React Router picks the page |

`nginx/templates/default.conf.template` holds the server. Each service has its own file in `nginx/templates/routes/`. The service addresses come from environment variables read when the container starts, so one image runs in every environment. How to add a service: "Gateway route for a new service" in `AGENTS.md`. Why it is built this way: `../docs/decisions/0002-web-client-gateway.md`.

## Troubleshooting

| You see | Usually |
| --- | --- |
| `SERVICE_UNAVAILABLE` (503) in the app | the service container is stopped or still starting. `docker compose ps` shows it. |
| 502 on :5173 for every `/api` call | the gateway on :8080 is not running. Start it with `docker compose up -d web-client`. |
| 404 JSON for a path your service has | the path is not listed in its file in `nginx/templates/routes/`, or the container was not rebuilt after you added it |
| the web-client container restarts | a route file uses a variable that `compose.yaml` does not set. `docker compose logs web-client` names it. |
| a red outline and a console warning | something is wider than the screen. The warning names the element (N5.1). |
| an import error from `npm run lint` | an import crosses an area boundary. The message says what to import instead. |

## Declaration of AI-assisted work

This section covers the foundation (gateway, routing, data layer, design system, layout) and the user and admin screens. The other screens are declared by the teammates who built them.

**Tool:** Claude Code (Claude Opus and Sonnet models).

**How Claude was used:**

- **Explain:** Claude was used to explain React Router, TanStack Query, Tailwind and the nginx configuration while the first steps of the foundation were typed by hand.
- **Generate:** Once the patterns were established, Claude was used to write the remaining steps and the user and admin screens from a step-by-step plan. Each step became one commit, which was tested and committed by hand.
- **Check:** Claude was used to run the build and lint and to check the pages in a browser at 320 and 393 px before each commit. Each page was then tested by hand.
- **Document:** Claude was used to help write this README, `AGENTS.md` and `DESIGN.md`.

**Decisions:** The architecture (one gateway origin, no domain rules in the client) and the design system were decided by the team, not by Claude. They are recorded in `docs/decisions/0002-web-client-gateway.md` and `DESIGN.md`.

**Review:** Every change was reviewed and tested before it was committed. `AGENTS.md` holds the rules that both teammates and coding agents follow in this folder.
