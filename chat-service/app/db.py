# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.models.base import Base


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def create_schema(engine: AsyncEngine) -> None:
    """Create missing tables at start-up, like the other FoC services."""
    async with engine.begin() as conn:
        # Several replicas may boot at once; serialise the DDL.
        await conn.execute(text("SELECT pg_advisory_xact_lock(7243001)"))
        await conn.run_sync(Base.metadata.create_all)
