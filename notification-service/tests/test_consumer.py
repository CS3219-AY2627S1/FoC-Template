from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.models.notification import Notification
from app.services.consumer import NotificationEventConsumer

TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


class FakeMessage:
    def __init__(
        self, body: bytes, *, routing_key: str = "", message_id: str | None = None
    ) -> None:
        self.body = body
        self.routing_key = routing_key
        self.message_id = message_id
        self.acked = False
        self.rejected = False
        self.requeued: bool | None = None

    async def ack(self) -> None:
        self.acked = True

    async def nack(self, requeue: bool | None = None) -> None:
        self.rejected = True
        self.requeued = requeue


def _body(event_type: str, **overrides) -> bytes:
    payload = {
        "event_type": event_type,
        "order_id": "order-1234-5678",
        "requester_id": "requester-1",
        "timestamp": TS.isoformat(),
        "order_name": "Chicken rice",
    }
    payload.update(overrides)
    return json.dumps(payload).encode()


async def _count(sessionmaker) -> int:
    async with sessionmaker() as s:
        return int(await s.scalar(select(func.count()).select_from(Notification)) or 0)


async def test_duplicate_message_id_inserts_once_per_recipient_N1_1(sessionmaker):
    consumer = NotificationEventConsumer(session_factory=sessionmaker)
    body = _body("OrderApproved", courier_id="courier-1")

    for _ in range(2):
        message = FakeMessage(body, routing_key="OrderApproved", message_id="evt-fixed")
        await consumer._on_message(message)
        assert message.acked is True

    assert await _count(sessionmaker) == 2


async def test_malformed_body_is_rejected_without_requeue(sessionmaker):
    consumer = NotificationEventConsumer(session_factory=sessionmaker)
    message = FakeMessage(b"not json", routing_key="OrderAccepted")

    await consumer._on_message(message)

    assert message.rejected is True
    assert message.requeued is False
    assert await _count(sessionmaker) == 0


async def test_routing_key_mismatch_is_rejected_without_requeue(sessionmaker):
    consumer = NotificationEventConsumer(session_factory=sessionmaker)
    message = FakeMessage(_body("OrderAccepted"), routing_key="OrderDelivered")

    await consumer._on_message(message)

    assert message.rejected is True
    assert message.requeued is False
    assert await _count(sessionmaker) == 0


async def test_db_failure_requeues(sessionmaker):
    class FailingChannel:
        async def deliver(self, session, drafts):
            raise OperationalError("INSERT", {}, Exception("db down"))

    consumer = NotificationEventConsumer(session_factory=sessionmaker, channel=FailingChannel())
    message = FakeMessage(_body("OrderAccepted"), routing_key="OrderAccepted")

    await consumer._on_message(message)

    assert message.requeued is True
    assert message.acked is False


async def test_valid_event_persists_and_acks(sessionmaker):
    consumer = NotificationEventConsumer(session_factory=sessionmaker)
    message = FakeMessage(_body("OrderAccepted"), routing_key="OrderAccepted", message_id="evt-1")

    await consumer._on_message(message)

    assert message.acked is True
    async with sessionmaker() as s:
        rows = (await s.execute(select(Notification))).scalars().all()
    assert len(rows) == 1
    row = rows[0]
    assert row.recipient_id == "requester-1"
    assert row.order_status == "ACCEPTED"
    assert row.title == "Courier found"
    assert row.body == 'A courier accepted "Chicken rice".'
