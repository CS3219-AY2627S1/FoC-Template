# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented RabbitMQ publication with confirms, leases, and retries.
# Author review: I validated correctness and added boundary checks where needed.

"""RabbitMQ publisher for the deliberately minimal User Service event contract."""

from __future__ import annotations

import json
from typing import Any, Protocol

from app.core.config import Settings
from app.outbox.events import SafeOutboxEvent


class EventPublisher(Protocol):
    """Permit worker tests to publish to a recording fake instead of RabbitMQ."""

    async def publish(self, event: SafeOutboxEvent) -> None:
        """Publish one durable event or raise without exposing its transport secret."""

    async def close(self) -> None:
        """Release any resources held by the publisher."""


class RabbitMqEventPublisher:
    """Lazily connect to the configured RabbitMQ topic exchange."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._connection: Any | None = None
        self._channel: Any | None = None
        self._exchange: Any | None = None

    async def publish(self, event: SafeOutboxEvent) -> None:
        """Persist the safe payload to RabbitMQ with its event ID as message ID."""

        aio_pika = await self._aio_pika()
        exchange = await self._get_exchange(aio_pika)
        payload = event.payload()
        try:
            await exchange.publish(
                aio_pika.Message(
                    body=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=payload["eventId"],
                    type=payload["eventType"],
                ),
                routing_key=payload["eventType"],
            )
        except Exception:
            await self._discard_connection()
            raise

    async def close(self) -> None:
        """Close an open AMQP connection without leaking its URL to logs."""

        await self._discard_connection()

    async def _get_exchange(self, aio_pika: Any) -> Any:
        if self._exchange is not None:
            return self._exchange
        rabbitmq_url = self._settings.rabbitmq_url
        if rabbitmq_url is None:
            raise RuntimeError("RabbitMQ is not configured for the outbox publisher.")
        self._connection = await aio_pika.connect_robust(rabbitmq_url.get_secret_value())
        self._channel = await self._connection.channel(publisher_confirms=True)
        self._exchange = await self._channel.declare_exchange(
            self._settings.outbox_exchange_name,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        return self._exchange

    async def _discard_connection(self) -> None:
        connection = self._connection
        self._connection = None
        self._channel = None
        self._exchange = None
        if connection is not None:
            await connection.close()

    @staticmethod
    async def _aio_pika() -> Any:
        try:
            import aio_pika
        except ModuleNotFoundError as error:
            raise RuntimeError("aio-pika is required to run the outbox publisher.") from error
        return aio_pika
