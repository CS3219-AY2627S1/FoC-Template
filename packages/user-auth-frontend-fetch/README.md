# Frontend Auth Fetch

Use `@relay/user-auth-frontend-fetch` in browser frontends for protected `/api/*` requests made with Cognito cookies. `authFetch` sends cookies, refreshes an expired access token through `/api/auth/refresh` after a 401, and retries the original request once. It replays request bodies and shares an in-flight refresh across frontend bundles, so returning to a suspended tab or simultaneous API calls do not require each caller to implement refresh logic.

`refreshAccessToken` is available to the host for its periodic and tab-focus refresh. Login, registration, verification, logout, and refresh requests bypass the retry behavior so authentication errors remain visible to their callers. A failed or expired refresh token still requires the user to sign in again.

Automatic refresh/retry applies only to same-origin `/api/*` requests. The helper
is exported as TypeScript source for frontend bundlers. Run its tests from the
repository root with Node.js 24:

```bash
npm run test --workspace=@relay/user-auth-frontend-fetch
```
