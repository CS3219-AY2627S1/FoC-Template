# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Implemented persistent UserCreated publication, broker confirmation, and retry handling
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
import logging
from datetime import datetime, timezone

import aio_pika
from aio_pika.abc import AbstractExchange, AbstractIncomingMessage
from pamqp.commands import Basic
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from auth.models import (
    CreditAccountsSyncRequested,
    RoutingKey,
    UserCreated,
    UserCreatedOutboxResponse,
)
from auth.repository import enqueue_user_created_events, find_pending_user_event

logger = logging.getLogger(__name__)


async def consume_credit_accounts_sync_requested(
    message: AbstractIncomingMessage,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    try:
        CreditAccountsSyncRequested.model_validate_json(message.body)
    except ValidationError:
        logger.warning("Invalid credit account reconciliation request; rejecting without requeue",
                       extra={"message_id": message.message_id})
        await message.reject(requeue=False)
        return

    try:
        async with session_factory.begin() as session:
            await enqueue_user_created_events(session)
        await message.ack()
        logger.info("Credit account reconciliation queued through UserCreated outbox")
    except Exception:
        logger.exception("Credit account reconciliation failed; requeuing",
                         extra={"message_id": message.message_id})
        await asyncio.sleep(2)
        try:
            await message.nack(requeue=True)
        except Exception:
            logger.exception("Could not requeue reconciliation; awaiting broker recovery")


async def publish_pending_user_events(
    session_factory: async_sessionmaker[AsyncSession],
    exchange: AbstractExchange,
) -> None:
    for _ in range(100):
        context = {}
        try:
            async with session_factory.begin() as session:
                pending = await find_pending_user_event(session)
                if pending is None:
                    return

                outbox_response = UserCreatedOutboxResponse.model_validate(pending)
                context = {"user_id": outbox_response.user_id}
                payload = UserCreated(
                    event=outbox_response.event,
                    user_id=outbox_response.user_id,
                    created_at=outbox_response.created_at,
                )
                async with asyncio.timeout(5):
                    confirmation = await exchange.publish(
                        aio_pika.Message(
                            body=payload.model_dump_json().encode("utf-8"),
                            content_type="application/json",
                            type=payload.event,
                            message_id=str(outbox_response.user_id),
                            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                        ),
                        routing_key=RoutingKey.USER_CREATED,
                        mandatory=True,
                    )
                if not isinstance(confirmation, Basic.Ack):
                    raise RuntimeError("RabbitMQ did not confirm UserCreated delivery")

                pending.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
            logger.info("user.created_event_published", extra=context)
        except Exception:
            logger.exception("UserCreated publication failed; retained for retry", extra=context)
            return


async def run_user_event_publisher(
    session_factory: async_sessionmaker[AsyncSession],
    exchange: AbstractExchange,
) -> None:
    while True:
        await publish_pending_user_events(session_factory, exchange)
        await asyncio.sleep(2)
