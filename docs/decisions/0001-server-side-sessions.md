# 1. Server-side sessions instead of JWTs

- Status: accepted
- Date: 2026-09-24
- Scope: user-service and every service that checks access

## Context

Every service in the platform needs to know who sent a request and whether that account may perform the operation. The backlog puts the user-service in charge of this:

- N1.1: the user-service decides every authorization question, so no other component grants access on its own.
- F1.5.3: it answers an authorization request with authorized only when the account is Active and holds a permitting role, and changes no data on a denial.
- F1.6.8: suspending an account ends every session of that account.
- N1.3: a session becomes unusable after 7 days without use and after 30 days in every case.
- N1.2: credentials cannot be recovered from stored data, logs or error output.

The two common approaches are a signed token that every service verifies on its own (JWT) and an opaque token that the issuing service looks up (server-side session).

## Decision

The user-service issues an opaque session token at login: 32 random bytes, sent to the browser as an HttpOnly, SameSite=Lax cookie. The token carries no data. The database stores only its SHA-256 hash together with the account id, the creation time, the time of last use and the resulting expiry. A TTL index removes expired sessions.

Every protected request is checked against the database. The account and its roles are read fresh each time, so a role change or a suspension applies to the next request.

Other services do not inspect the token. They forward it to `POST /internal/authorize` together with the role their operation needs and proceed only on `authorized`. Which role an operation needs is decided by the service that owns the operation, following the platform rule in F1.5.4. The user-service decides whether the account is logged in, Active and holds that role. A timeout or error counts as denied.

## Alternatives considered

JWT verified by each service. Each service would read the roles from the token and decide on its own, which contradicts N1.1. A JWT stays valid until it expires, so a suspension (F1.6.8) or a revoked role would only take effect after the token runs out; with the 30-day sessions of N1.3 that is far too long. The usual remedy is a short-lived access token plus a refresh token stored on the server, which brings back a database lookup for revocation and adds a refresh flow to the web client and key handling to every service.

Keeping the mapping from operation to role inside the user-service. This would make the user-service change whenever another service adds an endpoint, and it cannot decide rules that depend on another service's data, such as whether an account is the requester of a given errand. The calling service therefore names the role, and the user-service only answers for identity, state and roles.

## Consequences

Every protected request costs two indexed reads in the user-service's database. Measured on a laptop with one instance and 100 concurrent connections, `GET /users/me` handled about 7,300 requests per second with a median latency of 13 ms, compared with about 42,500 for an endpoint without database access. This is well above the expected load of the platform. The time of last use is written at most once a minute per session, so reads do not turn into writes.

Ending a session, suspending an account or changing a role takes effect immediately, without a blocklist.

The user-service is on the path of every protected request. Other services must fail closed when it is unreachable (N1.1.2). If it becomes a bottleneck, it can run as several instances because it keeps no state in memory, and callers can cache a decision for a few seconds at the cost of that delay before a revocation applies.

`/internal/authorize` is reachable through the user-service's public port during local development. Before the cloud deployment it has to be restricted to the internal network or placed behind a gateway.
