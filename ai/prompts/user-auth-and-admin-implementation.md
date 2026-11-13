
# Timesteamp: 2026-09-22, 2026-10-28
# Key Prompt

F1
Support account registration with an email and password.
1.1
The system shall create an account only if email and password requirements are satisfied.


1.1.1
Passwords must satisfy the following requirements: Contain at least 8 characters, including at least one character from each of the following: lowercase letter, uppercase letter, digit, character from a defined special-character set.


1.1.2
Emails must satisfy the following requirements: Domain must contain “nus.edu”.


1.1.3
Account creation shall require two submitted password values: a password and a password confirmation.


1.1.4
The system shall create an account only when the password and password confirmation match exactly, and the email and password requirements are met.
1.2
The system shall prevent multiple accounts from being created with the same email address.


1.2.1
When account creation is submitted with an email address identical to an existing account’s email, the system shall not create another account.
1.3
The system shall support email verification using a time-limited verification code.


1.3.1
After account creation, the system shall send a randomised 6-digit numeric one-time password (OTP), to the email associated with the account.


1.3.2
The OTP shall remain valid for 24 hours from the time it is issued, after which it expires.


1.3.3
The system shall successfully authenticate the account only upon submission of a correct, unexpired OTP.
1.4
The system shall support profile creation for accounts with verified email addresses.


1.4.1
The system shall require users to enter a username that contains between 3 and 50 alphanumeric characters.


1.4.2
The system shall reject a username that is identical to an existing account’s username.


1.4.3
The system shall accept a profile picture only if the file type extension of the image provided is .jpg or .png and its file size is less than 5 MB.
1.5
After account creation and email verification, the system shall notify the Credit Service of the new account.
F2
Support account authentication.
2.1
The system shall support account authentication using valid registered credentials.


2.1.1
The system shall successfully authenticate an account when the submitted credentials match the account’s registered credentials, and fail authentication if any credential does not match.


2.1.2
The system shall fail to authenticate an account if the submitted email does not exist in the system.


2.1.3
The system shall fail to authenticate an account if the submitted email exists in the system, but the password does not match.


2.1.4
The system shall allow an account to be authenticated on multiple devices, leading multiple accounts sessions.


2.1.5
After authentication with credentials, the system shall provide accounts with session tokens that can be used for authentication as described in F2.3.
2.2
The system shall limit authentication attempts after repeated failed authentications.


2.2.1
The system shall permit 5 consecutive authentication attempts per account.


2.2.2
After the 5th failed authentication, the system shall reject any submitted credentials for that account for a 1 minute period.


2.2.3
During the 1 minute restriction period, the system shall return a  generic authentication-retry outcome and shall not grant account access.
2.3
The system shall support authentication using session tokens.


2.3.1
The system shall issue short-lived access tokens that expire in at most 15 minutes, and long-lived refresh tokens that expire in at most 30 days, after successful authentication with valid credentials in F2.1.


2.3.2
The system shall support generation of new access tokens and refresh tokens from a refresh token that was previously issued by the system, after verification checks described below.


2.3.3
The system shall cryptographically sign all session tokens before issue with a private key, and check validity and expiry by using the public key.


2.3.4
The system shall maintain a record of all refresh tokens generated during an account’s session lifetime, and detect stale refresh tokens, which are refresh tokens that are older than the newest generated token for that account session.


2.3.5
The system shall reject authentication of accounts and regeneration of tokens if refresh tokens are invalid, expired, stale, or revoked.


2.3.6
The system shall additionally revoke all refresh tokens generated during an account’s session lifetime if any stale refresh token is used.


2.3.7
The system shall provide the public key to other services in Relay so they can verify session tokens independently.
F3
Support password changes for authenticated accounts.
3.1
The system shall allow an authenticated account to submit its current password and a new password.


3.1.1
The system shall reject the password change if the submitted current password does not match the account's current password.


3.1.2
The system shall reject the password change if the submitted new password does not satisfy the requirements defined in F1.1.1.


3.1.3
The system shall reject the password change when the submitted new password confirmation does not match the submitted new password. 


3.1.4
The system shall accept the password change only when the submitted current password matches the account’s current password, the new password satisfies the requirements defined in F1.1.1, and the submitted new password confirmation matches the submitted new password.
F4
Support viewing and editing an authenticated account’s own information.
4.1
The system shall provide the authenticated account’s email, username and profile picture associated with that account.


4.1.1
The system shall not allow an account to access another account’s profile information.
4.2
The system shall allow an authenticated account to edit its username only when the new username satisfies the requirements in F1.4.1 and F1.4.2.
4.3
The system shall allow an authenticated account to replace its profile picture only when the new picture satisfies the requirements in F1.4.3.
F5
Support account deletion.
5.1
The system shall allow an authenticated account to request deletion of its own account.


5.1.1
After confirmed deletion, the system shall remove the account’s credentials, and the username and profile picture associated with that account upon successful submission of a deletion request.


5.1.2
The system shall return a successful deletion outcome only after the deletion operation is complete.
F6
Support administratorsT7.
6.1
The system shall bootstrap a designated super-admin user.


6.1.1
A super-admin role has at least the same permissions as administrators and users, in addition to management of administrators.


6.1.2
The system shall add the super-admin during deployment or system start-up, using a provided email and password.


6.1.3
The system shall check that addition of super-admin is successful during deployment or start-up, and stop the deployment or start-up otherwise.
6.2
The system shall allow the super-admin to promote users to administrators.


6.2.1
The system shall validate that the user making the request is a super-admin, and reject the request otherwise.


6.2.2
The system shall verify that the email provided is an email of an existing user, and that that user is not already an administrator, or it will reject the request otherwise.


6.2.3
The system shall successfully promote the user with the provided email to an administrator, after all previous checks have passed.
6.3
The system shall allow the super-admin to demote administrators to users.


6.3.1
The system shall validate that the user making the request is a super-admin, and reject the request otherwise.


6.3.2
The system shall verify that the email provided is an email of an existing user, and that that user is indeed an administrator, or it will reject the request otherwise.


6.3.3
The system shall successfully demote the administrator with the provided email back to a user, after all previous checks have passed.

Implement a distributed authentication and role management subsystem using AWS Cognito, Node.js (Express/TypeScript), PostgreSQL, and Kafka for the Relay application.

- The Authentication Service holds no database. AWS Cognito acts as the authoritative store for user credentials, email verification status, and group/role memberships. PostgreSQL stores user profile data in the User Service, linked strictly via the unique `cognitoSub`.
Use the following in your implementation: Express, TypeScript, AWS SDK v3 (Cognito Identity Provider), KafkaJS, PostgreSQL, Prisma.
- Set up configurable Cognito Pool ID, Client ID, domain, cookie security flags, and token expiration defaults (target cookie lifetime: 900 seconds / 15 minutes) as per the requirements mentioned above.

AUTHENTICATION API ENDPOINTS (/api/auth)
Implement an Express Router mounted at /api/auth with the following endpoints:

- Registration (POST /api/auth/register):
Restrict registration to email addresses ending in `u.nus.edu` or `nus.edu.sg`, plus a explicitly configured environment variable exception for bootstrap admins.
Password: Enforce the restrictions as stated in the requirements
Register user in Cognito without auto-confirming.

- Email Verification (`POST /api/auth/verify-email`):
Confirm the user account in Cognito using the verification code.
Upon successful confirmation, immediately generate session tokens and log the user in.

- Login (`POST /api/auth/login`):
Authenticate user credentials against Cognito.
Set Access, ID, and Refresh tokens exclusively in `HttpOnly`, `SameSite=Strict` cookies. The `Secure` flag must be environment-configurable.
Restrict the Refresh token cookie path to `/api/auth`.
For seucrity reasons, do NOT return tokens in the HTTP response JSON body.

- Logout (`POST /api/auth/logout`):
Revoke the current refresh token in Cognito.
Clear all access, ID, and refresh cookies.


- Password Change (`POST /api/auth/change-password`):
Require the user's current password and new password.
- Change password in Cognito and immediately issue a global sign-out to invalidate refresh tokens across all active user sessions.

BACKEND AUTHENTICATION MIDDLEWARE
Create a reusable backend Express middleware package for all microservices:
- JWT Verification: Download and cache Cognito Public Keys (JWKS). Verify the validity of the token locally.
- Validate both the Access Token and ID Token. Ensure that `cognitoSub` matches in both tokens.
- Request Context: Attach a `req.user` object containing:
cognitoSub: Unique subject ID.
email: User email address.
email_verified: Boolean status.
role: Determined role (user, admin, or super-admin).
- Return 401 Unauthorized for expired or invalid tokens. Return 403 Forbidden for requests failing required role checks.

FRONTEND REQUEST HANDLING & SESSION REFRESH 
Implement a shared frontend fetching wrapper for microfrontend applications:
- Intercept HTTP 401 Unauthorized responses from API requests. Automatically issue a call to /api/auth/refresh to renew cookies, then retry the original request once.
- Maintain a single in-flight Promise for ongoing refresh attempts. All concurrent requests encountering a 401 across microfrontends must subscribe to the same pending refresh promise.

RBAC & ADMIN MANAGEMENT
- Map roles from Cognito groups: AdminGroup maps to admin, SuperAdminGroup maps to super-admin, unassigned users are user.

ROLES
user: Standard authenticated user operations.
admin: Admin operations (supplier creation, editing, deletion).
super-admin: Full admin privileges plus promoting and demoting administrative users.

ADMIN API ENDPOINTS:
- `POST /api/auth/admin/promote` and `POST /api/auth/admin/demote`: Superadmins only
- Endpoint Validation: Verify account existence in Cognito. Add/remove the target user to/from AdminGroup.
- Reject attempts to promote existing admins, reject demotions of non-admins and any modification of a super-admin user's role.
- The first bootstrapped email address shall be the super-admin

ASYNCHRONOUS ACCOUNT DELETION & CLEANUP
- Implement a Kafka consumer listening to the UserDeleted topic.
- Upon receiving a UserDeleted event, remove the corresponding identity from AWS Cognito.
- Failure Recovery & DLQ: Wrap deletion in a retry loop. If deletion attempts are exhausted without success, route the payload to a user-deleted-dlq.

TEST SUITE & VERIFICATION REQUIREMENTS
Implement integration and unit tests covering:
- Email domain restriction enforcement during registration.
- Dual-token matching validation in the auth middleware.
- Protection rules preventing role mutation of super-admin accounts or demotion of standard users.

# Usage Scenario
Generated initial implementation, fixed bugs and made further refinement.