"""Correlate durable Credit outcomes and open financial cases without losing milestones."""
import logging
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orders.deadlines import init_window, open_window, settlement_window
from orders.disputes import (
    DELAYED_REFUND_REASON,
    close_recovered_timeout_cases,
    open_financial_dispute,
    record_recovered_refund,
)
from orders.models import (
    CreditOperationOutcome,
    CreditRejectionReason,
    CreditResult,
    ReleaseCreditCommand,
    RoutingKey,
)
from orders.orm_models import (
    CreditCommandOutbox,
    CreditCommandResult,
    CreditStatus,
    ErrandRequest,
    Status,
)

from orders.repository import add_credit_command

logger = logging.getLogger(__name__)


async def _apply(session: AsyncSession, result: CreditResult, routing_key: RoutingKey) -> None:
    command = await session.scalar(select(CreditCommandOutbox).where(
        CreditCommandOutbox.id == result.request_id).with_for_update().execution_options(populate_existing=True))
    if command is None or command.order_id != result.order_id or command.routing_key != routing_key:
        raise ValueError("Credit result does not match the original command")
    saved = await session.get(CreditCommandResult, result.request_id)
    if saved is not None:
        if saved.payload != result.model_dump(mode="json"):
            raise ValueError("Credit returned a different outcome for the same request")
        return
    order = await session.scalar(select(ErrandRequest).where(ErrandRequest.id == result.order_id)
                                 .with_for_update().execution_options(populate_existing=True))
    if order is None:
        raise ValueError("Credit result references an unknown order")
    now = await session.scalar(select(func.clock_timestamp()))
    session.add(CreditCommandResult(request_id=result.request_id, payload=result.model_dump(mode="json")))
    rejected = result.outcome == CreditOperationOutcome.REJECTED
    command.last_error = f"Credit {result.operation} rejected: {result.reason}" if rejected else None
    order.credit_operation = result.operation.value
    order.credit_status = CreditStatus.REJECTED if rejected else CreditStatus.SUCCEEDED
    order.updated_at = now
    if rejected:
        if result.operation.value == "RESERVE" and order.status == Status.INIT:
            order.status = Status.REJECTED
        # Missing wallets and insufficient funds are ordinary checkout refusals,
        # not failed financial obligations: no funds were reserved or moved.
        if not (
            result.operation.value == "RESERVE"
            and result.reason in (
                CreditRejectionReason.INSUFFICIENT_CREDITS,
                CreditRejectionReason.ACCOUNT_NOT_FOUND,
            )
        ):
            await open_financial_dispute(session, order.id, f"{result.operation.value} rejected: {result.reason}")
        return
    if result.operation.value == "RESERVE":
        if order.status == Status.INIT and order.created_at + init_window() <= now:
            order.status = Status.EXPIRED
        if order.status == Status.INIT:
            order.status = Status.OPEN
            window = open_window()
            order.expires_at = now + window
            logger.info(
                "order.deadline_selected: acceptance window %s seconds; expires_at=%s",
                window.total_seconds(), order.expires_at.isoformat(),
                extra={"order_id": order.id, "command_id": result.request_id},
            )
        elif order.status == Status.EXPIRED:
            release = await session.scalar(select(CreditCommandOutbox.id).where(
                CreditCommandOutbox.order_id == order.id,
                CreditCommandOutbox.routing_key == RoutingKey.CREDIT_RELEASE).limit(1))
            if release is None:
                add_credit_command(session, ReleaseCreditCommand(request_id=uuid4(), order_id=order.id))
                order.credit_operation = "RELEASE"
                order.credit_status = CreditStatus.PENDING
                order.settlement_due_at = now + settlement_window()
                order.status_reason = DELAYED_REFUND_REASON
    elif result.operation.value == "TRANSFER":
        # Only participant-confirmed receipt completes fulfilment. An admin payment
        # settles the dispute without inventing delivery or receipt milestones.
        if order.status == Status.RECEIVED:
            order.status = Status.COMPLETED
        order.settlement_due_at = None
    elif result.operation.value == "RELEASE":
        order.settlement_due_at = None
        record_recovered_refund(order)
    await close_recovered_timeout_cases(session, order.id)


async def handle_reservation_result(session: AsyncSession, result: CreditResult) -> None:
    await _apply(session, result, RoutingKey.CREDIT_RESERVE)


async def handle_release_result(session: AsyncSession, result: CreditResult) -> None:
    await _apply(session, result, RoutingKey.CREDIT_RELEASE)


async def handle_transfer_result(session: AsyncSession, result: CreditResult) -> None:
    await _apply(session, result, RoutingKey.CREDIT_TRANSFER)
