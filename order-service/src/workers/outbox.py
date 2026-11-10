import asyncio
import json
import logging
import random
from datetime import datetime, timedelta, timezone

import aio_pika
from aio_pika.abc import AbstractExchange
from pamqp.commands import Basic
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from common.config_manager import settings
from orders.models import RoutingKey
from orders.repository import find_pending_credit_command

logger = logging.getLogger(__name__)


def replay_delay_seconds(attempt: int, base_seconds: int) -> float:
    """Equal jitter, capped at 15 minutes; never replay faster than the base wait."""
    base = max(1, base_seconds)
    ceiling = min(max(base, 900), base * 2 ** min(max(attempt - 1, 0), 16))
    return random.uniform(max(base, ceiling / 2), ceiling)


async def publish_outbox_messages(session_factory: async_sessionmaker[AsyncSession], exchange: AbstractExchange,) -> None:
    while True:
        try:
            attempted = await publish_next_outbox_message(session_factory, exchange)

            if not attempted:
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Order outbox publisher failed")
            await asyncio.sleep(2)


async def publish_next_outbox_message(session_factory: async_sessionmaker[AsyncSession], exchange: AbstractExchange,) -> bool:
    async with session_factory.begin() as session:
        outbox_message = await find_pending_credit_command(
            session, settings.credit_result_timeout_seconds,)
        
        if outbox_message is None:
            return False

        replay = outbox_message.published_at is not None
        outbox_message.attempts += 1

        try:
            # add_credit_command already validated the payload before storing it.
            # Publish that wire payload unchanged, including on retries.
            if outbox_message.routing_key not in (
                RoutingKey.CREDIT_RESERVE,
                RoutingKey.CREDIT_RELEASE,
                RoutingKey.CREDIT_TRANSFER,
            ):
                raise ValueError("Unknown credit command routing key")
            if (
                outbox_message.payload.get("request_id") != str(outbox_message.id)
                or outbox_message.payload.get("order_id") != str(outbox_message.order_id)
            ):
                raise ValueError("Outbox payload does not match its stored identifiers")
            
            confirmation = await exchange.publish(
                aio_pika.Message(
                    body=json.dumps(outbox_message.payload).encode("utf-8"),
                    content_type="application/json",
                    type=outbox_message.routing_key,
                    message_id=str(outbox_message.id),
                    correlation_id=str(outbox_message.id),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,),
                routing_key=outbox_message.routing_key,
                mandatory=True,
                timeout=5,
            )
            if not isinstance(confirmation, Basic.Ack):
                raise RuntimeError("RabbitMQ did not confirm credit command publication")
            
        except Exception as error:
            delay_seconds = replay_delay_seconds(outbox_message.attempts, 2)
            outbox_message.available_at = datetime.now(timezone.utc) + timedelta(
                seconds=delay_seconds,
            )
            outbox_message.last_error = f"{type(error).__name__}: {error}"[:2000]
            logger.warning(
                "Could not publish order outbox message; retrying",
                exc_info=True,
                extra={"command_id": outbox_message.id, "order_id": outbox_message.order_id,
                       "attempt": outbox_message.attempts, "retry_in_seconds": delay_seconds,
                       "routing_key": outbox_message.routing_key},
            )
        else:
            # Replaying an unresolved request asks Credit for its saved
            # outcome, request ID prevents another credit action
            outbox_message.published_at = await session.scalar(select(func.clock_timestamp()))
            outbox_message.available_at = outbox_message.published_at + timedelta(
                seconds=replay_delay_seconds(
                    outbox_message.attempts, settings.credit_result_timeout_seconds,
                ),
            )
            outbox_message.last_error = None
            logger.info(
                "order.command_replayed" if replay else "order.command_published",
                extra={"command_id": outbox_message.id, "order_id": outbox_message.order_id,
                       "attempt": outbox_message.attempts, "routing_key": outbox_message.routing_key},
            )
    return True
