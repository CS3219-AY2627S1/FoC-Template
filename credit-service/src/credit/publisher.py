import asyncio
import logging
from datetime import datetime, timezone

import aio_pika
from aio_pika.abc import AbstractExchange
from pamqp.commands import Basic
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from credit.models import CreditOutboxResponse, MessageType, RoutingKey
from credit.repository import find_pending_credit_outcome

logger = logging.getLogger(__name__)


async def publish_pending_credit_events(
    session_factory: async_sessionmaker[AsyncSession], exchange: AbstractExchange,
) -> None:
    for _ in range(100):
        context = {}
        try:
            async with session_factory.begin() as session:
                pending = await find_pending_credit_outcome(session)
                if pending is None:
                    return
                outbox_response = CreditOutboxResponse.model_validate(pending)
                payload = outbox_response.payload.result
                context = {"command_id": outbox_response.request_id, "order_id": payload.order_id}
                if payload.request_id != outbox_response.request_id:
                    raise ValueError("The stored outcome has a different request ID.")
                logger.info("credit.result_publishing", extra=context)
                # RabbitMQ routes this result to Order's queue
                confirmation = await exchange.publish(
                    aio_pika.Message(
                        body=payload.model_dump_json().encode("utf-8"),
                        content_type="application/json",
                        type=MessageType.CREDIT_OPERATION_RESULT,
                        message_id=str(outbox_response.request_id),
                        correlation_id=str(outbox_response.request_id),
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    ),
                    routing_key=RoutingKey.CREDIT_OPERATION_RESULT,
                    mandatory=True,
                    timeout=5,
                )
                if not isinstance(confirmation, Basic.Ack):
                    raise RuntimeError("RabbitMQ did not confirm the credit outcome.")
                # Order processes the result after this broker confirmation
                pending.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
            logger.info("credit.result_published", extra=context)
        except Exception:
            logger.exception("Credit outcome publication failed; retained for retry", extra=context)
            return


async def run_credit_event_publisher(
    session_factory: async_sessionmaker[AsyncSession], exchange: AbstractExchange,
) -> None:
    while True:
        await publish_pending_credit_events(session_factory, exchange)
        await asyncio.sleep(2)
