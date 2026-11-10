# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Initial database and RabbitMQ lifecycle setup was later moved here from main.py
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: UserCreated consumer lifecycle setup was later moved here from main.py
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager, suppress

from sqlalchemy.ext.asyncio import async_sessionmaker

from common.config_manager import settings
from common.db import get_engine
from common.gateway import get_internal_gateway_url
from credit.events import request_credit_account_sync
from credit.messaging import MessagingResources, initialize_messaging
from credit.orm_models import Base
from credit.publisher import run_credit_event_publisher


@asynccontextmanager
async def initialize_credit_service() -> AsyncIterator[MessagingResources]:
    get_internal_gateway_url()
    if settings.rabbitmq_url is None or not settings.rabbitmq_url.get_secret_value():
        raise RuntimeError("RABBITMQ_URL is not configured")

    engine = get_engine()
    async with AsyncExitStack() as resources:
        resources.push_async_callback(engine.dispose)
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with initialize_messaging(
            settings.rabbitmq_url.get_secret_value(), session_factory,
        ) as messaging:
            await request_credit_account_sync(messaging.user_exchange)
            publisher = asyncio.create_task(
                run_credit_event_publisher(session_factory, messaging.result_exchange),
            )
            try:
                yield messaging
            finally:
                publisher.cancel()
                with suppress(asyncio.CancelledError):
                    await publisher
