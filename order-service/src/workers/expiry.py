import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from orders.repository import (
    dispute_overdue_orders,
    expire_initializing_orders,
    expire_orders,
)

logger = logging.getLogger(__name__)


async def expiry_worker(session_factory: async_sessionmaker[AsyncSession]) -> None:
    while True:
        try:
            async with session_factory() as session:
                initializing_ids = await expire_initializing_orders(session)
                expired_ids = await expire_orders(session)
                expired_ids.extend(initializing_ids)
                disputed_ids = await dispute_overdue_orders(session)
            for order_id in disputed_ids:
                logger.info("order.disputed_overdue", extra={"order_id": order_id})
            for order_id in expired_ids:
                logger.info("order.expired", extra={"order_id": order_id})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Expiry worker failed")
        await asyncio.sleep(10)
