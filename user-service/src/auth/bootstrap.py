# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Registration-event publisher lifecycle setup was later moved here from main.py
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from typing import NamedTuple

from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractExchange
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from auth.events import run_user_event_publisher
from auth.messaging import initialize_messaging
from auth.orm_models import Base, User
from auth.service import hash_password
from common.config_manager import settings
from common.db import get_engine


class UserServiceResources(NamedTuple):
    connection: AbstractConnection
    channel: AbstractChannel
    user_exchange: AbstractExchange
    session_factory: async_sessionmaker[AsyncSession]
    publisher: asyncio.Task[None]


@asynccontextmanager
async def initialize_user_service() -> AsyncIterator[UserServiceResources]:
    if settings.rabbitmq_url is None or not settings.rabbitmq_url.get_secret_value():
        raise RuntimeError("RABBITMQ_URL is not configured")

    engine = get_engine()
    async with AsyncExitStack() as resources:
        resources.push_async_callback(engine.dispose)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory.begin() as session:
            await provision_admin_manager(session)

        async with initialize_messaging(
            settings.rabbitmq_url.get_secret_value(), session_factory,
        ) as messaging:
            publisher = asyncio.create_task(
                run_user_event_publisher(session_factory, messaging.user_exchange),
            )
            try:
                yield UserServiceResources(
                    messaging.connection, messaging.channel, messaging.user_exchange,
                    session_factory, publisher,
                )
            finally:
                publisher.cancel()
                with suppress(asyncio.CancelledError):
                    await publisher


async def provision_admin_manager(session: AsyncSession) -> None:
    result = await session.execute(
        select(User.user_id).where(User.user_role == "admin_manager").limit(1)
    )

    if result.scalar_one_or_none() is not None:
        return

    if (
        settings.initial_admin_username is None
        or settings.initial_admin_email is None
        or settings.initial_admin_password is None
    ):
        raise RuntimeError("Initial Admin Manager credentials are not configured.")

    result = await session.execute(
        select(User.user_id).where(
            or_(
                User.username == settings.initial_admin_username,
                User.user_email == settings.initial_admin_email,
            )
        ).limit(1)
    )

    if result.scalar_one_or_none() is not None:
        raise RuntimeError(
            "Initial Admin Manager username or email is already in use."
        )

    password_hash = hash_password(settings.initial_admin_password.get_secret_value())

    session.add(
        User(
            username=settings.initial_admin_username,
            user_email=settings.initial_admin_email,
            password_hash=password_hash,
            user_role="admin_manager",
        )
    )
