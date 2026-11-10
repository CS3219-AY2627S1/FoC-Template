# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-15
# Scope: Added RabbitMQ and PostgreSQL consumer integration tests, including dead-letter
# replay.
# Author review: I validated correctness and supplied additional boundary checks.

"""Real RabbitMQ + PostgreSQL consumer checks. Needs CREDIT_TEST_DATABASE_URL (disposable)
and CREDIT_TEST_RABBITMQ_URL; uses a throwaway exchange and queues, never foc.events."""

import asyncio
import io
import json
import os
from contextlib import suppress
from datetime import UTC, datetime
from uuid import uuid4

import aio_pika
import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.credits.consumer import run
from app.credits.replay import replay
from app.db import Database

pytestmark = pytest.mark.integration
TABLES = (
    "credit_service.event_failures, credit_service.processed_events, "
    "credit_service.credit_transactions, credit_service.order_reservations, "
    "credit_service.wallets"
)


@pytest.fixture
async def environment():
    database_url = os.environ.get("CREDIT_TEST_DATABASE_URL")
    broker_url = os.environ.get("CREDIT_TEST_RABBITMQ_URL")
    if not database_url or not broker_url:
        pytest.skip("Set CREDIT_TEST_DATABASE_URL and CREDIT_TEST_RABBITMQ_URL")
    suffix = uuid4().hex[:8]
    settings = Settings(
        _env_file=None,
        database_url=database_url,
        rabbitmq_url=broker_url,
        initial_credit_allocation=20,
        event_exchange_name=f"credit-test-events-{suffix}",
        consumer_queue_name=f"credit-test-{suffix}",
        consumer_retry_delay_seconds=1,
        consumer_max_attempts=3,
    )
    database = Database(database_url)
    async with database.session_context() as session, session.begin():
        await session.execute(text(f"TRUNCATE {TABLES}"))
    consumer = asyncio.create_task(run(settings))
    connection = await aio_pika.connect(broker_url)
    channel = await connection.channel(publisher_confirms=True)
    exchange = await channel.declare_exchange(
        settings.event_exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
    )
    # The DLQ is declared last, after every routing-key binding: the topology is complete.
    await wait_for(lambda: queue_exists(connection, settings.consumer_queue_name + ".dlq"))
    yield settings, database, channel, exchange
    consumer.cancel()
    with suppress(asyncio.CancelledError):
        await consumer
    for name in ("", ".retry", ".dlq"):
        with suppress(aio_pika.exceptions.AMQPException):
            await channel.queue_delete(settings.consumer_queue_name + name)
    with suppress(aio_pika.exceptions.AMQPException):
        await channel.exchange_delete(settings.event_exchange_name)
    await connection.close()
    await database.dispose()


async def queue_exists(connection, name: str) -> bool:
    probe = await connection.channel()
    try:
        await probe.declare_queue(name, passive=True)
        return True
    except aio_pika.exceptions.ChannelClosed:
        return False
    finally:
        with suppress(Exception):
            await probe.close()


async def wait_for(check, timeout: float = 15):
    deadline = asyncio.get_running_loop().time() + timeout
    while True:
        if await check():
            return
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("condition not reached in time")
        await asyncio.sleep(0.2)


async def publish(exchange, payload: dict, amqp_type: str | None = None):
    event_type = amqp_type or payload["eventType"]
    await exchange.publish(
        aio_pika.Message(
            body=json.dumps(payload).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=payload.get("eventId"),
            type=event_type,
        ),
        routing_key=event_type,
    )


async def scalar(database, sql: str, **params):
    async with database.session_context() as session:
        return await session.scalar(text(sql), params)


def registration(user_id, event_id=None) -> dict:
    return {
        "eventId": str(event_id or uuid4()),
        "eventType": "user.registered.v1",
        "userId": str(user_id),
        "occurredAt": datetime.now(UTC).isoformat(),
    }


async def test_registration_creates_one_wallet_despite_redelivery(environment):
    _, database, _, exchange = environment
    user, event_id = uuid4(), uuid4()
    for _ in range(3):
        await publish(exchange, registration(user, event_id))

    async def processed():
        return await scalar(
            database,
            "SELECT count(*) = 1 FROM credit_service.processed_events WHERE event_id = :e",
            e=event_id,
        )

    await wait_for(processed)
    await asyncio.sleep(1)  # let the redeliveries drain
    assert await scalar(
        database,
        "SELECT available FROM credit_service.wallets WHERE user_id = :u",
        u=user,
    ) == 20
    assert await scalar(
        database,
        "SELECT count(*) FROM credit_service.credit_transactions WHERE wallet_user_id = :u",
        u=user,
    ) == 1


async def test_unprocessable_events_are_dead_lettered_and_recorded(environment):
    settings, database, channel, exchange = environment
    await publish(exchange, registration(uuid4()), amqp_type="order.failed.v1")
    unknown = {
        "eventId": str(uuid4()),
        "eventType": "order.cancelled.v1",
        "orderId": str(uuid4()),
        "reservationId": str(uuid4()),
        "occurredAt": datetime.now(UTC).isoformat(),
    }
    await publish(exchange, unknown)
    dlq = await channel.declare_queue(settings.consumer_queue_name + ".dlq", durable=True)

    async def both_dead_lettered():
        return (await dlq.declare()).message_count == 2

    await wait_for(both_dead_lettered)
    codes = (
        await scalar(
            database,
            "SELECT string_agg(error_code, ',' ORDER BY error_code) "
            "FROM credit_service.event_failures WHERE dead_lettered",
        )
    ).split(",")
    assert codes == ["INVALID_EVENT", "UNKNOWN_RESERVATION"]


async def test_replay_applies_an_event_dead_lettered_earlier(environment):
    settings, database, channel, _ = environment
    user = uuid4()
    payload = registration(user)
    # As if it had been dead-lettered before the cause was fixed.
    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(payload).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=payload["eventId"],
            type=payload["eventType"],
            headers={"x-foc-attempt": 3, "x-foc-error": "STORAGE_ERROR"},
        ),
        routing_key=settings.consumer_queue_name + ".dlq",
    )
    listing = io.StringIO()
    assert await replay(settings, limit=None, list_only=True, out=listing) == 1
    assert "error=STORAGE_ERROR" in listing.getvalue()
    assert await replay(settings, limit=None, list_only=False, out=io.StringIO()) == 1

    async def credited():
        return await scalar(
            database,
            "SELECT available = 20 FROM credit_service.wallets WHERE user_id = :u",
            u=user,
        )

    await wait_for(credited)
    dlq = await channel.declare_queue(settings.consumer_queue_name + ".dlq", durable=True)
    assert dlq.declaration_result.message_count == 0
    assert await replay(settings, limit=None, list_only=False, out=io.StringIO()) == 0
