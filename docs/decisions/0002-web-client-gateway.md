# 2. The web-client container is the gateway to the services

- Status: proposed, accepted with the merge of REL-178
- Date: 2026-10-18
- Scope: web-client, and every service the browser talks to

## Context

The browser client has to call four services, and it has to find them without anyone writing a service address into the code. The backlog and ADR 0001 add constraints:

- N6.2: each service runs from one image, unchanged, locally and in the cloud, with environment-specific values supplied at start. The web client is a container too, so its image cannot carry addresses that differ between environments.
- N6.1.2: every other service keeps running and reachable while the container of one service is replaced or restarted.
- ADR 0001: the session token is an HttpOnly, SameSite=Lax cookie set by the user-service, and `POST /internal/authorize` must not be reachable from outside before the cloud deployment.
- N5.4: the client shows the reason a refused action gives, so error answers have to reach it intact.

No service sends CORS headers today. A page on one origin that calls a service on another origin is refused by the browser. Sending the session cookie with such a call would need CORS with credentials in every service, and `SameSite=None` as soon as the client and a service sit on different sites.

## Decision

The web client is served by an nginx container, and that container is also the only entry point for the browser. The browser calls relative paths only: `/` and the assets for the app, `/api/<service>/<path>` for data. Each service has a short name (`user`, `supplier`, `order`, `credit`) that is the same in the URL prefix, the source folders, the gateway file and the environment variable.

- nginx forwards `/api/<service>/<path>` to the service and removes the prefix, so `/api/user/users/me` reaches the user-service as `/users/me`. Each service has one file in `web-client/nginx/templates/routes/` that lists the top-level paths the browser may reach.
- Every other path under `/api/` gets a 404 as JSON. `/internal/*` and the services' own `/health` are therefore never reachable through the gateway.
- The service addresses are environment variables (`USER_SERVICE_URL`, `SUPPLIER_SERVICE_URL`, ...) that the nginx image writes into its configuration when the container starts. Compose sets them for the compose network, Kubernetes will set them to cluster DNS names.
- nginx looks the address up while it runs, caching the answer for 10 seconds, instead of once at start-up. A service that is down or being replaced does not stop the web client from starting, and a request to it gets a 503 as JSON (`SERVICE_UNAVAILABLE`) instead of a hanging connection.
- Anything that is not an API path or a file gets `index.html`, and React Router picks the page.

In development, Vite's dev server forwards `/api` to the same gateway container, so development and production take the same path to the services.

## Alternatives considered

Service addresses built into the client (`VITE_USER_SERVICE_URL` and similar). The addresses would be fixed in the JavaScript bundle at build time, so every environment would need its own image, which contradicts N6.2. Every call would cross origins, so each service would need CORS with credentials. Once the client and the services sit on different sites, the session cookie would also need `SameSite=None`, which Safari and Firefox block as a third-party cookie.

Discovery on the client: a `/config.json` that the container fills with the service addresses at start, read by the app before its first request. This solves the image problem but keeps every CORS and cookie problem, and it shows the browser the internal topology of the system.

A separate gateway container, or an Ingress in front of everything, from the start. It would do the same routing with one more deployable, and there is no cluster yet to put an Ingress into. The browser paths stay the same if the routing moves there later.

CORS in every service with the current origin. Each service would carry configuration for a concern it does not own, a mistake in one of them would break the login cookie, and the problems of the two options above would remain.

## Consequences

The browser only ever talks to its own origin. There is no CORS anywhere, the session cookie stays first-party and HttpOnly, and no service address appears in the client.

A service that wants to be reachable from the browser needs two things in the web client's area: its route file and its environment variable in `compose.yaml` and `.env.example`. A route file whose variable is missing stops nginx from starting, so the mistake shows up at once. `web-client/AGENTS.md` describes the steps.

The web-client container is on the path of every browser request. It holds no state, so it can run as several instances behind a load balancer like any service. In Kubernetes it becomes a Deployment with a Service, the variables point to cluster DNS names such as `http://user-service.<namespace>.svc.cluster.local:3000` (fully qualified, because nginx's resolver does not use search domains), and an Ingress or Gateway API route in front sends all traffic to it. The client does not change for that.

Server-sent events for live updates (N7) can take the same path later, as `/api/events` with buffering turned off for that location.

`/internal/authorize` is closed for the browser by this decision, but the user-service still publishes port 3001 on the host for local development. That port has to stay unpublished in the cloud deployment, as ADR 0001 already notes.

### Error format the client expects

The client reads errors in the shape the user-service already uses, and the gateway answers in the same shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "One or more fields are invalid",
             "details": { "fields": { "email": ["must end with @u.nus.edu or @nus.edu.sg"] } } } }
```

`message` is shown to the user as it is. 401 means there is no valid session, 403 that the account is logged in but may not do this, 503 that a dependency is down. This is proposed as the shape for every service. The supplier-service currently sends field errors as a `fields` array and answers 403 for an ended session and for an unreachable user-service; the client handles both shapes until it is aligned.
