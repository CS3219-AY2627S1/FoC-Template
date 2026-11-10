# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented expiry and outbox publisher worker entry points.
# Author review: I validated correctness and added boundary checks where needed.

"""Run expiry and publication separately, so broker outages never block expiry."""

import asyncio
import logging

from asyncpg import PostgresError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db import Database, DatabaseUnavailableError
from app.orders.lifecycle_repository import LifecycleRepository
from app.orders.outbox import OutboxRepository, RabbitPublisher, publish_once

logger = logging.getLogger("foc.order.lifecycle_worker")


async def run(*, publish=False):
    settings = get_settings()
    database = Database(settings.database_url.get_secret_value() if settings.database_url else None)
    lifecycle = LifecycleRepository(database.session_context)
    outbox = OutboxRepository(database.session_context)
    publisher = RabbitPublisher(settings)
    interval = (
        settings.outbox_poll_interval_seconds if publish else settings.expiry_interval_seconds
    )
    try:
        while True:
            try:
                if publish:
                    worked = await publish_once(outbox, publisher, settings.outbox_lease_seconds)
                else:
                    count = await lifecycle.expire_batch(settings.expiry_batch_size)
                    overdue = await lifecycle.overdue_batch(settings.expiry_batch_size)
                    worked = max(count, overdue) == settings.expiry_batch_size
                    if count:
                        logger.info("Expiry batch committed count=%s", count)
                    if overdue:
                        logger.info("Overdue batch committed count=%s", overdue)
            except (
                SQLAlchemyError,
                PostgresError,
                DatabaseUnavailableError,
                OSError,
                TimeoutError,
            ):
                logger.warning(
                    "Worker=%s storage unavailable; retrying", "outbox" if publish else "expiry"
                )
                worked = False
            # Drain backlogs without sleeping between full batches; yield cooperatively.
            await asyncio.sleep(0 if worked else interval)
    finally:
        await publisher.close()
        await database.dispose()


def expiry_main():
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


def publisher_main():
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(run(publish=True))
    except KeyboardInterrupt:
        pass
