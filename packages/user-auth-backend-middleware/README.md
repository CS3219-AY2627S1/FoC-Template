# Backend Auth Middleware

Use `@relay/user-auth-backend-middleware` in Express backend services that receive requests authenticated by the user-auth API. It verifies the Cognito access and ID cookies locally with `aws-jwt-verify`, using Cognito public keys. It checks token signature, issuer, app client, type, expiry, and matching subjects. The access token supplies groups; the ID token supplies email and email verification.

Exported middleware: `userAuthMiddleware` for signed-in users, `userAuthAdminMiddleware` for Admin and SuperAdmin groups, and `userAuthSuperAdminMiddleware` for the SuperAdmin group only. `verifyCognitoTokens` is available to the user-auth service itself.

The middleware attaches `req.user` with the subject, email, email-verification
flag, and role. It does not enforce email verification itself; services such as
Credit apply that additional check. `readCookie` and `readAccessToken` are also
exported. Verification uses cached public keys and does not call User Service's
session API.

Set `AWS_DEFAULT_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_ADMIN_GROUP_NAME`, and `COGNITO_SUPERADMIN_GROUP_NAME`. For local Floci development, also set `COGNITO_ISSUER` and `COGNITO_JWKS_URI` to the external issuer and reachable JWKS URL.

From the repository root, build before importing the package in backend processes:

```bash
npm run build --workspace=@relay/user-auth-backend-middleware
npm run test --workspace=@relay/user-auth-backend-middleware
```
