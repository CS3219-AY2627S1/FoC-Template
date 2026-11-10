import asyncio
from collections.abc import AsyncGenerator
from contextlib import AsyncExitStack, asynccontextmanager
from functools import partial

import aio_pika
from aio_pika.exceptions import AMQPConnectionError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from orders.events import consume_credit_result
from orders.models import ExchangeName, RoutingKey
from workers.outbox import publish_outbox_messages


@asynccontextmanager
async def initialize_order_messaging(
    rabbitmq_url: str,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[None]:
    async with AsyncExitStack() as resources:
        connection = None
        for attempt in range(15):
            try:
                connection = await aio_pika.connect_robust(rabbitmq_url, timeout=5)
                break
            except (AMQPConnectionError, ConnectionRefusedError, OSError) as error:
                if attempt == 14:
                    raise RuntimeError("Could not connect to RabbitMQ") from error
                await asyncio.sleep(2)

        if connection is None:
            raise RuntimeError("Could not connect to RabbitMQ")
        resources.push_async_callback(connection.close)

        channel = await connection.channel(
            publisher_confirms=True,
            on_return_raises=True,
        )
        resources.push_async_callback(channel.close)
        await channel.set_qos(prefetch_count=1)
        credit_exchange = await channel.declare_exchange(
            ExchangeName.CREDIT_COMMANDS,
            aio_pika.ExchangeType.DIRECT,
            durable=True,
        )

        result_exchange = await channel.declare_exchange(
            ExchangeName.CREDIT_EVENTS, aio_pika.ExchangeType.DIRECT, durable=True,
        )
        result_queue = await channel.declare_queue("order_credit_results", durable=True)
        await result_queue.bind(result_exchange, routing_key=RoutingKey.CREDIT_OPERATION_RESULT)
        consumer_tag = await result_queue.consume(
            partial(consume_credit_result, session_factory=session_factory), no_ack=False,
        )
        resources.push_async_callback(result_queue.cancel, consumer_tag)

        task = asyncio.create_task(
            publish_outbox_messages(session_factory, credit_exchange),
            name="credit-command-outbox-publisher",
        )
        resources.push_async_callback(_stop_task, task)
        yield


async def _stop_task(task: asyncio.Task[None]) -> None:
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
