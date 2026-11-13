# Relay User Service backend

Profile-management API backed by PostgreSQL/Prisma, with S3 profile pictures.
Public routes verify Cognito access and ID cookies through
`@relay/user-auth-backend-middleware`. Floci supplies Cognito locally; AWS uses
the deployed user pool. `AUTH_MODE` selects the Cognito account-management
adapter; it does not replace authentication on the public routes.

## Development

From the repository root, run `npm ci` once, then `npm run dev` with Docker
running. The launcher supplies generated database, Cognito, S3, and Kafka
settings, prepares schemas, and starts the User API on port 3001 with its
separate event publisher. Use http://localhost:8080 for browser requests.
See the [local guide](../../floci/README.md).

For a full container deployment, use `npm run up:compose`. Do not rely on the
example `.env` alone: Floci database ports, credentials, and resource IDs are
discovered during startup. Prisma generates this service's client into
`packages/user-prisma/generated`.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/user/check-auth` | Check the authenticated identity |
| GET | `/api/user/me` | Read the current profile |
| PATCH | `/api/user/me` | Create or update the profile |
| DELETE | `/api/user/me` | Delete the profile and request account cleanup |

Internal `GET /internal/user/profile/:sub` and
`GET /internal/user/deletion-status/:sub` require the matching
`INTERNAL_USER_SERVICE_TOKEN`. Profile-picture updates are handled by the
profile update flow; there is no separate session-validation endpoint.

## Events and deletion

The first successful profile creation writes a version 1 `UserRegistered`
envelope to the PostgreSQL outbox in the same transaction. The separate
`user-event-publisher` sends it to `KAFKA_TOPIC_USER_EVENTS`, with
`payload: { cognitoSub }`, and marks it published after broker acknowledgement.
Credit consumes it to allocate 100 credits exactly once. Broker addresses come
from Floci discovery locally and MSK discovery on AWS, rather than a standalone
Compose Kafka service. Published outbox rows older than seven days are cleaned
up every minute; unpublished rows remain for retry.

Profile deletion removes the profile and writes `UserDeleted` transactionally,
including the optional profile-picture key. The User API's cleanup consumer
removes the S3 object asynchronously. Cognito deletion is attempted after the
transaction; a temporary failure returns HTTP 202 with
`{ data: { status: "pending" } }`, and the Auth API consumer retries it.
Repeated deletion remains pending while its deletion event remains in the
outbox. Errand and Credit consume the same event to resolve errands and close
the credit account. New cleanup consumer groups begin at the current Kafka
tail, so historical deletions need explicit backfill.

## Checks

From the repository root, after setting the required test database and broker
configuration:

```bash
npm run lint --workspace=@relay/user-backend
npm run test --workspace=@relay/user-backend
npm run build --workspace=@relay/user-backend
```

The test script builds, applies migrations, and runs Vitest and Node integration
tests. Its database defaults are test fallbacks, not Floci's discovered endpoints.
Use `USER_TEST_DATABASE_URL` and `KAFKA_BROKERS` for the intended environment.
