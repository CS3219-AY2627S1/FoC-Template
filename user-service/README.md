# User Service

## At a glance

This service is the source of truth for account identity, authentication, profile data, and role membership in FoC.

Core model:

- `users`: account and profile records
- `roles`: canonical role catalog
- `user_roles`: user-to-role mapping
- `refresh_tokens`: refresh token hashes and expiry state
- `revoked_tokens`: invalidated JWT JTI values
- `system_metadata`: one-time bootstrap state
- `password_reset_tokens`: future reset flow support

This service is built with:

- TypeScript
- Node.js
- Express
- PostgreSQL
- pg
- bcrypt
- JWT

## 1. Base URL

- http://localhost:3002

## 2. Existing API list

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users/me`
- `PATCH /api/users/me`
- `POST /api/users/me/change-password`
- `GET /api/users/:userId`
- `POST /api/users/batch`
- `GET /api/users/:id/roles`
- `POST /api/users/:id/roles` (ADMIN only)
- `DELETE /api/users/:id/roles/:role` (ADMIN only)

## 3. Quick start

### Start the service

From this folder, run:

```bash
docker compose up --build
```

This starts both:

- the PostgreSQL database
- the user-service API

You can verify the app is up with:

```bash
curl http://localhost:3002/health
```

Expected response:

```json
{
  "status": "UP"
}
```

### Initial admin bootstrap

If the database is new and you want the first admin account, set the bootstrap env vars in `user-service/.env`, then run the commands from the `user-service` directory:

```bash
npm run db:seed
```

The script checks whether bootstrap has already completed, locks the bootstrap transaction, and creates the initial admin only when the one-time flag is not yet set.

## 4. Quick curl examples

### Register

```bash
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@u.nus.edu",
    "password": "supersecurepassword123",
    "firstName": "Alice",
    "lastName": "Lee"
  }'
```

### Login

```bash
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "alice",
    "password": "supersecurepassword123"
  }'
```

### Refresh access token

```bash
curl -X POST http://localhost:3002/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh-token>"
  }'
```

### Get current user profile

```bash
curl http://localhost:3002/api/users/me \
  -H "Authorization: Bearer <access-token>"
```

### Update current user profile

```bash
curl -X PATCH http://localhost:3002/api/users/me \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Alice",
    "lastName": "Liu"
  }'
```

### Change password

```bash
curl -X POST http://localhost:3002/api/users/me/change-password \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "supersecurepassword123",
    "newPassword": "new-supersecure-password456"
  }'
```

### Get user roles

```bash
curl http://localhost:3002/api/users/<user-id>/roles \
  -H "Authorization: Bearer <access-token>"
```

### Logout

```bash
curl -X POST http://localhost:3002/api/auth/logout \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh-token>"
  }'
```

## 5. API contract

### Health check

#### GET /health

Response:

```json
{
  "status": "UP"
}
```

---

### Register user

#### POST /api/auth/register

Request body:

```json
{
  "username": "alice",
  "email": "alice@u.nus.edu",
  "password": "supersecurepassword123",
  "firstName": "Alice",
  "lastName": "Lee"
}
```

Rules:

- all fields are required
- email must be valid and use an allowed NUS domain
- password must be at least 15 characters long
- username and email must be unique

Default roles assigned on registration:

- `REQUESTER`
- `COURIER`

Registration also initializes a Credit Service wallet with the configured initial credit balance. Set `CREDIT_SERVICE_URL` to the Credit Service base URL (for example, `http://localhost:3004` when running locally). If wallet initialization fails, registration returns `503` and the user registration is rolled back.

After the registration commits, the service publishes a `USER_REGISTERED` event (`user_id`, `email`) to the `users` RabbitMQ topic exchange (routing key `user.registered`). The notification service uses it to subscribe the new user's email to SNS notifications. Publishing is best-effort: a broker failure is logged and never fails the sign-up. Set `RABBITMQ_URL` (and `RABBITMQ_USER` / `RABBITMQ_PASSWORD`) to enable it; when `RABBITMQ_URL` is unset, publishing is disabled.

Success response: `201`

```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@u.nus.edu",
  "firstName": "Alice",
  "lastName": "Lee",
  "roles": ["REQUESTER", "COURIER"]
}
```

---

### Login

#### POST /api/auth/login

Request body:

```json
{
  "identifier": "alice",
  "password": "supersecurepassword123"
}
```

`identifier` can be either username or email.

Success response: `200`

```json
{
  "accessToken": "<jwt-token>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@u.nus.edu",
    "firstName": "Alice",
    "lastName": "Lee",
    "roles": ["REQUESTER", "COURIER"]
  }
}
```

---

### Refresh access token

#### POST /api/auth/refresh

Request body:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Success response: `200`

```json
{
  "accessToken": "<new-access-token>",
  "refreshToken": "<new-refresh-token>",
  "user": {
    "id": "uuid",
    "username": "alice",
    "email": "alice@u.nus.edu",
    "firstName": "Alice",
    "lastName": "Lee",
    "roles": ["REQUESTER", "COURIER"]
  }
}
```

The implementation rotates the refresh token: the old one is invalidated and a new one is issued.

---

### Logout

#### POST /api/auth/logout

Requires authentication.

Request body (optional but recommended):

```json
{
  "refreshToken": "<refresh-token>"
}
```

Behavior:

- stores the current access-token JTI in `revoked_tokens`
- if a refresh token is supplied, marks the matching refresh token as revoked

Response: `204 No Content`

---

### Get current user profile

#### GET /api/users/me

Requires authentication.

Response:

```json
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@u.nus.edu",
  "firstName": "Alice",
  "lastName": "Lee",
  "roles": ["REQUESTER", "COURIER"]
}
```

---

### Update current user profile

#### PATCH /api/users/me

Requires authentication.

Request body may include any subset of:

```json
{
  "username": "alice2",
  "email": "newemail@u.nus.edu",
  "firstName": "Alice",
  "lastName": "Liu"
}
```

Success response:

```json
{
  "id": "uuid",
  "username": "alice2",
  "email": "newemail@u.nus.edu",
  "firstName": "Alice",
  "lastName": "Liu",
  "roles": ["REQUESTER", "COURIER"]
}
```

---

### Change current user password

#### POST /api/users/me/change-password

Requires authentication.

Request body:

```json
{
  "currentPassword": "supersecurepassword123",
  "newPassword": "new-supersecure-password456"
}
```

Rules:

- both fields are required
- new password must be at least 15 characters long
- current password must match the stored hash
- all existing refresh tokens for that user are revoked after a successful password change

Success response: `200`

```json
{
  "message": "Password changed successfully. Please log in again."
}
```

---

### Get user profile by ID

#### GET /api/users/:userId

Requires authentication.

This endpoint returns a user profile for a valid UUID. Access is restricted by the service's user-profile rules.

---

### Batch get users by IDs

#### POST /api/users/batch

Requires authentication.

Request body:

```json
{
  "userIds": [
    "uuid-1",
    "uuid-2"
  ]
}
```

Rules:

- `userIds` must be a non-empty array
- max 100 IDs per request
- each item must be a valid UUID

---

### Get roles for a user

#### GET /api/users/:id/roles

Requires authentication.

Success response:

```json
{
  "userId": "uuid",
  "roles": ["REQUESTER", "COURIER"]
}
```

---

### Add role to user

#### POST /api/users/:id/roles

Requires authentication and `ADMIN` role.

Request body:

```json
{
  "role": "ADMIN"
}
```

Response:

```json
{
  "userId": "uuid",
  "roles": ["REQUESTER", "COURIER", "ADMIN"]
}
```

---

### Remove role from user

#### DELETE /api/users/:id/roles/:role

Requires authentication and `ADMIN` role.

Example:

```bash
curl -X DELETE http://localhost:3002/api/users/<user-id>/roles/ADMIN \
  -H "Authorization: Bearer <access-token>"
```

Response:

```json
{
  "userId": "uuid",
  "roles": ["REQUESTER", "COURIER"]
}
```

## 6. Authentication model

This service uses JWT-based auth. After validation, the middleware attaches the authenticated user to `req.user` with at least:

```ts
req.user = {
  id: string,
  jti: string,
  exp: number
}
```

Protected routes require the `Authorization: Bearer <token>` header.

## 7. Supported roles

- `ADMIN`
- `REQUESTER`
- `COURIER`

New user registration automatically assigns:

- `REQUESTER`
- `COURIER`

The `ADMIN` role is reserved for bootstrap or administrative assignment flows.

## 8. Database snapshot

This is the quick mental model for the database as it currently exists.

| Table | Purpose | What is in it |
| --- | --- | --- |
| `users` | user accounts and profiles | `id`, `username`, `email`, password hash, names, active flag, timestamps |
| `roles` | role catalog | `ADMIN`, `REQUESTER`, `COURIER` |
| `user_roles` | user-to-role mapping | join table linking a user to one or more roles |
| `refresh_tokens` | ongoing session state | hashed refresh tokens, expiry, revocation flag |
| `revoked_tokens` | logout / token invalidation | JWT JTI values that have been revoked |
| `password_reset_tokens` | future reset flow | hashed token + expiry + user reference |
| `system_metadata` | bootstrap state | one-time flag such as `INITIAL_BOOTSTRAP_COMPLETED` |

Current default state after migration:

- `roles` is seeded with `ADMIN`, `REQUESTER`, and `COURIER`
- `users` is empty until someone registers
- `user_roles` is empty until roles are assigned
- `refresh_tokens` and `revoked_tokens` are empty until login/logout flows begin
- `system_metadata` is empty until Day 0 bootstrap runs

## 9. Environment config

Typical `.env` values:

```env
PORT=3002
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5433
DB_DATABASE=user_service_db
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30

INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_FIRST_NAME=System
INITIAL_ADMIN_LAST_NAME=Admin
```

## 10. Day 0 admin bootstrap

This app includes a one-time initial admin bootstrap.

Important rules:

- it is intended to run once
- it uses a transaction lock and metadata flag to prevent repeated execution
- it is not a general admin recovery flow
- admin credentials must be set in environment variables before bootstrapping

How to run it manually:

1. Set the bootstrap env vars in `.env`:

```env
INITIAL_ADMIN_EMAIL=admin@u.nus.edu
INITIAL_ADMIN_PASSWORD=VeryStrongPassword123!
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_FIRST_NAME=System
INITIAL_ADMIN_LAST_NAME=Admin
```

2. From the `user-service` directory, start the DB container and then run the bootstrap script:

```bash
npm run db:seed
```

This script checks whether bootstrap has already completed, acquires a lock, and then creates the initial admin only if the one-time flag is still unset.

## 11. Collaboration notes

- This service is the source of truth for account identity, auth, and role membership.
- Frontend and other services should call this API instead of inventing their own user state.
- Follow the route → controller → service → DB pattern when adding logic.
- If a new endpoint is added, update this README as well.

That is the mental model teammates need when integrating with this service.
