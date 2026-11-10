# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: UserCreated exchange and RabbitMQ initialization were later moved here from main.py
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from functools import partial
from typing import NamedTuple

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractExchange
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from auth.events import consume_credit_accounts_sync_requested
from auth.models import ExchangeName, QueueName, RoutingKey


class MessagingResources(NamedTuple):
    connection: AbstractConnection
    channel: AbstractChannel
    user_exchange: AbstractExchange


@asynccontextmanager
async def initialize_messaging(
    rabbitmq_url: str,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[MessagingResources]:
    async with AsyncExitStack() as resources:
        connection = None
        for attempt in range(10):
            try:
                connection = await aio_pika.connect_robust(rabbitmq_url, timeout=5)
                break
            except OSError:
                if attempt < 9:
                    await asyncio.sleep(2)

        if connection is None:
            raise RuntimeError("Could not connect to RabbitMQ")
        resources.push_async_callback(connection.close)

        channel = await connection.channel(
            publisher_confirms=True, on_return_raises=True,
        )
        resources.push_async_callback(channel.close)
        user_exchange = await channel.declare_exchange(
            ExchangeName.USER_EVENTS, aio_pika.ExchangeType.DIRECT, durable=True,
        )
        await channel.set_qos(prefetch_count=1)

        sync_request_queue = await channel.declare_queue(
            QueueName.CREDIT_ACCOUNTS_SYNC_REQUESTED, durable=True, exclusive=False,
        )
        await sync_request_queue.bind(
            user_exchange, routing_key=RoutingKey.CREDIT_ACCOUNTS_SYNC_REQUESTED,
        )
        consumer_tag = await sync_request_queue.consume(
            partial(consume_credit_accounts_sync_requested, session_factory=session_factory),
            no_ack=False,
        )
        resources.push_async_callback(sync_request_queue.cancel, consumer_tag)

        yield MessagingResources(connection, channel, user_exchange)
