# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code; Debugging assistance — write engine and session construction with bounded PostgreSQL connect and pool timeouts so readiness checks do not block on new connections.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — pin the PostgreSQL session time zone to UTC through a shared SESSION_OPTIONS connect option so naive timestamps that bypass the models are read as UTC (ai-20261104-001).
# Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
# Details: notification-service/ai/usage-log.md; ai-20261104-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: Writing implementation code — add a worker-only option with TCP keepalives, tcp_user_timeout, lock_timeout, and statement_timeout, so that a silent database hang raises an error (ai-20261106-002).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261106-002).
# Details: notification-service/ai/usage-log.md; ai-20261106-002

"""SQLAlchemy engine and session construction."""

from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Bound how long a connection attempt may block, so /ready answers quickly
# when the database is unreachable instead of hanging.
CONNECT_TIMEOUT_SECONDS = 3
POOL_TIMEOUT_SECONDS = 3

# Pin the session time zone so that a naive timestamp reaching PostgreSQL
# without going through the models (for example raw SQL) is read as UTC rather
# than the server's local time.
SESSION_TIME_ZONE = "UTC"
# libpq startup options shared by the app engine and Alembic.
SESSION_OPTIONS = f"-c timezone={SESSION_TIME_ZONE}"

# Turn a database that stops responding into a normal error for the worker's
# retries and DLQ. The API does not use these.
WORKER_LOCK_TIMEOUT_SECONDS = 5
WORKER_STATEMENT_TIMEOUT_SECONDS = 10
WORKER_TCP_USER_TIMEOUT_MILLISECONDS = 10_000
WORKER_SESSION_OPTIONS = (
    f"{SESSION_OPTIONS} -c lock_timeout={WORKER_LOCK_TIMEOUT_SECONDS}s "
    f"-c statement_timeout={WORKER_STATEMENT_TIMEOUT_SECONDS}s"
)
WORKER_NETWORK_ARGS = {
    "keepalives": 1,
    "keepalives_idle": 5,
    "keepalives_interval": 2,
    "keepalives_count": 3,
    "tcp_user_timeout": WORKER_TCP_USER_TIMEOUT_MILLISECONDS,
}


class Base(DeclarativeBase):
    """Declarative base for Notification Service tables."""


def make_engine(database_url: str, *, worker_timeouts: bool = False) -> Engine:
    if database_url.startswith("postgresql"):
        connect_args = {
            "connect_timeout": CONNECT_TIMEOUT_SECONDS,
            "options": SESSION_OPTIONS,
        }
        if worker_timeouts:
            connect_args |= WORKER_NETWORK_ARGS
            connect_args["options"] = WORKER_SESSION_OPTIONS
        return create_engine(
            database_url,
            pool_pre_ping=True,
            pool_timeout=POOL_TIMEOUT_SECONDS,
            connect_args=connect_args,
        )
    return create_engine(database_url, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_db(request: Request) -> Generator[Session, None, None]:
    db = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()
