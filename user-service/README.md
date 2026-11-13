# user-service

Owns user accounts, registration with email verification, login sessions and roles. It is the only component that decides authorization questions (N1.1). Every other service calls its authorization endpoint.

Node.js 24, TypeScript, Express 5, MongoDB (Mongoose)

## Running

From the repository root, `docker compose up --build` starts the service on http://localhost:3001 together with its database and Mailpit (http://localhost:8025, catches every email locally for development).

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port inside the container (default 3000) |
| `LOG_LEVEL` | pino log level (default `info`) |
| `MONGO_URL` | MongoDB connection string |
| `BROKER_URL` | RabbitMQ connection string, for announcing accounts |
| `OTP_SECRET` | Key for hashing verification codes, at least 32 characters |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email |
| `COOKIE_SECURE` | Send the session cookie over HTTPS only (default true, false in compose for local HTTP) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME` | First administrator, created at start-up when none exists (F1.5.6) |
| `SEED_DEMO_STUDENTS`, `SEED_DEMO_PASSWORD` | When `true`, creates the Active demo students `alice.tan`, `ben.lim`, `chloe.ng` and `daniel.koh` (`<username>@u.nus.edu`) at start-up, all with this password and announced like verified accounts. Existing accounts are left as they are. Off by default; on in `compose.yaml` and the cloud |

## API

All errors have the shape `{ "error": { "code": "...", "message": "...", "details": { ... } } }`. Validation errors list every invalid field in `details.fields`.

| Method | Path | Access | Requirement |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | F1.1.1 to F1.1.6 |
| POST | `/auth/verify` | public | F1.1.5, F1.1.8 |
| POST | `/auth/verify/resend` | public | F1.1.9 |
| POST | `/auth/login` | public | F1.3.1 to F1.3.4 |
| POST | `/auth/logout` | session | |
| GET, PATCH | `/users/me` | session | F1.4.3 |
| PUT | `/users/me/password` | session | F1.4.3 |
| GET | `/users`, `/users/:id` | administrator | F1.4.1, F5.5.1 (`/users?q=&state=` searches name, username, email or exact id), F1.6.2 (`/users/:id` adds `stateChanges`, newest first) |
| PATCH, DELETE | `/users/:id` | administrator | F1.4.2, F1.4.4 |
| PUT, DELETE | `/users/:id/roles/administrator` | administrator | F1.5.5 |
| PUT | `/users/:id/state` | administrator | F1.6.2 |
| POST | `/reports` | session | F1.6.3, F1.6.4 |
| GET | `/reports`, `/reports/:id` | administrator | F1.6.5, F5.5.4 (`/reports?state=&reportedId=`, newest first) |
| POST | `/reports/:id/decision` | administrator | F1.6.6, F1.6.7 |
| POST | `/internal/authorize` | other services | F1.5.3 |
| GET | `/health` | public | |

## Announcing accounts

Every account that becomes Active, by verifying its email or as the first administrator, is announced to the Credit Service as the event `user.account.activated` (F1.1.7). The announcement is written into the account document in the same update that activates it. A relay publishes pending announcements every second and marks one sent only after RabbitMQ has stored it in a queue, so a repetition always carries the same `eventId`. While the broker is down or the credit-service has not declared its queue yet, announcements wait and the service keeps working. `GET /health` shows whether the broker is connected.

The event and the rules for consuming it are in [`docs/events.md`](../docs/events.md).

## Sessions

Logging in sets the cookie `relay_session` (HttpOnly, SameSite=Lax). The token is opaque: it carries no data, and the service stores only its SHA-256 hash. A session ends after 7 days without use and after 30 days in any case (N1.3), on logout, and when the password changes (except the session that changed it).

Sessions are server-side on purpose, not JWTs: a session can be ended at once, and role changes apply on the next request.

## Account states and reports

An account is `PendingVerification`, `Active` or `Suspended` (F1.6.1). Only an administrator moves an Active account to Suspended or back, with `PUT /users/:id/state` and a reason of 20 to 500 characters (F1.6.2):

```json
{ "state": "Suspended", "reason": "Did not deliver three accepted errands" }
```

Each change is recorded with the administrator, the reason and the time. `GET /users/:id` returns them as `stateChanges`, newest first. Suspending an account ends all its sessions at once (F1.6.8), so after a reinstatement it has to log in again.

| Status | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | The reason is not 20 to 500 characters, or the state is neither `Active` nor `Suspended`. |
| 409 | `INVALID_STATE_CHANGE` | The account is not in the state the change starts from, for example still `PendingVerification`. |
| 409 | `OWN_ACCOUNT` | An administrator tries to change their own account. |
| 409 | `LAST_ADMINISTRATOR` | No Active administrator would be left. |

Any logged-in account can report another one with `POST /reports` (F1.6.3):

```json
{ "reportedId": "<account id>", "errandId": "42", "reason": "Took the food and never delivered it" }
```

The answer is `201` with the report in state `Open`. A refusal names the field (F1.6.4): `reason` when it is not 20 to 500 characters, `reportedId` when it is the reporter's own account or does not exist, and `errandId` when the same reporter already reported this errand. A unique index on reporter and errand enforces the last rule even for parallel requests. The user-service then asks the order-service for the errand (`GET /internal/orders/:id`): `errandId` is refused when the errand does not exist or the two accounts were not its requester and courier, in either order. When the order-service does not answer within 2 seconds, the report is refused with `503 ORDER_SERVICE_UNAVAILABLE`.

Administrators list reports with `GET /reports?state=&reportedId=&page=&pageSize=`, newest first, and read one with `GET /reports/:id` (F1.6.5, F5.5.4). Accounts appear as `{ id, fullName, username, state }`, or as `null` once deleted:

```json
{
  "id": "<uuid>",
  "reporter": { "id": "<uuid>", "fullName": "Alice Tan", "username": "alice", "state": "Active" },
  "reported": { "id": "<uuid>", "fullName": "Bob Lim", "username": "bob", "state": "Suspended" },
  "errandId": "42",
  "reason": "Took the food and never delivered it",
  "state": "Actioned",
  "filedAt": "2026-10-24T03:12:45.000Z",
  "decision": { "by": { "id": "<uuid>", "fullName": "admin", "username": "admin", "state": "Active" }, "justification": "Chat log confirms the errand was never delivered", "decidedAt": "2026-10-24T05:30:00.000Z" }
}
```

`POST /reports/:id/decision` with `{ "outcome": "Dismissed" | "Actioned", "justification": "..." }` decides an Open report, again with 20 to 500 characters (F1.6.6, F1.6.7). `Actioned` also suspends the reported account as above, with the justification as reason. An account that is already Suspended stays as it is. A decided report answers `409 REPORT_ALREADY_DECIDED`, and a refused suspension (`OWN_ACCOUNT`, `LAST_ADMINISTRATOR`) leaves the report Open.

The database of this service is a single MongoDB without a replica set, so there are no transactions across documents. Every change is a conditional update on the state it starts from (`state: "Open"`, `state: "Active"`), so of two parallel requests exactly one applies. When a later step is refused, the first one is undone, the same way as when the administrator role is revoked.

`GET /users?q=&state=` searches part of a full name, username or email address, or an exact account id (F5.5.1). The search is plain text, not a pattern, and uses no index, which is fine for the accounts of one campus.

## Authorizing requests in another service

Every other service checks access by asking this service.

1. Read the `relay_session` cookie from the incoming request.
2. Decide which role your operation needs. The platform rule is F1.5.4: `administrator` for listing, editing or deleting other accounts, suspending accounts, changing roles, deciding reports, resolving disputes and creating, updating or deactivating suppliers; `member` for everything else. Each service keeps this mapping for its own routes.
3. Call the user-service:

   ```
   POST http://user-service:3000/internal/authorize
   { "token": "<cookie value>", "requiredRole": "administrator" }
   ```

   `requiredRole` is `member` or `administrator` and defaults to `member`.

4. Handle the answer:

   ```
   200 { "decision": "authorized", "accountId": "<uuid>", "roles": ["member", "administrator"] }
   200 { "decision": "denied" }
   ```

   Proceed only on `authorized`. Use `accountId` to record who acted.

5. Fail closed (N1.1.2). A timeout, a network error, a non-200 status or any other answer means denied. Use a short timeout (about 2 seconds).

Answer a denied request with 403 and do not tell the caller whether the object it asked for exists (N1.1.1). Check the role before you look anything up.

"Requester" and "courier" are not roles (F1.5.2). Whether an account may act on a given errand is decided by the order-service from its own data, after the user-service has confirmed the account is logged in and Active.

Example for an Express service:

```ts
export function requireRole(role: "member" | "administrator"): RequestHandler {
    return async (req, res, next) => {
        try {
            const response = await fetch(`${USER_SERVICE_URL}/internal/authorize`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ token: req.cookies?.relay_session, requiredRole: role }),
                signal: AbortSignal.timeout(2000),
            });
            const result = await response.json();
            if (response.ok && result.decision === "authorized") {
                res.locals.accountId = result.accountId;
                return next();
            }
        } catch {
            // Timeout or user-service down: fall through to deny (N1.1.2).
        }
        res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to do this" } });
    };
}
```

Inside the compose network the service is reachable as `http://user-service:3000`. Put that address in your service's configuration, not in code.

## Declaration of AI-assisted work

**Tool:** Claude Code (Claude Opus and Sonnet models).

**How Claude was used:**

- **Explain:** Claude was used to explain Express, Mongoose, sessions and email verification while the first version of the service was built by hand for D2.
- **Generate:** Claude was used to write the code for the later features (account states, reports, user search), one step at a time from a step-by-step plan. Every step was tested and committed by hand.
- **Debug and test:** Claude was used to find bugs and to write the tests in `test/` and the Postman collection.
- **Document:** Claude was used to help word this README.

**Decisions:** The service's responsibilities, its API and the authorization contract were decided by the team, not by Claude. Where Claude suggested options, the choice was made by the team. The choices are recorded in `docs/decisions/0001-server-side-sessions.md`.

**Review:** All AI-written code was reviewed, run and tested before it was committed. The rules given to the agent are in `AGENTS.md`.
