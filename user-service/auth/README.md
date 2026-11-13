# User Auth API

This service owns Cognito registration, verification, login, refresh, logout,
password change, and admin group changes. It has no database. User profiles stay
in User Service.

## Routes

- `POST /api/auth/register`
- `POST /api/auth/verification/resend`
- `POST /api/auth/verification/confirm-and-login`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/password`
- `POST /api/auth/admin/promote` and `/api/auth/admin/demote` (superadmin only)

Login and OTP confirmation set Cognito access, ID, and refresh tokens as
HTTP-only, SameSite=Strict cookies. `COOKIE_SECURE=true` adds Secure in AWS and
local EKS; local HTTP Compose explicitly sets it to false. Access and ID cookies
use path `/`; the refresh cookie is scoped to `/api/auth`. Cognito access and
ID tokens are configured for 15 minutes.

Other services import `@relay/user-auth-backend-middleware` and verify Cognito tokens locally with `aws-jwt-verify`.

HTTPS is required for Secure cookies outside localhost.

Locally verified access tokens remain usable until their 15-minute expiry after
logout, password change, account deletion, or role change. Cognito revocation
stops refresh. A shared revocation store or shorter TTL would be needed for
immediate invalidation.

## Runtime and development

Run `npm ci` once, then `npm run up:compose` or `npm run dev` from the repository
root. Both use the containerized Auth API on localhost:3004 and the host's
`/api/auth` proxy. Floci provisions the local pool, client, groups, and bootstrap
admin; AWS uses the auth CloudFormation stack. See the
[local guide](../../floci/README.md) and [AWS guide](../../deploy/README.md).

Configure the pool/client, Cognito endpoint and issuer/JWKS, region, group names,
`COOKIE_SECURE`, and `AUTH_PUBLIC_ORIGIN` for the deployment. Browser mutation
routes enforce the configured origin (or forwarded host/protocol when unset);
requests without an Origin header are allowed for non-browser clients.

The service also runs a Kafka `UserDeleted` consumer in group
`relay-auth-user-events`, retrying Cognito cleanup asynchronously. Configure its
user-events/DLQ topics and broker connection. It has no database, but Kafka is a
runtime dependency for that cleanup. New groups start at the current topic tail.

```bash
npm run lint --workspace=@relay/user-auth-backend
npm run test --workspace=@relay/user-auth-backend
npm run build --workspace=@relay/user-auth-backend
```
