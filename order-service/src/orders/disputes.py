"""Case creation is serialized by the caller's order row lock."""
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orders.orm_models import (
    CreditCommandOutbox,
    CreditCommandResult,
    CreditStatus,
    ErrandRequest,
    OrderAuditLog,
    OrderDispute,
    Status,
)

INITIALIZATION_TIMEOUT_REASON = (
    'Credit reservation was not confirmed within the initialization deadline. '
    'Any delayed reservation will be refunded automatically.'
)
DELAYED_REFUND_REASON = 'Initialization timed out; delayed reservation is being refunded.'
RECOVERED_REFUND_REASON = 'Initialization timed out; delayed reservation was refunded.'


def record_recovered_refund(order: ErrandRequest) -> bool:
    """Record completion of a delayed initialization refund."""
    if (order.status == Status.EXPIRED and order.credit_operation == 'RELEASE'
            and order.credit_status == CreditStatus.SUCCEEDED
            and order.status_reason == DELAYED_REFUND_REASON):
        order.status_reason = RECOVERED_REFUND_REASON
        return True
    return False


async def _open_dispute(session: AsyncSession, order_id: UUID, kind: Literal['fulfilment', 'financial'], reason: str,
                       actor_id: UUID | None = None) -> OrderDispute:
    existing = await session.scalar(select(OrderDispute).where(
        OrderDispute.order_id == order_id, OrderDispute.kind == kind,
        OrderDispute.closed_at.is_(None),
    ))
    if existing is not None:
        return existing
    case = OrderDispute(order_id=order_id, kind=kind, reason=reason, opened_by=actor_id)
    session.add(case)
    session.add(OrderAuditLog(order_id=order_id, actor_id=actor_id,
                              action="dispute_opened", reason=f"{kind}: {reason}"))
    await session.flush()
    return case


async def close_recovered_timeout_cases(session: AsyncSession, order_id: UUID) -> None:
    """Close system payment reviews after success and receipt of every command outcome."""
    await session.flush()
    unknown_command = select(CreditCommandOutbox.id).where(
        CreditCommandOutbox.order_id == ErrandRequest.id,
        ~select(CreditCommandResult.request_id).where(
            CreditCommandResult.request_id == CreditCommandOutbox.id,
        ).exists(),
    ).exists()
    query = select(ErrandRequest).where(
        ErrandRequest.id == order_id,
        ErrandRequest.credit_status == CreditStatus.SUCCEEDED,
        ~unknown_command,
    )
    orders = await session.scalars(query.with_for_update())
    for order in orders:
        now = await session.scalar(select(func.clock_timestamp()))
        cases = await session.scalars(select(OrderDispute).where(
            OrderDispute.order_id == order.id, OrderDispute.kind == 'financial',
            OrderDispute.closed_at.is_(None), OrderDispute.opened_by.is_(None),
        ).execution_options(populate_existing=True))
        for case in cases:
            case.closed_at = now
            case.closed_by = None
            case.resolution = 'recovered'
            case.resolution_reason = 'Automatically resolved: credit service confirmed successful payment recovery.'
            order.updated_at = now
            session.add(OrderAuditLog(order_id=order.id, actor_id=None, action='dispute_resolved',
                                      reason=f'{case.id} (automatic): {case.resolution_reason}'))


async def open_financial_dispute(session: AsyncSession, order_id: UUID, reason: str,
                                 actor_id: UUID | None = None) -> OrderDispute:
    return await _open_dispute(session, order_id, 'financial', reason, actor_id)


async def open_fulfilment_dispute(session: AsyncSession, order_id: UUID, reason: str,
                                  actor_id: UUID | None = None) -> OrderDispute:
    return await _open_dispute(session, order_id, 'fulfilment', reason, actor_id)
