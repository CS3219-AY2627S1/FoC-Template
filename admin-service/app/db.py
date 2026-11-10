# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented async PostgreSQL connectivity and readiness checks.
# Author review: I validated correctness and supplied additional boundary checks.

"""Async PostgreSQL connectivity. Schema changes belong only in SQL migrations."""

import asyncio
import logging
from collections.abc import AsyncIterator

from asyncpg import PostgresError
from fastapi import Request
from sqlalchemy import URL, make_url, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = logging.getLogger("foc.admin.database")
PROBE_TIMEOUT_SECONDS = 5


def connection_options(database_url: str) -> tuple[URL, dict[str, object]]:
    """Accept PostgreSQL URLs and preserve explicitly requested TLS modes."""
    try:
        url = make_url(database_url)
        if url.drivername not in {"postgres", "postgresql", "postgresql+asyncpg"}:
            raise ValueError
        if not url.host or not url.database:
            raise ValueError
        connect_args: dict[str, object] = {"timeout": PROBE_TIMEOUT_SECONDS}
        sslmode = url.query.get("sslmode")
        if sslmode is not None:
            if sslmode not in {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}:
                raise ValueError
            if "ssl" in url.query:
                raise ValueError
            connect_args["ssl"] = sslmode
        return url.set(drivername="postgresql+asyncpg").difference_update_query(
            ["sslmode"]
        ), connect_args
    except (SQLAlchemyError, ValueError, TypeError):
        raise ValueError("DATABASE_URL must be a valid PostgreSQL connection URL.") from None


class DatabaseUnavailableError(RuntimeError):
    """The deployment has not supplied a database connection."""


class Database:
    def __init__(self, database_url: str | None) -> None:
        self._engine = None
        self._sessions = None
        if database_url:
            url, connect_args = connection_options(database_url)
            self._engine = create_async_engine(
                url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=5,
                pool_timeout=PROBE_TIMEOUT_SECONDS,
                hide_parameters=True,
            )
            self._sessions = async_sessionmaker(self._engine, expire_on_commit=False)

    async def ping(self) -> bool:
        """Bound the entire read-only probe, including pool wait and SQL execution."""
        if self._engine is None:
            return False
        try:
            async with asyncio.timeout(PROBE_TIMEOUT_SECONDS):
                async with self._engine.connect() as connection:
                    # A reachable but unmigrated/wrong database is not ready for Admin.
                    result = await connection.scalar(
                        text(
                            "SELECT has_schema_privilege(current_user, "
                            "to_regnamespace('admin_service')::oid, 'USAGE') "
                            "AND has_table_privilege(current_user, "
                            "to_regclass('admin_service.disputes')::oid, 'SELECT') "
                            "AND has_table_privilege(current_user, "
                            "to_regclass('admin_service.dispute_events')::oid, 'SELECT') "
                            "AND has_table_privilege(current_user, "
                            "to_regclass('admin_service.audit_log')::oid, 'SELECT')"
                        )
                    )
                    return result is True
        except (SQLAlchemyError, PostgresError, OSError, TimeoutError):
            # Do not log exception messages, SQL, URLs or credentials.
            logger.warning("Admin database readiness probe failed")
            return False

    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._sessions is None:
            raise DatabaseUnavailableError("Admin database is not configured.")
        async with self._sessions() as session:
            yield session

    def session_context(self) -> AsyncSession:
        if self._sessions is None:
            raise DatabaseUnavailableError("Admin database is not configured.")
        return self._sessions()

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    database: Database = request.app.state.database
    async for session in database.session():
        yield session
