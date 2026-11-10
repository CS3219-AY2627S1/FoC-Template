# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented the Chat outbox worker, RabbitMQ publisher confirms, and retries.
# Author review: I validated correctness and added boundary checks where needed.

"""Independent, lease-based publisher. Confirm uncertainty is intentionally duplicate-safe."""

import asyncio
import json
import logging
from uuid import uuid4

import aio_pika
from pamqp.commands import Basic
from sqlalchemy import text

from app.config import Settings
from app.db import Database

logger = logging.getLogger("chat.outbox")


class Publisher:
    def __init__(self, settings, database):
        self.settings, self.db = settings, database
        self.connection = None
        self.exchange = None

    async def close(self):
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
        self.connection = self.exchange = None

    async def connect(self):
        if self.connection and not self.connection.is_closed and self.exchange:
            return
        await self.close()
        if not self.settings.rabbitmq_url:
            raise RuntimeError("Broker is unconfigured")
        self.connection = await aio_pika.connect(
            self.settings.rabbitmq_url.get_secret_value(), timeout=3
        )
        channel = await self.connection.channel(publisher_confirms=True)
        self.exchange = await channel.declare_exchange(
            self.settings.exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def claim(self):
        token = uuid4()
        async with self.db.transaction() as session:
            row = (
                (
                    await session.execute(
                        text("""
                WITH eligible AS (
                  SELECT id FROM chat_service.outbox_events
                  WHERE published_at IS NULL AND next_attempt_at<=now()
                    AND (lease_until IS NULL OR lease_until<now())
                  ORDER BY occurred_at,id FOR UPDATE SKIP LOCKED LIMIT 1
                ) UPDATE chat_service.outbox_events e
                  SET lease_token=:token, lease_until=now()+:lease*interval '1 second',
                      attempts=attempts+1
                  FROM eligible WHERE e.id=eligible.id RETURNING e.*
            """),
                        {"token": token, "lease": self.settings.outbox_lease_seconds},
                    )
                )
                .mappings()
                .first()
            )
        return dict(row) if row else None

    async def publish(self, row):
        await self.connect()
        envelope = {
            "eventId": str(row["id"]),
            "eventType": row["event_type"],
            "data": row["payload"],
        }
        confirmation = await self.exchange.publish(
            aio_pika.Message(
                body=json.dumps(envelope).encode(),
                content_type="application/json",
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                message_id=str(row["id"]),
                type=row["event_type"],
            ),
            routing_key=row["event_type"],
            mandatory=False,
            timeout=3,
        )
        # No live queues is normal: PostgreSQL supplies offline recovery.
        if not isinstance(confirmation, Basic.Ack):
            raise RuntimeError("Publication was not confirmed")

    async def finish(self, row, succeeded):
        delay = min(2 ** min(row["attempts"], 12), self.settings.outbox_retry_max_seconds)
        async with self.db.transaction() as session:
            await session.execute(
                text("""UPDATE chat_service.outbox_events
                SET published_at=CASE WHEN :ok THEN now() ELSE published_at END,
                    next_attempt_at=now()+:delay*interval '1 second',
                    lease_token=NULL,lease_until=NULL
                WHERE id=:id AND lease_token=:token AND published_at IS NULL"""),
                {"id": row["id"], "token": row["lease_token"], "ok": succeeded, "delay": delay},
            )

    async def run_once(self):
        row = await self.claim()
        if not row:
            return False
        try:
            await self.publish(row)
        except Exception:
            await self.close()
            await self.finish(row, False)
            logger.warning("publication deferred event_id=%s", row["id"])
        else:
            await self.finish(row, True)
        return True

    async def run(self):
        try:
            while True:
                try:
                    processed = await self.run_once()
                except Exception:
                    logger.warning("publisher dependency unavailable")
                    processed = False
                if not processed:
                    await asyncio.sleep(self.settings.outbox_poll_seconds)
        finally:
            await self.close()


async def worker():
    settings = Settings()
    database = Database(settings.database_url.get_secret_value() if settings.database_url else None)
    try:
        await Publisher(settings, database).run()
    finally:
        await database.close()


def main():
    logging.basicConfig(level=logging.INFO)
    for name in ("aio_pika", "aiormq"):
        logging.getLogger(name).setLevel(logging.CRITICAL)
    asyncio.run(worker())


if __name__ == "__main__":
    main()
