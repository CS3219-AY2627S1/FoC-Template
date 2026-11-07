from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base


async def _make_engine():
    from app import models  # noqa: F401

    # StaticPool reuses one connection, so every session from this engine sees
    # the same in-memory database (the dedup test spans two sessions).
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = await _make_engine()
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def sessionmaker() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    engine = await _make_engine()
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()
