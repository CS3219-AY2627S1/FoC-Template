# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Outbox relay: publishes domain events written in the same transaction as the data.

Delivery is at-least-once. Each AMQP message carries message_id = outbox id so consumers
(e.g. a notification service) can drop duplicates.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Protocol

import aio_pika
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.repositories import outbox as outbox_repo

log = logging.getLogger(__name__)


class EventPublisher(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def publish(self, event_id: int, topic: str, body: dict[str, Any]) -> None: ...


class LogEventPublisher:
    """Used when no broker is configured: the events are logged and marked published."""

    async def start(self) -> None:
        log.info("CHAT_AMQP_URL not set: outbox events will be logged, not published")

    async def stop(self) -> None:
        pass

    async def publish(self, event_id: int, topic: str, body: dict[str, Any]) -> None:
        log.debug("event %s %s", event_id, topic)


class AmqpEventPublisher:
    def __init__(self, url: str, exchange: str):
        self.url = url
        self.exchange_name = exchange
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def start(self) -> None:
        self._connection = await aio_pika.connect_robust(self.url)
        channel = await self._connection.channel(publisher_confirms=True)
        self._exchange = await channel.declare_exchange(
            self.exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        log.info("publishing outbox events to topic exchange %r", self.exchange_name)

    async def stop(self) -> None:
        if self._connection is not None:
            await self._connection.close()

    async def publish(self, event_id: int, topic: str, body: dict[str, Any]) -> None:
        assert self._exchange is not None
        await self._exchange.publish(
            aio_pika.Message(
                json.dumps(body, default=str).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                message_id=str(event_id),
                type=topic,
            ),
            routing_key=topic,
        )


class OutboxRelay:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        publisher: EventPublisher,
    ):
        self.sessionmaker = sessionmaker
        self.settings = settings
        self.publisher = publisher

    async def run_once(self) -> int:
        async with self.sessionmaker() as session, session.begin():
            # Locked rows are skipped, so several replicas can relay safely.
            rows = await outbox_repo.lock_unpublished(session, self.settings.outbox_batch_size)
            for row in rows:
                await self.publisher.publish(
                    row.id,
                    row.topic,
                    {
                        "id": row.id,
                        "topic": row.topic,
                        "payload": row.payload,
                        "created_at": row.created_at.isoformat(),
                    },
                )
            await outbox_repo.mark_published(session, [r.id for r in rows])
            return len(rows)

    async def run_forever(self) -> None:
        while True:
            try:
                count = await self.run_once()
                if count < self.settings.outbox_batch_size:
                    await asyncio.sleep(self.settings.outbox_poll_interval_s)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("outbox relay failed; retrying")
                await asyncio.sleep(5)
