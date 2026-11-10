# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Implemented UserCreated consumption with acknowledgement after commit and failure handling
# Author review: I reviewed correctness and edited the changes to fit the project

import asyncio
import logging
from uuid import uuid4

import aio_pika
from aio_pika.abc import AbstractExchange, AbstractIncomingMessage
from pamqp.commands import Basic
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from credit.exceptions import CreditRequestConflictError
from credit.models import (
    CreditAccountsSyncRequested,
    MessageType,
    ReleaseCreditCommand,
    ReserveCreditCommand,
    RoutingKey,
    TransferCreditCommand,
    UserCreated,
)
from credit.service import create_credit_account, process_credit_command

logger = logging.getLogger(__name__)

CREDIT_COMMAND_MODELS = {
    RoutingKey.CREDIT_RESERVE: ReserveCreditCommand,
    RoutingKey.CREDIT_RELEASE: ReleaseCreditCommand,
    RoutingKey.CREDIT_TRANSFER: TransferCreditCommand,
}


# Replay users so Credit can create missing accounts
async def request_credit_account_sync(exchange: AbstractExchange) -> None:
    event = CreditAccountsSyncRequested(event=MessageType.CREDIT_ACCOUNTS_SYNC_REQUESTED)
    try:
        async with asyncio.timeout(5):
            confirmation = await exchange.publish(
                aio_pika.Message(
                    body=event.model_dump_json().encode("utf-8"),
                    content_type="application/json",
                    type=event.event,
                    message_id=str(uuid4()),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=RoutingKey.CREDIT_ACCOUNTS_SYNC_REQUESTED,
                mandatory=True,
            )
        if not isinstance(confirmation, Basic.Ack):
            raise RuntimeError("RabbitMQ did not confirm credit account reconciliation")
    except Exception:
        raise RuntimeError("Could not request credit account reconciliation") from None
    logger.info("Credit account reconciliation requested")


# Create the credit account and initial allocation once
async def consume_user_created(
    message: AbstractIncomingMessage,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    try:
        event = UserCreated.model_validate_json(message.body)
    except ValidationError:
        logger.warning("Invalid UserCreated event; rejecting without requeue",
                       extra={"message_id": message.message_id})
        await message.reject(requeue=False)
        return

    try:
        async with session_factory() as session:
            await create_credit_account(session, event)
        await message.ack()
        logger.info("UserCreated processed", extra={"user_id": event.user_id})
    except Exception:
        logger.exception("UserCreated processing failed; requeuing",
                         extra={"user_id": event.user_id, "message_id": message.message_id})
        await asyncio.sleep(2)
        try:
            await message.nack(requeue=True)
        except Exception:
            logger.exception("Could not requeue UserCreated; awaiting broker recovery")


# Commit the outcome before acknowledging the command
async def consume_credit_command(
    message: AbstractIncomingMessage,
    session_factory: async_sessionmaker[AsyncSession],
    command_exchange: AbstractExchange,
) -> None:
    try:
        credit_command = CREDIT_COMMAND_MODELS[message.routing_key].model_validate_json(message.body)
    except ValidationError:
        logger.warning("Invalid credit command; rejecting without requeue",
                       extra={"message_id": message.message_id, "routing_key": message.routing_key})
        await message.reject(requeue=False)
        return

    context = {
        "command_id": credit_command.request_id,
        "order_id": credit_command.order_id,
        "operation": credit_command.operation,
        "message_id": message.message_id,
        "routing_key": message.routing_key,
        "redelivered": message.redelivered,
    }
    try:
        async with session_factory() as session:
            outcome = await process_credit_command(session, credit_command)
        await message.ack()
        logger.info("credit.command_processed", extra={**context, "outcome": outcome.outcome})
    except CreditRequestConflictError:
        logger.warning("Credit command ID reused; rejecting without requeue", extra=context)
        await message.reject(requeue=False)
    except Exception:
        logger.exception("Credit command processing failed; retrying", extra=context)
        await _retry_credit_command(message, command_exchange)


# Retry through the command exchange so queued commands can run first
async def _retry_credit_command(
    message: AbstractIncomingMessage,
    command_exchange: AbstractExchange,
) -> None:
    await asyncio.sleep(2)
    try:
        confirmation = await command_exchange.publish(
            aio_pika.Message(
                body=message.body,
                content_type=message.content_type or "application/json",
                type=message.type,
                message_id=message.message_id,
                correlation_id=message.correlation_id,
                headers=dict(message.headers),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=message.routing_key,
            mandatory=True,
            timeout=5,
        )
        if not isinstance(confirmation, Basic.Ack):
            raise RuntimeError("RabbitMQ did not confirm the credit retry.")
        await message.ack()
    except Exception:
        logger.exception("Credit retry publication failed; delivery retained",
                         extra={"message_id": message.message_id, "command_id": message.correlation_id})
        if not message.processed:
            try:
                await message.nack(requeue=True)
            except Exception:
                logger.exception("Credit command awaits broker recovery")
