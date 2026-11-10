# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented database connections, transactions, and readiness checks.
# Author review: I validated correctness and added boundary checks where needed.

from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, TimeoutError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.errors import unavailable


class Database:
    def __init__(self, url: str | None):
        self.engine = (
            create_async_engine(
                url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=10,
                connect_args={"timeout": 5, "command_timeout": 10},
                hide_parameters=True,
            )
            if url
            else None
        )
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    @asynccontextmanager
    async def transaction(self):
        if not self.engine:
            raise unavailable()
        try:
            async with self.sessions() as session, session.begin():
                yield session
        except (DBAPIError, TimeoutError, OSError) as error:
            raise unavailable() from error

    async def ready(self):
        async with self.transaction() as session:
            for table in (
                "conversations",
                "conversation_participants",
                "messages",
                "blocks",
                "outbox_events",
            ):
                await session.execute(text(f"SELECT 1 FROM chat_service.{table} LIMIT 0"))

    async def close(self):
        if self.engine:
            await self.engine.dispose()
