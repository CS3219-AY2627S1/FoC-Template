from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from common.config_manager import settings


@lru_cache
def get_engine() -> AsyncEngine:
    if settings.database_url is None or not settings.database_url.get_secret_value():
        raise RuntimeError("DATABASE_URL is not configured")

    database_url = make_url(settings.database_url.get_secret_value())
    if database_url.drivername == "postgresql":
        database_url = database_url.set(drivername="postgresql+psycopg")

    connect_args = {"connect_timeout": 5} if database_url.get_backend_name() == "postgresql" else {}
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args=connect_args,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with session_factory() as session:
        yield session
