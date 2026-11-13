# Timestamp: 2026-09-19 
# Key Prompt:

F1
1.4
The system shall support profile creation for accounts with verified email addresses.


1.4.1
The system shall require users to enter a username that contains between 3 and 50 alphanumeric characters.


1.4.2
The system shall reject a username that is identical to an existing account’s username.


1.4.3
The system shall accept a profile picture only if the file type extension of the image provided is .jpg or .png and its file size is less than 5 MB.



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

Key implementation details:
1. Use TypeScript, Express, Prisma, and PostgreSQL for the User Service backend.
The workspace is @relay/user-backend. PostgreSQL stores profile metadata only: cognitoSub, username, profilePictureKey, role, and timestamps. It never stores passwords, credentials, or image binaries. Profile pictures live in S3-compatible storage, Floci locally and Amazon S3 in production. The shared @relay/contracts package defines the User API.

2. Use the Cognito sub as the canonical identity key.
The PostgreSQL profile id is internal only and never used as cross-service identity. requesterSub and courierSub are Cognito subs. The sub is an opaque string: never validate it as a UUID, never use email as the identity key, and never let the frontend supply it.

3. Authenticate with server-side cookie sessions backed by Cognito.
Cognito handles registration, verification, login, OTP, and password changes. SessionController converts successful Cognito authentication into a server-side session and revokes it on logout. Sessions are persistent (UserSession Prisma model, migration 20260929000000_add_user_sessions) and use opaque, hashed relay_session cookies. Profile routes use the cookie session, not bearer tokens. AUTH_MODE selects the real Cognito gateway or the mock gateway for tests and local use. Session config is SESSION_COOKIE_SECURE=false for local HTTP and true behind HTTPS in production.

4. Validate sessions through a private internal endpoint.
Other services validate the browser's relay_session cookie through POST /internal/user/session/validate, using the internal service token, without handling Cognito tokens themselves.

5. Expose profile operations at /api/user/me.
GET /api/user/me, PATCH /api/user/me, and DELETE /api/user/me sit behind session auth. The profile is always keyed by the authenticated sub from the session, so no user ID appears in the URL or body and a user cannot request another user's profile. Session operations live under /api/user/auth/*: register, verification resend, verification confirm-and-login, login, logout, and password, plus GET /api/user/session. getUser returns the complete User model and updateUser returns the complete updated profile. Responses use the envelope { ok: true, data } on success and { ok: false, error } for expected errors.

6. Enforce profile rules server-side.
A verified email is required, otherwise 403. Usernames are 3-50 alphanumeric characters and unique, with conflicts returning 409 USERNAME_TAKEN. A missing profile returns 404 PROFILE_NOT_FOUND, validation failures return 400 VALIDATION_FAILED, and authentication failures return UNAUTHENTICATED. Validation in user.validator.ts is backend-authoritative: images must be JPG/PNG base64 data URLs under 5 MB decoded.

7. Store profile pictures by key, never as binaries.
PostgreSQL stores only profilePictureKey, in the format profiles/{cognitoSub}/{imageId}.jpg. The ImageStorage abstraction is backed by FlociS3ImageStorage using the AWS SDK, with per-user object keys and Floci-compatible URLs. Upload validates the image, stores the binary in S3/Floci, and saves the key; the old image is deleted after the database update succeeds. Sending profilePicture: null removes the picture and deletes the stored image.

8. Delete accounts with the outbox-first reorder.
Profile deletion and the UserDeleted outbox event commit in one transaction; Cognito deletion happens after the commit, and S3 image deletion is done by the S3 consumer, never synchronously in the request path. A successful deletion returns 204. If Cognito deletion fails, the API returns 202 Accepted with { ok: true, data: { status: "pending" } } so the Auth consumer can finish it. Cognito UserNotFoundException is treated as an idempotent success. Retrying after the profile is removed returns 202 while the deletion event still exists; a missing profile with no deletion event returns 404. Concurrent deletion requests are handled as the same pending operation.

9. Run Auth and S3 consumers for UserDeleted cleanup.
The Auth consumer (group relay-auth-user-events) finalises Cognito deletion with AdminDeleteUser, treats a missing Cognito user as already deleted, and retries failures three times before sending the event to the DLQ. The S3 profile-image consumer (group relay-user-profile-cleanup) deletes profilePictureKey from S3/Floci and supports older deletion events without an image key. Both consumers subscribe with fromBeginning: false and run inside the existing user-auth-api and user-api processes, with no new deployment or topic. UserDeleted events carry the optional profile-picture key. DLQ error codes are USER_AUTH_DELETE_FAILED and USER_PROFILE_IMAGE_DELETE_FAILED.

10. Protect the only admin account from deletion.
Before deleting an admin account, check the Cognito admin group; if it is the only admin, reject with 403 Forbidden and the message "The only admin account cannot be deleted." Non-admin users can still delete their own accounts. After a successful deletion, all active server sessions for that user are revoked. Supplier permissions themselves are enforced in the Supplier backend: reads require authentication and writes require role === 'admin'.

11. Use the shared UserApiErrorCode as a type union, with string literals in code.
user.service.ts throws new UserServiceError('CODE', message, status) with string literals, compile-time checked against the shared UserApiErrorCode contract through the constructor type. user.controller.ts types its error code as UserApiErrorCode. No runtime constants object exists.

12. Keep profile and session responsibilities separate.
The profile service owns profile rules: retrieval, creation, username updates with duplicate detection, picture upload and replacement, and deletion. The session service owns Cognito login, OTP, and password operations and the opaque cookies.

13. Wire the backend with dependency injection and centralised error handling.
app.ts parses JSON with a 7mb limit (sized for base64 image payloads), constructs the Prisma repository, Floci-compatible S3 storage, identity gateway, user service, and controller, mounts routes under /api/user, serves /health and /healthz, and handles UserServiceError centrally, including invalid JSON. server.ts loads the port from the environment, starts Express, shuts down gracefully on SIGINT/SIGTERM, and disconnects Prisma on shutdown. The repository exposes findByCognitoSub, findByUsername, createProfile, updateProfile, and deleteProfile, with Prisma details kept out of the service and controller layers.

# Usage Scenario:
Generated initial implementation, decomposed into separate components, and fixed bugs for configuration