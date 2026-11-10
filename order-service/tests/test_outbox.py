# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented and debugged event publishing and retry handling tests.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.orders.outbox import RabbitPublisher, event_payload, publish_once


def event():
    return dict(
        event_id=uuid4(),
        order_id=uuid4(),
        reservation_id=uuid4(),
        event_type="order.cancelled.v1",
        occurred_at=datetime.now(UTC),
        publish_attempts=1,
        lease_token=uuid4(),
    )


def test_event_allowlist_and_stable_identity():
    item = dict(event(), secret="never-publish", supplier_snapshot={"private": "data"})
    payload = event_payload(item)
    assert set(payload) == {"eventId", "eventType", "orderId", "reservationId", "occurredAt"}
    assert event_payload(item) == payload
    assert payload["occurredAt"].endswith("Z")


@pytest.mark.parametrize("fails", [True, False])
async def test_publication_ack_or_safe_retry(fails, caplog):
    item = event()
    repo = AsyncMock()
    repo.claim.return_value = item
    repo.finish.return_value = True
    publisher = AsyncMock()
    if fails:
        publisher.publish.side_effect = RuntimeError("amqp://user:secret@broker")
    assert await publish_once(repo, publisher)
    repo.finish.assert_awaited_once_with(item, failed=fails)
    assert "secret" not in caplog.text
    if fails:
        publisher.close.assert_awaited_once()


async def test_worker_crash_does_not_ack_event():
    repo, publisher = AsyncMock(), AsyncMock()
    repo.claim.return_value = event()
    publisher.publish.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await publish_once(repo, publisher)
    repo.finish.assert_not_awaited()


async def test_idle_worker_does_not_publish():
    repo, publisher = AsyncMock(), AsyncMock()
    repo.claim.return_value = None
    assert not await publish_once(repo, publisher)
    publisher.publish.assert_not_awaited()


async def test_publisher_enables_confirmations_and_mandatory_routing(monkeypatch):
    connection, channel, exchange = AsyncMock(), AsyncMock(), AsyncMock()
    connection.channel.return_value = channel
    channel.declare_exchange.return_value = exchange
    connect = AsyncMock(return_value=connection)
    monkeypatch.setattr("app.orders.outbox.aio_pika.connect", connect)
    publisher = RabbitPublisher(Settings(_env_file=None, rabbitmq_url="amqp://unused"))
    item = event()
    await publisher.publish(item)
    connection.channel.assert_awaited_once_with(publisher_confirms=True, on_return_raises=True)
    kwargs = exchange.publish.call_args.kwargs
    assert kwargs == {"routing_key": "order.cancelled.v1", "mandatory": True}
    message = exchange.publish.call_args.args[0]
    assert message.message_id == str(item["event_id"])
    assert message.delivery_mode == 2
    await publisher.close()


async def test_publisher_timeout_is_bounded():
    publisher = RabbitPublisher(Settings(_env_file=None, outbox_publish_timeout_seconds=0.01))
    publisher.exchange = AsyncMock()

    async def hang(*args, **kwargs):
        await asyncio.Event().wait()

    publisher.exchange.publish.side_effect = hang
    with pytest.raises(TimeoutError):
        await publisher.publish(event())


def test_outbox_settings_are_safe():
    settings = Settings(_env_file=None, rabbitmq_url="amqp://user:test-password@host")
    assert "test-password" not in repr(settings)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, outbox_lease_seconds=10, outbox_publish_timeout_seconds=5)


async def test_absent_broker_configuration_does_not_publish():
    with pytest.raises(RuntimeError):
        await RabbitPublisher(Settings(_env_file=None, rabbitmq_url=None)).publish(event())
