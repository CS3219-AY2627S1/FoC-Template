# user-service

Manages user **registration, authentication, RBAC, and profile**, including a
user's ability to act as both a **requester** and a **courier** (backlog: User
Service; project M2).

## Responsibilities (from backlog)

- **F1 Registration** - `@u.nus.edu` email + password, OTP email verification,
  uniqueness and password-strength checks; publishes `UserRegistered` so the
  Credit Service can provision the initial credit balance (F1.3).
- **F2 Login / session** - issues a time-limited JWT, supports logout and
  forgotten-password reset via OTP.
- **F3 Profile** - view and update editable fields (display name, contact
  number); the credit balance is read from the Credit Service, not stored here.
- **F4 Roles** - `admin` and `client` (a client is both requester and courier).
- **F5 Admin** - create admins, list clients, suspend / reinstate accounts, and
  change roles.

## API surface

Full contract in [`docs/api-contract.md`](docs/api-contract.md). Endpoints
(mounted under `/users` behind the gateway):

| Method + path | Purpose |
| --- | --- |
| `POST /register` | register with NUS email + password |
| `POST /otp/verify`, `POST /otp/resend` | email OTP verification |
| `POST /password/forgot`, `POST /password/reset` | password reset via OTP |
| `POST /login` | issue session JWT |
| `GET /me`, `PATCH /me` | read / update own profile |
| `POST /admin`, `GET /admin` | create admin, list clients |
| `POST /admin/{id}/suspend`, `/unsuspend` | suspend / reinstate a client |
| `PATCH /admin/{id}/role` | change a user's role |

## Events

Publishes `UserRegistered` (shared schema `foc_shared.events`) to the
`user_events` fanout exchange on successful registration, via a transactional
outbox (`app/services/events.py`, `app/models/outbox.py`). The Credit Service
consumes it to open the user's credit account.

## Data store

Owns PostgreSQL database `user_db`. Models: `user`, `otp`, `outbox`
(`app/models/`). See [`docs/data-model.md`](docs/data-model.md).

## Docs

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Registration / OTP flow: [`docs/flowchart.md`](docs/flowchart.md)

## Layout

```text
app/
├── main.py            # FastAPI app + router wiring
├── config.py          # env-driven settings
├── db.py              # async SQLAlchemy engine/session + Base
├── bootstrap.py       # startup (seed admin, migrations)
├── api/routes/        # health, users
├── models/            # ORM models (user, otp, outbox)
├── schemas/           # Pydantic DTOs
├── services/          # business logic (user, otp, security, events)
└── repositories/      # persistence access
tests/                 # pytest suite
```

## Run

```bash
# via the whole stack
make up

# or just this service's tests
make test-user-service
```

Exposes `GET /health`. Owner: Javier Enrique Wong.
