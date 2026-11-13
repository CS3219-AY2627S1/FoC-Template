# Authentication

This feature connects registration and login to User Service, restores login
after a page reload, guards application routes, and handles authenticated
business requests and logout. Registration opens the email verification page;
verified users can log in to `/home`.

Signed-in users can request a new NUS email address from **Edit Profile → Update
Email**. The current address remains unchanged until the new one is verified;
existing sessions stay signed in.

**Forgot password?** on the login page sends a reset link to an existing account's
current email. The link opens a new-password form; after saving, the user returns
to login with the new password.

## Structure and responsibilities

```text
auth/
├── api/          # Send auth, email verification, and account requests
├── assets/       # Authentication background
├── components/   # Session recovery loading and retry feedback
├── hooks/        # Login/register submission progress and errors
├── layouts/      # Authentication page layout
├── lib/          # Token storage, fetch requests, refresh, and Axios interceptors
├── pages/        # Each page owns its form, schema, styles, and tests
├── providers/    # React authentication operations and invalidation notifications
├── schemas/      # NUS email validation shared by registration and resending
├── styles/       # Shared form and page styles
├── types/        # Backend request and response types
└── utils/        # Login/register error messages
```

| Part                                                                                            | What it does                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [accessTokenStore](lib/accessTokenStore.ts)                                                     | Holds the single in-memory access token. It does not store expiry, navigate, or manage React state.                                                                |
| [refreshAccessToken](lib/refreshAccessToken.ts)                                                 | Shares one refresh request, saves its token, and ignores obsolete results after login or logout.                                                                   |
| [AuthProvider](providers/AuthProvider.tsx)                                                      | Exposes `completeLogin`, `ensureAuthenticated`, and `logout`. Remembers explicit authentication termination and reports confirmed authentication failure to React. |
| [authInterceptors](lib/authInterceptors.ts)                                                     | Attaches the current Bearer token and retries a business request at most once after 401.                                                                           |
| [authRequest](lib/authRequest.ts)                                                               | Sends auth requests with fetch, parses responses, and handles HTTP errors and optional timeouts.                                                                   |
| [useLogin](hooks/useLogin.ts), [useRegister](hooks/useRegister.ts)                              | Track submission progress and turn request errors into page messages.                                                                                              |
| [LoginPage](pages/LoginPage/LoginPage.tsx), [RegisterPage](pages/RegisterPage/RegisterPage.tsx) | Connect validated form values to hooks and navigate after success.                                                                                                 |
| Page-local forms and schemas                                                                    | Use React Hook Form and Zod for field state, validation, password matching, and name/email normalization.                                                          |
| [LoadingPage](../../pages/LoadingPage.tsx), [ErrorPage](../../pages/ErrorPage.tsx)              | Shared loading and error pages used by protected routes.                                                                                                           |

[App.tsx](../../App.tsx) places the Router inside AuthProvider and passes its
operations through Router context. [routes.tsx](../../routes.tsx) calls those
operations from `beforeLoad`; it does not call React hooks. Confirmed request
authentication failure causes the React bridge to invalidate the Router, so the
same guard decides whether to redirect. Axios never navigates directly.

Provider installs the interceptors and removes them on unmount. It does not keep
a second `isLoggedIn` or token copy, and it does not start recovery on mount.

## What the API functions do

| Function                                           | Request                                                         | Caller uses the result to                                               |
| -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [registerUser](api/registerUser.api.ts)            | `POST /auth/register` with name, email, password                | Open `/verify-email` with the submitted address.                        |
| [verifyEmail](api/emailVerification.api.ts)        | `POST /auth/email-verification/confirm` with token              | Show confirmation and a login link.                                     |
| [resendVerification](api/emailVerification.api.ts) | `POST /auth/email-verification/resend` with email               | Ask the user to check their inbox and spam folder.                      |
| [requestEmailChange](api/userProfile.api.ts)       | `POST /users/me/email-change` with email                        | Show sending feedback and allow resending in Edit Profile.              |
| [confirmEmailChange](api/emailVerification.api.ts) | `POST /users/email-change/confirm` with token                   | Show Email updated and return to the profile.                           |
| [requestPasswordReset](api/forgotPassword.api.ts)  | `POST /auth/password-reset/request` with email                  | Show inbox/spam feedback and allow resending.                           |
| [resetPassword](api/forgotPassword.api.ts)         | `POST /auth/password-reset/confirm` with token and new password | Show success and offer login with the new password.                     |
| [loginUser](api/loginUser.api.ts)                  | `POST /auth/login` with email, password                         | Pass the access token to Provider's `completeLogin` and open `/home`.   |
| [refreshSession](api/refreshSession.api.ts)        | `POST /auth/refresh`; browser supplies the cookie               | Obtain a replacement access token through the shared refresh operation. |
| [logoutUser](api/logoutUser.api.ts)                | `POST /auth/logout`; browser supplies the cookie                | Finish the logout attempt and return to login.                          |

Paths in this table are relative to `/api`. `requestEmailChange` uses the
authenticated Axios client; the auth requests use `authRequest`, which adds the prefix.
Auth APIs use fetch and bypass Axios interceptors. The backend's `expiresAt`
remains part of the response contract, but the frontend does not proactively
check it. The browser processes the HttpOnly refresh cookie; JavaScript does
not read or delete its value.

## How the pieces work together

### Registration and login

```text
Form → Page → useLogin/useRegister → fetch API → User Service
                         ↓ success
Register: open /verify-email → open emailed link → automatic verification → log in
Login: completeLogin(accessToken) → open /home
```

Names and emails are trimmed, emails are lowercased, and passwords remain
unchanged. Registration excludes `confirmPassword` from its request.
Existing pending states and submission locks prevent duplicate form submissions.

Verification emails are sent asynchronously after the registration transaction
commits; the response does not wait for SMTP delivery. A link only verifies the
email address it was issued for.

`VerifyEmailPage` uses the existing `AuthLayout` for check-email, verified, and
unavailable-link feedback. `useEmailVerification` submits a link token once on
arrival, including during React StrictMode effect replay. An unavailable link
explains that it may have expired or already been used and directs the user to
login. Unverified users can access resending from login. A temporary request
failure offers a retry in that card.

Correct credentials for an unverified account return **403** without either
login token. Login shows verification feedback and a link to the same resend
page. Resending too soon returns **429** with a short inline message; there is
no countdown. Ordinary profile saves do not send or change the email address.

### Updating an email address

The email form in `EditProfilePage` submits independently of the profile and password forms. Sending
and resending use the same authenticated endpoint, with the existing 60-second
interval. The target address is stored in an `EMAIL_CHANGE` token, not on the user
record. The emailed link opens `/verify-email?purpose=email-change&token=...`.
Confirmation updates the address and consumes the token in one transaction.

The verification page reuses the auth layout and background. Success offers
**Back to profile**; an unavailable link returns to **Edit Profile** to send again.
Confirmation invalidates the current tab's profile cache. Other tabs retain the
existing 60-second cache/focus behavior; a browser reload reads the new address.
No access token or refresh session is revoked by an email change.

To check the flow manually, request an unused NUS address you can access, confirm
that the old address remains visible before verification, and open the emailed
link. Return to the profile and check the new address without signing out. On the
next login, use the new address. Also check resending and an occupied address.

### Forgot password

`ForgotPasswordPage` sends and resends through `requestPasswordReset` in
`api/forgotPassword.api.ts` (`POST /api/auth/password-reset/request`). It shows
generic inbox/spam feedback on the same page. Existing accounts can request a link
even before email verification; unknown accounts receive the same response without an email. The existing resend interval applies.
Requests during the 60-second interval also return the same successful response,
but do not replace the current link or send another email.

`ResetPasswordPage` opens `/reset-password?token=...`. It submits the token and
new password to `POST /api/auth/password-reset/confirm` only after the user fills
both password fields and submits. Confirmation is checked locally and is not sent.
An unavailable link offers a new request; a temporary request failure allows retry.
The reset endpoint returns **410** for unavailable links and **400** for invalid
input; the page uses the status rather than the error message to distinguish them.

The backend reuses `EmailTokenService` with `PASSWORD_RESET`. Token consumption,
email verification, password hashing/saving, and refresh-token deletion share one transaction in
`PasswordService`. A link sent before an email change is rejected by comparing
its saved address with the account's current email. Existing access tokens expire
normally; the frontend does not coordinate other tabs or log in automatically.
Both Profile password changes and password resets also revoke pending password
reset and email-change links in that transaction. After a successful password reset
commits, an asynchronous completion notification is sent to the current email.

### Session recovery

```text
/ → /home → beforeLoad → auth.ensureAuthenticated()
                         ├── token present → allow access
                         ├── authentication explicitly ended → login
                         └── shared refresh → allow access, login, or error
```

A full reload clears the in-memory token and allows initial Cookie recovery.
A refresh 401 ends authentication in this page instance; network and service
errors remain retryable. The route waits before rendering protected content.
Loading appears after 500ms; Try again calls `router.invalidate()`.

After logout or confirmed authentication failure, the Provider prevents automatic
recovery in the same page instance until login succeeds. This is separate from
whether the token exists: an empty store on a fresh page still permits recovery.

### Business requests

Business API functions use the shared `axiosClient` with relative API paths.
The request interceptor attaches an existing token without checking expiry or
refreshing first. After the first 401 it reuses a newer token, or joins one shared
refresh, then retries once. A refresh 401 or a second 401 for the current token
reports authentication failure to Provider. Network/service errors propagate
without forcing login; non-401 business errors do not trigger refresh.

The request marker contains only the token used and whether the request was
retried. A late second 401 does not clear a newer token. Successful business
responses are returned normally, without a global session-version check.

### Logout

```text
Log out → Provider.logout()
        → capture current refresh, invalidate its result, clear token
        → wait for that refresh to settle
        → call logout API
        → page navigates to /login after success, failure, or timeout
```

The page and button stay unchanged while logout runs. Repeated clicks share the
Provider's pending logout operation. No new automatic refresh starts during
logout, and obsolete refresh results cannot restore the memory token.
Waiting for the current refresh orders normal cookie rotation before logout.

Refresh has a 15-second timeout and logout has a 10-second timeout. These bound
client waiting, not server processing. If server logout cannot be confirmed,
a later full reload may restore login from a still-valid cookie.

## Adding a protected page or API

- Add protected routes under the existing protected parent in `routes.tsx`.
- Use the shared Axios client for business APIs; pages need not add Bearer
  headers or implement their own refresh.
- Use `useAuth().logout()` from a signed-in control, then navigate after it
  resolves. Keep the control mounted until the operation finishes.
- See [Authentication Flow](auth-flow.md) for diagrams of the same operations.

## Verification

Tests check input validation, form interactions, page submissions, session
coordination, authenticated request retries, route recovery, and logout navigation.
The simple auth API functions do not have separate unit tests; page and session
tests mock these functions. Two focused `authRequest` tests check HTTP error
handling and timeout cancellation. Verify actual HTTP requests in the browser
checks below.

Run from the `frontend` directory:

```sh
npm run test:run
npm exec --no -- tsc --noEmit
npm run lint
npm run build
```

### Manual browser checks

Start the required backend infrastructure and User Service with the local dev
profile. From the `frontend` directory, start the frontend:

```sh
npm run dev
```

Open `http://localhost:3000`. Use this hostname consistently rather than switching
between `localhost` and `127.0.0.1`. Open DevTools and use **Network** to inspect
requests and **Application → Cookies** to inspect the refresh cookie. Enable
**Preserve log** in Network if you want to keep requests visible after navigation.

1. **Form validation and navigation**
   - Follow the links between `/login` and `/register`.
   - Submit empty forms and check that field errors appear. Correct the inputs
     and confirm the errors update without automatically submitting the form.
   - On registration, change either password field and check that the confirmation
     error updates. Check that whitespace-only passwords are rejected.
2. **Registration**
   - Configure the SMTP environment variables listed in the root `.env.example`
     in the User Service run configuration.
     Register with an unused NUS address you can access. Expect
     `POST /api/auth/register` to return **201**, followed by `/verify-email`
     showing the address and inbox/spam reminder.
   - Before opening the email, try logging in with the correct password. Expect
     **403**, no refresh cookie, and a resend link.
   - Open the email link. Expect an automatic confirmation request, **204**, and
     `Email verified`. Follow **Log in** and confirm normal login succeeds.
   - With another unverified account, wait one minute and resend. The newest link
     should work; the replaced or already-used link should show `Link unavailable`.
     That card should offer a login link without a resend form. Login offers
     resending if the account still needs verification.
   - A resend within one minute should show the inline wait message.
   - Try registering the same email again. Expect duplicate-email feedback and
     no navigation away from registration.
   - With a different unused email, stop User Service and submit. Check that an
     error appears and the form becomes usable again. Restart the service and
     retry without refreshing the page; registration should succeed.
3. **Login**
   - Submit an incorrect password for an existing account. Expect **401** and
     `Incorrect email or password.` on the page.
   - Correct the password and submit again. Expect **200** and navigation to
     `/home`. Check that the backend has set an HttpOnly refresh cookie.
   - While a submission is pending, verify that inputs and the submit button
     are disabled and repeated clicks do not create additional requests.
4. **Session recovery and access control**
   - While signed in, reload `/home`. Expect a successful `/auth/refresh` request
     and the signed-in page to reappear. Check that the refresh cookie is updated.
   - Open `/`; it should lead to `/home` and run the session check.
   - Fast recovery should not flash a loading message. With Network throttling,
     a check taking longer than 500ms should show `Loading…`; protected content
     should appear only after recovery succeeds.
   - Stop User Service and reload `/home`. Protected content should stay hidden
     while recovery fails. Restart the service and click **Try again**; the
     session check should run again and the page should recover.
   - In a private browser window without a refresh cookie, open `/home`. Expect
     navigation to `/login` rather than access to the signed-in page.
5. **Logout**
   - Click **Log out**. The page and button should remain unchanged while the
     request runs. Repeated clicks must not produce duplicate logout requests.
   - After a successful `/auth/logout` response, expect `/login` and removal of
     the refresh cookie. Opening `/home` again should return to login.
   - Log in again, stop User Service or switch offline, and attempt logout.
     After failure or timeout, expect `/login` without a logout error or retry UI.
   - Restore the connection and verify that logging in again works. If failed
     logout left a valid cookie, reloading the website may restore the earlier
     session; logging out again should clear it when the service is available.

6. **Forgot password**
   - Use an unverified account: send the link, check inbox/spam, open it, and submit
     matching new passwords. Confirm that the new password logs in and the old
     password does not. Reusing the link should offer a new request.
   - Check resend feedback and a mismatched confirmation before submission.
     Resending within one minute keeps the same inbox/spam feedback without a
     second email; after the interval, a new link is sent.

### Responsive layout checks

Use the DevTools device toolbar in **Responsive** mode and enter these viewport
widths and heights. Check login, registration, forgot/reset password, all email verification states, field/server errors, session
recovery feedback, and the application logout button.

| Viewport       | Check                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **320 × 568**  | No horizontal overflow. Registration can scroll to the submit button and login link. All error messages and retry controls remain accessible. |
| **390 × 844**  | Background cropping and card spacing look reasonable. Labels, messages, and buttons are fully visible.                                        |
| **1440 × 900** | The authentication background covers the viewport, the card is centered with a reasonable width, and feedback screens remain readable.        |

Frontend tests use mocked requests. These manual checks verify real browser
cookie creation, rotation, and removal. Bearer-token requests to a real protected
business endpoint still need integration testing when such an endpoint is available.

## Acknowledgments

Use GPT-6-Astra to help generate and modify this README based on current implementation.
