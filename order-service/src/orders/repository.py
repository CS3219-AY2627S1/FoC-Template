from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from orders.deadlines import init_window, progress_window, settlement_window
from orders.disputes import (
    INITIALIZATION_TIMEOUT_REASON,
    open_financial_dispute,
    open_fulfilment_dispute,
)
from orders.models import CreditCommand, ReleaseCreditCommand, TransferCreditCommand
from orders.orm_models import (
    CreditCommandOutbox,
    CreditCommandResult,
    CreditStatus,
    ErrandRequest,
    OrderAuditLog,
    Status,
)
from orders.policy import can_report_problem, participant_actions


async def find_pending_credit_command(session: AsyncSession, result_timeout_seconds: int) -> CreditCommandOutbox | None:
    has_result = select(CreditCommandResult.request_id).where(
        CreditCommandResult.request_id == CreditCommandOutbox.id).exists()
    return await session.scalar(select(CreditCommandOutbox).where(
        ~has_result, CreditCommandOutbox.available_at <= func.clock_timestamp(),
        or_(CreditCommandOutbox.published_at.is_(None),
            CreditCommandOutbox.published_at <= func.clock_timestamp() - timedelta(seconds=result_timeout_seconds)),
    ).order_by(CreditCommandOutbox.created_at, CreditCommandOutbox.id)
      .limit(1).with_for_update(skip_locked=True))


async def get_open_orders(session: AsyncSession) -> list[ErrandRequest]:
    return list(await session.scalars(select(ErrandRequest).where(
        ErrandRequest.status == Status.OPEN, ErrandRequest.expires_at > func.clock_timestamp(),
    ).order_by(ErrandRequest.created_at.desc())))


async def get_order_by_id(session: AsyncSession, order_id: UUID) -> ErrandRequest | None:
    return await session.get(ErrandRequest, order_id)


async def get_requested_orders(session: AsyncSession, requester_id: UUID) -> list[ErrandRequest]:
    return list(await session.scalars(select(ErrandRequest).where(
        ErrandRequest.requester_id == requester_id).order_by(ErrandRequest.created_at.desc())))


async def get_assigned_orders(session: AsyncSession, courier_id: UUID) -> list[ErrandRequest]:
    return list(await session.scalars(select(ErrandRequest).where(
        ErrandRequest.courier_id == courier_id).order_by(ErrandRequest.created_at.desc())))


async def _clock(session: AsyncSession) -> datetime:
    return (await session.execute(select(func.clock_timestamp()))).scalar_one()


async def _lock_order(session: AsyncSession, order_id: UUID) -> ErrandRequest | None:
    return await session.scalar(select(ErrandRequest).where(
        ErrandRequest.id == order_id).with_for_update().execution_options(populate_existing=True))


def record_order_audit_log(session: AsyncSession, order_id: UUID, action: Status,
                           actor_id: UUID | None = None, reason: str | None = None) -> None:
    session.add(OrderAuditLog(order_id=order_id, actor_id=actor_id, action=action.value, reason=reason))


async def get_order_audit_logs(session: AsyncSession, order_id: UUID) -> list[OrderAuditLog]:
    return list(await session.scalars(select(OrderAuditLog).where(
        OrderAuditLog.order_id == order_id).order_by(OrderAuditLog.created_at, OrderAuditLog.log_id)))


async def accept_order(session: AsyncSession, order_id: UUID, courier_id: UUID) -> ErrandRequest | None:
    order = await _lock_order(session, order_id)
    now = await _clock(session)
    if order is None or "accept" not in participant_actions(order, courier_id, now):
        await session.commit()
        return None
    order.status, order.courier_id = Status.ACCEPTED, courier_id
    order.accepted_at = order.updated_at = now
    order.progress_due_at = now + progress_window()
    record_order_audit_log(session, order.id, Status.ACCEPTED, courier_id)
    await session.commit()
    await session.refresh(order)
    return order


async def _progress(session: AsyncSession, order_id: UUID, actor_id: UUID,
                    target: Status, requester: bool = False) -> ErrandRequest | None:
    order = await _lock_order(session, order_id)
    now = await _clock(session)
    action = {Status.PICKED_UP: "pickup", Status.DELIVERED: "deliver", Status.RECEIVED: "receive"}[target]
    if order is None or action not in participant_actions(order, actor_id, now):
        await session.commit()
        return None
    order.status, order.updated_at = target, now
    order.progress_due_at = now + progress_window()
    if requester:
        assert order.courier_id is not None
        order.credit_status, order.credit_operation = CreditStatus.PENDING, "TRANSFER"
        order.progress_due_at, order.settlement_due_at = None, now + settlement_window()
        add_credit_command(session, TransferCreditCommand(
            request_id=uuid4(), order_id=order.id, courier_id=order.courier_id))
    record_order_audit_log(session, order.id, target, actor_id)
    await session.commit()
    await session.refresh(order)
    return order


async def pickup_order(session: AsyncSession, order_id: UUID, courier_id: UUID) -> ErrandRequest | None:
    return await _progress(session, order_id, courier_id, Status.PICKED_UP)


async def deliver_order(session: AsyncSession, order_id: UUID, courier_id: UUID) -> ErrandRequest | None:
    return await _progress(session, order_id, courier_id, Status.DELIVERED)


async def receive_order(session: AsyncSession, order_id: UUID, requester_id: UUID) -> ErrandRequest | None:
    return await _progress(session, order_id, requester_id, Status.RECEIVED, True)


async def cancel_order(session: AsyncSession, order_id: UUID, requester_id: UUID) -> ErrandRequest | None:
    order = await _lock_order(session, order_id)
    now = await _clock(session)
    if order is None or "cancel" not in participant_actions(order, requester_id, now):
        await session.commit()
        return None
    order.status, order.credit_status = Status.CANCELLED, CreditStatus.PENDING
    order.credit_operation = "RELEASE"
    order.settlement_due_at, order.updated_at = now + settlement_window(), now
    add_credit_command(session, ReleaseCreditCommand(request_id=uuid4(), order_id=order.id))
    record_order_audit_log(session, order.id, Status.CANCELLED, requester_id)
    await session.commit()
    await session.refresh(order)
    return order


def add_credit_command(session: AsyncSession, command: CreditCommand) -> None:
    session.add(CreditCommandOutbox(id=command.request_id, order_id=command.order_id,
                                    routing_key=command.routing_key, payload=command.model_dump(mode="json")))


async def dispute_order(session: AsyncSession, order_id: UUID, actor_id: UUID, reason: str) -> ErrandRequest | None:
    order = await _lock_order(session, order_id)
    if order is None or not can_report_problem(order, actor_id):
        await session.commit()
        return None
    await open_fulfilment_dispute(session, order.id, reason, actor_id)
    order.updated_at = await _clock(session)
    await session.commit()
    await session.refresh(order)
    return order


async def expire_initializing_orders(session: AsyncSession) -> list[UUID]:
    reason = INITIALIZATION_TIMEOUT_REASON
    ids = list(await session.scalars(update(ErrandRequest).where(
        ErrandRequest.status == Status.INIT,
        ErrandRequest.created_at + init_window() <= func.clock_timestamp(),
    ).values(status=Status.EXPIRED, status_reason=reason, updated_at=func.clock_timestamp()).returning(ErrandRequest.id)))
    for order_id in ids:
        record_order_audit_log(session, order_id, Status.EXPIRED, reason=reason)
    await session.commit()
    return ids


async def dispute_overdue_orders(session: AsyncSession) -> list[UUID]:
    """Keep fulfilment milestones; open cases for stalled progress or unknown finance."""
    orders = list(await session.scalars(select(ErrandRequest).where(or_(
        (ErrandRequest.status.in_((Status.ACCEPTED, Status.PICKED_UP, Status.DELIVERED)))
        & (ErrandRequest.progress_due_at <= func.clock_timestamp()),
        (ErrandRequest.credit_status == CreditStatus.PENDING)
        & (ErrandRequest.settlement_due_at <= func.clock_timestamp()),
        (ErrandRequest.credit_status == CreditStatus.PENDING)
        & (ErrandRequest.credit_operation == "RESERVE")
        & (ErrandRequest.created_at + init_window() <= func.clock_timestamp())
        & (ErrandRequest.status == Status.EXPIRED),
    )).with_for_update()))
    ids = []
    now = await _clock(session)
    for order in orders:
        if (order.status in (Status.ACCEPTED, Status.PICKED_UP, Status.DELIVERED)
                and order.progress_due_at is not None and order.progress_due_at <= now):
            await open_fulfilment_dispute(session, order.id, "Fulfilment deadline exceeded.")
        else:
            await open_financial_dispute(session, order.id, "Credit operation overdue; outcome requires reconciliation.")
        ids.append(order.id)
    # Also catch every overdue command, including initialization and refund commands.
    pending = select(CreditCommandOutbox.order_id).where(
        ~select(CreditCommandResult.request_id).where(CreditCommandResult.request_id == CreditCommandOutbox.id).exists(),
        CreditCommandOutbox.created_at + settlement_window() <= func.clock_timestamp(),
    )
    for order in await session.scalars(select(ErrandRequest).where(ErrandRequest.id.in_(pending)).with_for_update()):
        await open_financial_dispute(session, order.id, "Credit operation overdue; reconcile the existing request, never send a duplicate payment.")
        if order.id not in ids:
            ids.append(order.id)
    await session.commit()
    return ids


async def expire_orders(session: AsyncSession) -> list[UUID]:
    reason = "No courier accepted the order within the time limit."
    ids = list(await session.scalars(update(ErrandRequest).where(
        ErrandRequest.status == Status.OPEN, ErrandRequest.expires_at <= func.clock_timestamp(),
    ).values(status=Status.EXPIRED, credit_status=CreditStatus.PENDING, credit_operation="RELEASE",
             settlement_due_at=func.clock_timestamp() + settlement_window(),
             status_reason=reason, updated_at=func.clock_timestamp()).returning(ErrandRequest.id)))
    for order_id in ids:
        add_credit_command(session, ReleaseCreditCommand(request_id=uuid4(), order_id=order_id))
        record_order_audit_log(session, order_id, Status.EXPIRED, reason=reason)
    await session.commit()
    return ids
