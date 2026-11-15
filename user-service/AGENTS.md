<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-11-08
Scope: Notes for coding agents about open issues from the login-events work (N2H1a).
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
Scope: Removed the AWS items after the team stopped the AWS deployment.
Author review: Reviewed and approved by @t-leongchuan
-->

# User Service: notes for coding agents

Read `README.md` in this folder first ("Rules for changing this service", "Login events").
The items below are **open issues**. Do not resolve them on your own: the design decisions
belong to the service owner (@t-leongchuan). Point them out when your work touches these files.

## 1. Login rate limit and client IP

- The login speed limit lives in `frontend/nginx.conf` (`limit_req_zone ... zone=login`) and
  applies only to calls through the gateway. Keep `nginx.conf` and `vite.config.ts` routes in sync.
- **Client IP in the login log is not settled.** Express `trust proxy` is deliberately not set
  (decision deferred by the author), so behind nginx the stored IP is nginx's own address. Do not
  turn on `trust proxy` without the owner's decision: it changes which header is believed, and
  port 3001 is published, so a direct caller could forge `X-Forwarded-For`.
- Locally (Docker Desktop), all host traffic reaches nginx from one address, so every browser and
  script on the machine shares one rate-limit bucket. Demo/journey scripts that log in through
  the gateway (`order-service/scripts/demo.sh`, Supplier `api-demo` with `API_GATEWAY_BASE_URL`,
  the frontend Playwright journeys) count against it.
- The AWS deployment (PR #54) is not being pursued (team, 2026-11-10). If it is revived: its
  `frontend/nginx.cloud.conf` has neither the login-events route nor this limit, and behind a
  load balancer `$binary_remote_addr` would be one address shared by all users.

## 2. Accepted limitation: login bursts

Under a burst of simultaneous logins some requests get 503 (bcrypt cost 12 runs on Node's main
thread; the pool waits at most 500 ms for a connection). This existed before the login log; the
log adds one more database call per successful login, and if that call cannot be made the login
is refused (author's rule: no record, no login). The author accepted this for now (2026-11-08);
do not "fix" it by skipping the record or by raising the 500 ms limit (it must stay below the
other services' 1 s verification timeout). Details: README "Known limitations".
