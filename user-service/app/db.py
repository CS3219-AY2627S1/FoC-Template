# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Tool: GitHub Copilot, date: 2026-09-20
# Scope: Implemented async database access and corrected PostgreSQL URL and TLS option
# handling.
# Author review: I validated correctness and added boundary checks where needed.

"""Async PostgreSQL connectivity and request-session dependency."""

from __future__ import annotations

from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.logging import logger

_ASYNC_POSTGRESQL_SCHEME = "postgresql+asyncpg://"
_DATABASE_CONNECT_TIMEOUT_SECONDS = 5


def _normalized_asyncpg_url_and_connect_args(database_url: str) -> tuple[str, dict[str, object]]:
    normalized_url = _asyncpg_database_url(database_url)
    split_url = urlsplit(normalized_url)
    query_params = parse_qsl(split_url.query, keep_blank_values=True)

    connect_args: dict[str, object] = {"timeout": _DATABASE_CONNECT_TIMEOUT_SECONDS}
    filtered_query: list[tuple[str, str]] = []
    for key, value in query_params:
        if key != "sslmode":
            filtered_query.append((key, value))
            continue
        if value.lower() in {"require", "verify-ca", "verify-full"}:
            connect_args["ssl"] = True
        elif value.lower() == "disable":
            connect_args["ssl"] = False

    normalized_query = urlencode(filtered_query, doseq=True)
    normalized_database_url = urlunsplit(split_url._replace(query=normalized_query))
    return normalized_database_url, connect_args


class DatabaseUnavailableError(RuntimeError):
    """Raised when a request needs a database session that is not configured."""


def _asyncpg_database_url(database_url: str) -> str:
    """Use asyncpg for ordinary PostgreSQL URLs supplied by deployment config."""

    if database_url.startswith("postgres://"):
        database_url = _ASYNC_POSTGRESQL_SCHEME + database_url.removeprefix("postgres://")
    elif database_url.startswith("postgresql://"):
        database_url = _ASYNC_POSTGRESQL_SCHEME + database_url.removeprefix("postgresql://")

    return database_url


def async_database_url(database_url: str) -> str:
    """Normalize a PostgreSQL URL for SQLAlchemy's asyncpg dialect."""

    split_url = urlsplit(_asyncpg_database_url(database_url))
    query_params = parse_qsl(split_url.query, keep_blank_values=True)
    normalized_query = urlencode(
        [(key, value) for key, value in query_params if key != "sslmode"],
        doseq=True,
    )
    return urlunsplit(split_url._replace(query=normalized_query))


class Database:
    """Own the SQLAlchemy engine without performing schema changes."""

    def __init__(self, database_url: str | None) -> None:
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
        if database_url:
            normalized_database_url, connect_args = _normalized_asyncpg_url_and_connect_args(
                database_url
            )
            self._engine = create_async_engine(
                normalized_database_url,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=5,
                connect_args=connect_args,
            )
            self._session_factory = async_sessionmaker(self._engine, expire_on_commit=False)

    @property
    def configured(self) -> bool:
        return self._engine is not None

    async def ping(self) -> bool:
        """Check PostgreSQL availability with a read-only query."""

        if self._engine is None:
            logger.warning(
                "database is not configured",
                extra={
                    "event": "database_connectivity_check",
                    "context": {"databaseConfigured": False, "ready": False},
                },
            )
            return False
        try:
            async with self._engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except SQLAlchemyError as error:
            logger.warning(
                "database is not ready",
                extra={
                    "event": "database_connectivity_check",
                    "context": {
                        "databaseConfigured": True,
                        "errorType": type(error).__name__,
                        "ready": False,
                    },
                },
            )
            return False

        logger.info(
            "database is ready",
            extra={
                "event": "database_connectivity_check",
                "context": {"databaseConfigured": True, "ready": True},
            },
        )
        return True

    async def session(self) -> AsyncIterator[AsyncSession]:
        """Yield a transaction-capable session for future request handlers."""

        if self._session_factory is None:
            raise DatabaseUnavailableError("Database is not configured.")
        async with self._session_factory() as session:
            yield session

    async def dispose(self) -> None:
        """Release connection-pool resources on application shutdown."""

        if self._engine is not None:
            await self._engine.dispose()


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency for endpoints that need User Service persistence."""

    database: Database = request.app.state.database
    async for session in database.session():
        yield session
