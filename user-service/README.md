# User Service

Spring Boot 4 (Java 17, Maven) service for registration, login, JWT issuing and account types, backed by PostgreSQL.

All commands below run from the **repository root**, where `compose.yaml` and `.env` live.

## 1. Configure

```bash
cp .env.example .env        # then fill in the User Service sections
```

| Variable | Purpose |
| --- | --- |
| `USER_DB_NAME` / `USER_DB_USERNAME` / `USER_DB_PASSWORD` | PostgreSQL database and credentials (used by both containers) |
| `USER_DB_PORT` | Host port for the database (default `5434`) |
| `USER_SERVICE_PORT` | Host port for the API (default `8081`) |
| `BOOTSTRAP_ADMIN_NAME` / `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | First administrator, see [Administrator bootstrap](#administrator-bootstrap) |

`.env` is git-ignored. Never commit real values.

## 2. Generate the JWT signing keys

The service signs access tokens with an RSA key pair, mounted read-only into the container from `user-service/keys/` (git-ignored, never baked into the image):

```bash
mkdir -p user-service/keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out user-service/keys/private.pem
openssl pkey -in user-service/keys/private.pem -pubout -out user-service/keys/public.pem
```

The container runs as a non-root user (uid `10001`). On a Linux host, make the keys readable to it,
e.g. `sudo chown 10001 user-service/keys/*.pem` (Docker Desktop on Windows/macOS needs no change).

## 3. Build and start

```bash
docker compose build user-service
docker compose up -d user-service          # also starts user-db and waits for it to be healthy
docker compose logs -f user-service
```

The API is then available at `http://localhost:${USER_SERVICE_PORT}` (default `http://localhost:8081`).

Stop with `docker compose down` (add `-v` to also delete the database volume).

## Administrator bootstrap

Registration (`POST /auth/register`) always creates a **Student**. The first **Administrator** is created from
the `BOOTSTRAP_ADMIN_*` variables instead:

- On every startup, if no administrator exists and all three variables are set, the administrator is created through the
  same code path as registration (password hashing, profile). The same email/password rules as registration apply.
- If an administrator already exists, nothing happens (the variables are ignored). Once bootstrapped, you can clear all three.
- If no administrator exists and the variables are **all unset**, a warning is logged and the service starts normally.
- If only **some** are set, or a value is invalid, startup fails with an error naming the variable.
- If the email already belongs to a Student, bootstrap refuses to promote it and fails.
- Concurrent starts are safe: instances serialize on a PostgreSQL advisory lock, so exactly one administrator is created.
- The password is never logged.

### Run the bootstrap as a one-off job

The `user-bootstrap` compose service runs the same image with the `bootstrap-admin` Spring profile: no web server, it
performs the bootstrap and exits. It exits `0` when the administrator was created or already exists, and non-zero on
any failure, **including unset variables**:

```bash
docker compose --profile jobs run --rm user-bootstrap
echo $?
```

Outside compose, the same mode is enabled with `SPRING_PROFILES_ACTIVE=bootstrap-admin`
(or `--spring.profiles.active=bootstrap-admin`).

## Running tests

```bash
cd user-service
./mvnw test
```

The `*IntegrationTest`, `UserApplicationTests` and `LogoutEndpointTest` suites use Testcontainers and need a running Docker daemon.
