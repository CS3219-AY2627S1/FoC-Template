from __future__ import annotations

import asyncio
import hashlib
import logging

import aio_pika
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.db import SessionLocal
from app.schemas.events import NotificationSourceEvent
from app.services.channels import DeliveryChannel, InAppChannel
from app.services.rules import build_notifications

logger = logging.getLogger(__name__)

# OrderCompleted is bound for forward-compat; order-service never publishes it today.
ROUTING_KEYS = (
    "OrderAccepted",
    "OrderPickedUp",
    "OrderDelivered",
    "CourierWithdrawn",
    "OrderExpired",
    "OrderCancelled",
    "OrderApproved",
    "OrderCompleted",
)


def _derived_id(event: NotificationSourceEvent) -> str:
    key = f"{event.event_type}|{event.order_id}|{event.timestamp.isoformat()}"
    return hashlib.sha256(key.encode()).hexdigest()


class NotificationEventConsumer:
    """Long-running consumer started from the app lifespan."""

    def __init__(
        self, session_factory=SessionLocal, channel: DeliveryChannel | None = None
    ) -> None:
        self._session_factory = session_factory
        self._channel = channel or InAppChannel()

    async def run(self) -> None:
        """Reconnect loop: survives broker outages so /health stays up."""
        while True:
            try:
                connection = await aio_pika.connect_robust(settings.rabbitmq_url)
                async with connection:
                    await self._consume(connection)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Notification event consumer crashed; reconnecting in 5s.")
                await asyncio.sleep(5)

    async def _consume(self, connection: aio_pika.abc.AbstractRobustConnection) -> None:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)

        exchange = await channel.declare_exchange(
            settings.order_events_exchange, aio_pika.ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue(settings.order_events_queue, durable=True)
        for routing_key in ROUTING_KEYS:
            await queue.bind(exchange, routing_key=routing_key)

        await queue.consume(self._on_message)
        logger.info(
            "Notification event consumer started (queue %s on %s).",
            settings.order_events_queue,
            settings.order_events_exchange,
        )
        await asyncio.Future()

    async def _on_message(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        try:
            try:
                event = NotificationSourceEvent.model_validate_json(message.body)
            except ValidationError:
                logger.warning("Invalid event payload; dead-lettering (body=%s).", message.body)
                await message.nack(requeue=False)
                return

            if message.routing_key != event.event_type:
                logger.warning(
                    "Routing key mismatch (routing_key=%s, event_type=%s); dead-lettering.",
                    message.routing_key,
                    event.event_type,
                )
                await message.nack(requeue=False)
                return

            event_id = message.message_id or _derived_id(event)
            drafts = build_notifications(event, event_id)

            async with self._session_factory() as session:
                async with session.begin():
                    await self._channel.deliver(session, drafts)
            await message.ack()
        except SQLAlchemyError:
            # Transient DB failure: requeue so a healthy worker retries it.
            logger.exception("Database error handling event; requeueing (body=%s).", message.body)
            await message.nack(requeue=True)
