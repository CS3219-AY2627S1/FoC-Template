# Relay host frontend

The React/TypeScript host provides the application shell, navigation, sign-in,
session refresh, and runtime loading of the four microfrontends. It uses Vite,
React Compiler, Tailwind, and the Module Federation runtime.

## Run locally

Run commands from the repository root with Node.js 24 and Docker available:

```bash
npm ci
npm run dev
```

Open http://localhost:8080. This starts infrastructure and the host, remotes,
APIs, notifications, and event publishers. Authentication runs in Compose.
For a complete container deployment instead, use `npm run up:compose`.
See the [local environment guide](../floci/README.md) for setup and cleanup.

To run only the host after its dependencies are running:

```bash
npm run dev --workspace=@relay/host
```

## Remote loading and routing

`src/remote/RemoteRegistry.ts` registers these same-origin remote entries,
each exposing `./App`:

| Remote | Entry | Source-development port |
| --- | --- | --- |
| Supplier | `/remotes/supplier/remoteEntry.js` | 5001 |
| User | `/remotes/user/remoteEntry.js` | 5002 |
| Errand | `/remotes/errand/remoteEntry.js` | 5003 |
| Credit | `/remotes/credit/remoteEntry.js` | 5004 |

`vite.config.ts` proxies remote paths and `/api/*` to the corresponding local
services. The source API ports are Supplier 3000, User 3001, Errand 3002,
Credit 3003, Auth 3004, and Notifications 3010. Estimation is internal and is
called by Errand rather than the browser.

In Compose, `config/nginx.conf` serves the built host and proxies remotes and
APIs through port 8080. In AWS and Floci EKS, ingress routes remotes and public
APIs directly to their Services; the host serves the remaining frontend paths.
Use the shared `@relay/user-auth-frontend-fetch` helper for protected requests
so simultaneous requests share session refresh.

## Checks

```bash
npm run lint --workspace=@relay/host
npm run test --workspace=@relay/host
npm run build --workspace=@relay/host
```

The Dockerfile builds static assets and serves them with Nginx. `/healthz`
checks the host only; it does not establish that the APIs, authentication, or
remote frontends are healthy.
