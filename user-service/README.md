# user-service

Owner: Oh Yi Xian

The user account and role service for FoC. It stores application-level user
profiles and roles in MongoDB, while Firebase Authentication remains responsible
for authentication and email/password credentials.
Spring Boot 4.1.1 on Java 21 with MongoDB.
It follows the repo conventions in [AGENTS.md](../AGENTS.md).

- **API:** `/api/users`
- **Health:** `/actuator/health` (with readiness and liveness groups)

## Run

```bash
# Whole system through the gateway at http://localhost:8080
docker compose up --build

# Service from source against the emulators
docker compose up -d firebase-emulator
MONGODB_URI="mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/UserServiceDB?retryWrites=true&w=majority" \
PORT=8081 ./mvnw spring-boot:run
```

- Swagger UI: `/api/users/docs`
- OpenAPI JSON: `/api/users/v3/api-docs`
- Health: `/actuator/health`

## Admin Bootstrap Creation

### Local
When running locally, follow the steps below to create the first admin account:
1. Start up the app with `docker compose up --build`
2. Access the Firebase Auth Emulator at `localhost:4000`
3. Go to the `Authentication` tab and click `Add user`
4. Enter the email of your desired bootstrap admin user (e.g. admin@u.nus.edu), set email to verified and enter a password that is at least 8 characters long, with a number and special character
5. Save the user
6. Duplicate the .env.example file and rename it to .env
7. Ensure the `ADMIN_BOOTSTRAP_ENABLED=true` is set to true. `ADMIN_BOOTSTRAP_EMAIL=admin@u.nus.edu`and change the email after the `=` character to the email you set in the Firebase Emulator
8. Restart the user service with `docker compose up -d --force-recreate user-service`
9. The admin account is created and you can log in with it on `localhost:8080`. No need to create/sign up with the email.
10. You can now set `ADMIN_BOOTSTRAP_ENABLED=false` or remove it entirely from the .env file.

### Cloud
When running locally, follow the steps below to create the first admin account:
1. Access the online Firebase Console for the project
2. Go to the `Authentication` tab and click `Add user`
3. Enter the email of your desired bootstrap admin user (e.g. admin@u.nus.edu) and enter a password that is at least 8 characters long, with a number and special character
5. Save the user
6. Open the Google Cloud Console of the project and open the user-service container
7. Open the `Containers` tab
7. Add a new variable named `ADMIN_BOOTSTRAP_ENABLED` with value `true` `ADMIN_BOOTSTRAP_EMAIL` with value `admin@u.nus.edu`. The value is the email you set in the Firebase console.
8. Select `View diff & redeploy`. Deploy the changes.
9. The admin account is created. Attempt to sign in with it and request an email verification. No need to create/sign up with the email.
10. After verifying the email, you can sign in with the admin account. 
11. You can now set `ADMIN_BOOTSTRAP_ENABLED` to `false` or remove it entirely from the user-service variables.

## Sprint 3 API

Authenticated endpoints use:
`Authorization: Bearer <Firebase ID token>`
The Firebase ID token identifies the caller. The User Service uses the Firebase
UID from the verified token rather than trusting a UID supplied by the client
when retrieving the current user's profile.

Creating a user commits a `UserCreated` outbox event in the same MongoDB transaction. The outbox
publisher sends schema version 1 to the environment's `USER_CREATED_TOPIC`; Credit Service consumes
the event asynchronously and idempotently allocates the initial 50-credit account. Registration no
longer calls Credit Service synchronously, so a temporary Credit outage leaves the event pending for retry.

| Method | Path                     | Who                                 | Purpose                                                |
| ------ | ------------------------ | ----------------------------------- | ------------------------------------------------------ |
| POST   | `/api/users`             | unauthenticated during registration | Create an application user after Firebase registration |
| POST   | `/api/users/me/email-sync`| authenticated user                 | Syncs MongoDB user email with Firebase user email      |
| GET    | `/api/users`             | authenticated admin user            | Retrieve all users in MongoDB                          |
| GET    | `/api/users/{:userId}`   | authenticated admin user            | Retrieve a specific user in MongoDB                    |
| GET    | `/api/users/summary/{:userId}`| services                       | Retrieve a user summary from user id in MongoDB        |
| GET    | `/api/users/me`          | authenticated user                  | Retrieve the currently authenticated user's profile    |
| GET    | `/api/users/role-context`| authenticated / services            | Retrieve roles for authorization by other services     |
| GET    | `/api/users/courier-eligibility`| authenticated / services     | Retrieve boolean if user is a courier by other services|
| GET    | `/api/users/requester-eligibility`| authenticated / services   | Retrieve boolean if user is a requester by other services |
| GET    | `/api/users/admin-eligibility`| authenticated / services       | Retrieve boolean if user is an admin by other services |
| PUT    | `/api/users/me`          | authenticated user                  | Update own information after registration              |
| PUT    | `/api/users/{:userId}`   | authenticated admin user            | Update user information after registration             |
| PUT    | `/api/users/{:userId}/user-promotion`| authenticated admin user| Promotes a regular user to admin                       |
| PUT    | `/api/users/{:userId}/user-demotion`| authenticated admin user | Demotes an admin to regular user                       |
| PUT    | `/api/users/{:userId}/penalty`| admin and services             | Updates given user's penalty by a specified amount     |
| PUT    | `/api/users/{:userId}/suspension`| authenticated admin user    | Suspends a given user                                  |
| DELETE | `/api/users/me`          | authenticated user                  | Deletes user information from user databases           |
| DELETE | `/api/users/{:userId}`   | authenticated admin user            | Deletes specified user's information from user databases |


## Data model

The `users` collection contains one document per application user in MongoDB.

| Field                | Type             | Notes                                                        |
| -------------------- | ---------------- | ------------------------------------------------------------ |
| `id`                 | string           | MongoDB document ID                                          |
| `username`           | string           | User's application username                                  |
| `userId`             | string           | Application/Firebase user identifier                         |
| `email`              | string           | User email; unique                                           |
| `roles`              | array of strings | Application roles such as `requester`, `courier`, `admin`    |
| `penalty`            | integer          | Current user penalty count; defaults to `0`                  |
| `isCourierSuspended` | boolean          | Whether the user is currently suspended from courier actions |
| `suspensionEndDate`  | date / null      | End date of the courier suspension                           |
| `status`             | enum             | `ACTIVE`, `DEACTIVATION_PENDING` and `DEACTIVATED` are the enums allowed |
| `isPermanentlySuspended`| boolean       | Whether user is suspended forever                            |

## Test

Locally:
```bash
$env:MONGODB_URI="mongodb+srv://..."
./mvnw verify
```

Tests are not implemented yet.

## Admin directory

The Admin UI uses GET /api/users/admin/search with active-admin authorization and database pagination. Exact contract, changed files, tests and integration scope: [user-servicehandoff.md](user-servicehandoff.md). Existing User routes are preserved.
