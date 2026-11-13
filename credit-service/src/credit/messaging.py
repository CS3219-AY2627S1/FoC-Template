# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-06
# Scope: Initial RabbitMQ connection and channel setup was later moved here from main.py
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: UserCreated exchange, durable queue, binding, and consumer setup were later moved here
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from functools import partial
from typing import NamedTuple

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractExchange
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from credit.events import (
    CREDIT_COMMAND_MODELS,
    consume_credit_command,
    consume_user_created,
)
from credit.models import ExchangeName, QueueName, RoutingKey


class MessagingResources(NamedTuple):
    connection: AbstractConnection
    channel: AbstractChannel
    user_exchange: AbstractExchange
    credit_exchange: AbstractExchange
    result_exchange: AbstractExchange


@asynccontextmanager
async def initialize_messaging(
    rabbitmq_url: str,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[MessagingResources]:
    async with AsyncExitStack() as resources:
        connection = None
        for attempt in range(15):
            try:
                connection = await aio_pika.connect_robust(rabbitmq_url, timeout=5)
                break
            except Exception:
                if attempt < 14:
                    await asyncio.sleep(2)

        if connection is None:
            raise RuntimeError("Could not connect to RabbitMQ")
        resources.push_async_callback(connection.close)

        channel = await connection.channel(
            publisher_confirms=True, on_return_raises=True,
        )
        resources.push_async_callback(channel.close)
        await channel.set_qos(prefetch_count=1)

        user_exchange = await channel.declare_exchange(
            ExchangeName.USER_EVENTS, aio_pika.ExchangeType.DIRECT, durable=True,
        )

        user_created_queue = await channel.declare_queue(
            QueueName.CREDIT_USER_CREATED, durable=True, exclusive=False,
        )
        await user_created_queue.bind(user_exchange, routing_key=RoutingKey.USER_CREATED)
        user_created_tag = await user_created_queue.consume(
            partial(consume_user_created, session_factory=session_factory),
            no_ack=False,
        )
        resources.push_async_callback(user_created_queue.cancel, user_created_tag)

        sync_request_queue = await channel.declare_queue(
            QueueName.CREDIT_ACCOUNTS_SYNC_REQUESTED, durable=True, exclusive=False,
        )
        await sync_request_queue.bind(
            user_exchange, routing_key=RoutingKey.CREDIT_ACCOUNTS_SYNC_REQUESTED,
        )

        # Order sends credit commands here
        credit_exchange = await channel.declare_exchange(
            ExchangeName.CREDIT_COMMANDS, aio_pika.ExchangeType.DIRECT, durable=True,
        )

        # Credit sends operation results here
        result_exchange = await channel.declare_exchange(
            ExchangeName.CREDIT_EVENTS, aio_pika.ExchangeType.DIRECT, durable=True,
        )

        # Order validates users and order states
        # Shared broker credentials allow other services to publish too
        command_queue = await channel.declare_queue(QueueName.CREDIT_COMMANDS, durable=True)
        for routing_key in CREDIT_COMMAND_MODELS:
            await command_queue.bind(credit_exchange, routing_key=routing_key)
        command_tag = await command_queue.consume(
            partial(
                consume_credit_command, session_factory=session_factory,
                command_exchange=credit_exchange,
            ),
            no_ack=False,
        )
        resources.push_async_callback(command_queue.cancel, command_tag)

        yield MessagingResources(
            connection, channel, user_exchange, credit_exchange, result_exchange,
        )
