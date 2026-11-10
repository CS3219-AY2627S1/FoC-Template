from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from common.config_manager import settings


@lru_cache
def get_engine() -> AsyncEngine:
    if settings.database_url is None:
        RuntimeError("DATABASE_URL is not configured")

    return create_async_engine(settings.database_url.get_secret_value(), 
                               pool_pre_ping=True, hide_parameters=True, connect_args={"connect_timeout":5},)

async def get_session() -> AsyncIterator[AsyncSession]:
    session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with session_factory() as session:
        yield session
