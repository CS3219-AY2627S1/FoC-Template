import asyncio
import logging

from aio_pika.abc import AbstractIncomingMessage
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from orders.credit_results import (
    handle_release_result,
    handle_reservation_result,
    handle_transfer_result,
)
from orders.models import (
    CreditOperation,
    CreditResult,
)

logger = logging.getLogger(__name__)


async def consume_credit_result(
    message: AbstractIncomingMessage,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    try:
        result = CreditResult.model_validate_json(message.body)
    except ValidationError:
        logger.warning("Invalid CreditOperationResult; rejecting without requeue",
                       extra={"message_id": message.message_id})
        await message.reject(requeue=False)
        return

    context = {"command_id": result.request_id, "order_id": result.order_id,
               "operation": result.operation, "message_id": message.message_id,
               "routing_key": message.routing_key, "redelivered": message.redelivered}
    logger.info("order.credit_result_received", extra=context)
    try:
        async with session_factory.begin() as session:
            match result.operation:
                case CreditOperation.RESERVE:
                    await handle_reservation_result(session, result)
                case CreditOperation.RELEASE:
                    await handle_release_result(session, result)
                case CreditOperation.TRANSFER:
                    await handle_transfer_result(session, result)
    except ValueError as error:
        logger.warning("Credit result rejected: %s", error, extra=context)
        await message.reject(requeue=False)
        return
    except Exception:
        logger.exception("Credit result failed; retrying", extra=context)
        await asyncio.sleep(2)
        await message.nack(requeue=True)
        return

    await message.ack()
    logger.info("order.credit_result_processed", extra={**context, "outcome": result.outcome})
