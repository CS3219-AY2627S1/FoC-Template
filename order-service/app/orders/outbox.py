# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented Order event publication and retry-state updates.
# Author review: I validated correctness and added boundary checks where needed.

"""Durable terminal-event delivery with leased, fenced, at-least-once publication."""

import asyncio
import json
import logging
from datetime import UTC, timedelta
from uuid import uuid4

import aio_pika
from sqlalchemy import func, or_, select, update

from app.orders.tables import outbox

logger = logging.getLogger("foc.order.outbox")


def event_payload(event) -> dict[str, str | int]:
    """Explicit allowlist: no user profiles, instructions, credentials or wallet balances."""
    payload = {
        "eventId": str(event["event_id"]),
        "eventType": event["event_type"],
        "orderId": str(event["order_id"]),
        "reservationId": str(event["reservation_id"]),
        "occurredAt": event["occurred_at"].astimezone(UTC).isoformat().replace("+00:00", "Z"),
    }
    if event["event_type"] == "order.completed.v1":
        payload.update(
            requesterId=str(event["requester_id"]),
            courierId=str(event["courier_id"]),
            amount=event["amount"],
        )
    return payload


class OutboxRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    async def claim(self, lease_seconds: float):
        async with self.sessions() as session, session.begin():
            now = await session.scalar(select(func.clock_timestamp()))
            result = await session.execute(
                select(outbox)
                .where(
                    outbox.c.state == "PENDING",
                    outbox.c.next_attempt_at <= now,
                    or_(outbox.c.lease_until.is_(None), outbox.c.lease_until <= now),
                )
                .order_by(outbox.c.next_attempt_at, outbox.c.event_id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            row = result.mappings().one_or_none()
            if row is None:
                return None
            result = await session.execute(
                update(outbox)
                .where(outbox.c.event_id == row["event_id"])
                .values(
                    lease_token=uuid4(),
                    lease_until=now + timedelta(seconds=lease_seconds),
                    publish_attempts=outbox.c.publish_attempts + 1,
                )
                .returning(outbox)
            )
            return result.mappings().one()

    async def finish(self, event, *, failed: bool = False) -> bool:
        async with self.sessions() as session, session.begin():
            now = await session.scalar(select(func.clock_timestamp()))
            values = {"lease_token": None, "lease_until": None, "last_error_code": None}
            if failed:
                delay = min(60, 2 ** min(event["publish_attempts"] - 1, 6))
                values.update(
                    next_attempt_at=now + timedelta(seconds=delay),
                    last_error_code="PUBLISH_UNAVAILABLE",
                )
            else:
                values.update(state="PUBLISHED", published_at=now)
            result = await session.execute(
                update(outbox)
                .where(
                    outbox.c.event_id == event["event_id"],
                    outbox.c.lease_token == event["lease_token"],
                    outbox.c.state == "PENDING",
                )
                .values(**values)
            )
            return result.rowcount == 1


class RabbitPublisher:
    def __init__(self, settings):
        self.settings = settings
        self.connection = None
        self.exchange = None

    async def publish(self, event):
        # Own retry loop recreates connections after failure; no background retry logs with URLs.
        async with asyncio.timeout(self.settings.outbox_publish_timeout_seconds):
            if self.exchange is None:
                url = self.settings.rabbitmq_url
                if not url:
                    raise RuntimeError("RabbitMQ is not configured")
                self.connection = await aio_pika.connect(url.get_secret_value())
                channel = await self.connection.channel(
                    publisher_confirms=True, on_return_raises=True
                )
                self.exchange = await channel.declare_exchange(
                    self.settings.outbox_exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
                )
            payload = event_payload(event)
            confirmation = await self.exchange.publish(
                aio_pika.Message(
                    body=json.dumps(payload, separators=(",", ":")).encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=payload["eventId"],
                    type=payload["eventType"],
                ),
                routing_key=payload["eventType"],
                mandatory=True,
            )
            if confirmation is None:
                raise RuntimeError("Missing publisher confirmation")

    async def close(self):
        connection, self.connection = self.connection, None
        self.exchange = None
        if connection is not None:
            try:
                async with asyncio.timeout(self.settings.outbox_publish_timeout_seconds):
                    await connection.close()
            except Exception:
                # Never include transport exception text (it can contain credentials).
                logger.warning("Publisher connection cleanup deferred")


async def publish_once(repository, publisher, lease_seconds=30) -> bool:
    event = await repository.claim(lease_seconds)
    if event is None:
        return False
    failed = False
    try:
        await publisher.publish(event)
    except Exception:
        failed = True
        await publisher.close()
    changed = await repository.finish(event, failed=failed)
    logger.log(
        logging.WARNING if failed or not changed else logging.INFO,
        "Event event=%s order=%s type=%s attempt=%s outcome=%s",
        event["event_id"],
        event["order_id"],
        event["event_type"],
        event["publish_attempts"],
        "LEASE_LOST" if not changed else "RETRY" if failed else "PUBLISHED",
    )
    return True
