# Timestamp: 2026-10-13
# Key Prompt:

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
The system shall issue short-lived access tokens that expire in at most 15 minutes, and long-lived refresh tokens that expire in at most 30 days, after successful authentication with valid credentials in F2.1


2.3.2
The system shall support generation of new access tokens and refresh tokens from a refresh token that was previously issued by the system, after verification checks described below.


2.3.3
The system shall cryptographically sign all session tokens before issue, and check validity and expiry by decrypting the signed session tokens.


2.3.4
The system shall maintain a record of all refresh tokens generated during an account’s session lifetime, and detect stale refresh tokens, which are refresh tokens that are older than the newest generated token for that account session.


2.3.5
The system shall reject authentication of accounts and regeneration of tokens if refresh tokens are invalid, expired or stale, or revoked.


2.3.6
The system shall additionally revoke all refresh tokens stored during an account’s session lifetime if any stale refresh token is used, to prevent potential token stealing attempts.


2.3.7
The system shall allow other services in Relay to validate short-lived access tokens without making a request to the User service for every single validation check.
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
Support administrators. (Add hyperlink to definition)
6.1
The system shall bootstrap a designated super-admin user.


6.1.1
A super-admin role has at least the same permissions as administrators and users, in addition to management of administrators.


6.1.2
The system shall add the super-admin during deployment or system start-up, using a provided email and password.


6.1.3
The system shall check that addition of super-admin is successful during deployment or start-up, and stop the deployment or start-up otherwise.
6.2
The system shall support promotion and demotion of users to and from administrators.


6.1.1
The system shall designate the role of administrator with the newly created account.

key implementation details:

1. Integrate errand MFE with a shared host app.
Module Federation must expose your App component as userFrontend through remoteEntry.js, using React as a singleton. The host will supply session restoration, navigation, profile-refresh, and close callbacks. 
   
2. Ensure you have both a full-page authentication interface and a compact profile card for other services to access to modify profile details.

3. Authentication shall use explicit view states
Switch between `login`, `register`, `verify`, `profile`, and `account` using React state. When mounting and when `authVersion` changes, restore the session through the host callback. Existing users shall be able to access the compact profile card, while users without a profile go to setup.

After authentication and profile setup, refresh the host’s user information and navigate to the supplier interface, which is not implemented yet so leave it as a stub.

3. Registration includes validation and email verification
Registration must accept only NUS addresses ending in `@u.nus.edu` or `@nus.edu.sg`. Checks password confirmation and display a live checklist for password requirements.
Verification should use a six-digit numeric code and calls the Cognito API via the authentication backend. Users can request another code. Email and password must remain in React state while moving into verification.

4. Authentication and profile data use separate endpoints
Authentication operations call `/api/auth/*`, while profile operations call `/api/user/me`. After login or verification, the frontend must checks whether a profile exists, return a  `404` and go to the profile setup view if the profile does not exist.

5. Profile setup and editing share reusable fields
Submit a username and optional profile image through `PATCH /api/user/me`.

6. Split account management into separate components
keep the following components separate: profile editing, password changes, account deletion, and admin management

7. The UI reuses the shared design system
Cards, buttons, form surfaces, and messages come from the shared UI package in src/ui. 

8. Authentication screens should use a static NUS map image as their background. 

9. Profile pictures should fall back to the user’s initial if unavailable.

# Usage Scenario:
Generated initial implementation, decomposed App.tsx into separate components


