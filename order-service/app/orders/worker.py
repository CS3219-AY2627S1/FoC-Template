# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented the pending Order creation recovery worker.
# Author review: I validated correctness and added boundary checks where needed.

"""Restartable creation reconciler. Run independently with `order-recovery`."""

import asyncio
import logging

import httpx
from asyncpg import PostgresError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db import Database, DatabaseUnavailableError
from app.orders.clients import ServiceClients
from app.orders.repository import OrderRepository
from app.orders.service import CreationService

logger = logging.getLogger("foc.order.recovery")


async def run_batch(repository, clients, batch_size=50):
    service = CreationService(repository, clients)
    for operation_id in await repository.due(batch_size):
        await service.recover(operation_id)


async def run():
    settings = get_settings()
    url = settings.database_url
    database = Database(url.get_secret_value() if url else None)
    repository = OrderRepository(database.session_context)
    try:
        async with httpx.AsyncClient(trust_env=False) as http:
            clients = ServiceClients(settings, http)
            while True:
                try:
                    await run_batch(repository, clients, settings.recovery_batch_size)
                except (
                    SQLAlchemyError,
                    PostgresError,
                    DatabaseUnavailableError,
                    OSError,
                    TimeoutError,
                ):
                    logger.warning("Creation recovery storage unavailable; retrying")
                await asyncio.sleep(settings.recovery_interval_seconds)
    finally:
        await database.dispose()


def main():
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
