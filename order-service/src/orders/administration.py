"""Disputed-order review: fulfilment decisions and financial follow-up are separate."""

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orders.deadlines import settlement_window
from orders.models import (
    CaseAction,
    CreditOperationOutcome,
    CreditRejectionReason,
    CreditResult,
    ReleaseCreditCommand,
    ReservationRepair,
    ResolutionAction,
    TransferCreditCommand,
)
from orders.orm_models import (
    CreditCommandOutbox,
    CreditCommandResult,
    CreditStatus,
    ErrandRequest,
    OrderAuditLog,
    OrderDispute,
    Status,
)
from orders.repository import add_credit_command
from orders.schemas import RepairSettlementRequest


class ResolutionConflict(ValueError):
    pass


async def disputed_orders(session: AsyncSession) -> list[ErrandRequest]:
    has_case = (
        select(OrderDispute.id)
        .where(OrderDispute.order_id == ErrandRequest.id)
        .exists()
    )
    return list(
        await session.scalars(
            select(ErrandRequest)
            .where(has_case)
            .order_by(ErrandRequest.updated_at.desc())
        )
    )


@dataclass(frozen=True)
class CommandHistoryEntry:
    command: CreditCommandOutbox
    result: CreditResult | None


@dataclass(frozen=True)
class CasePolicy:
    actions: tuple[CaseAction, ...]
    unavailable_reason: str


def case_policy(
    order: ErrandRequest,
    case: OrderDispute,
    history: Sequence[CommandHistoryEntry],
) -> CasePolicy:
    """One policy for advertised actions and mutation validation.

    Credit remains responsible for validating live balances at execution time.
    """
    if case.closed_at is not None:
        return CasePolicy((), "This dispute is already resolved")
    if not history or any(entry.result is None for entry in history):
        return CasePolicy(
            (), "Reconcile unknown or pending credit outcomes before taking action"
        )
    if case.kind == "fulfilment":
        if (
            order.credit_operation != "RESERVE"
            or order.credit_status != CreditStatus.SUCCEEDED
        ):
            return CasePolicy((), "Fulfilment decisions require confirmed held credits")
        if any(
            entry.command.routing_key in ("credit.release", "credit.transfer")
            for entry in history
        ):
            return CasePolicy(
                (), "A prior release or transfer requires financial investigation"
            )
        if order.status not in (Status.ACCEPTED, Status.PICKED_UP, Status.DELIVERED):
            return CasePolicy((), "The fulfilment milestone is no longer eligible")
        return CasePolicy(
            ("refund", "pay") if order.courier_id else ("refund",),
            "Choose an available fulfilment decision",
        )
    last = history[-1]
    assert last.result is not None  # All command outcomes were checked above.
    if repairable_rejection(last.command, last.result):
        return CasePolicy(
            ("charge_reserved", "cover_reserved"),
            "Choose an available financial action",
        )
    return CasePolicy((), "This rejection requires technical investigation before recovery")


def available_actions(
    order: ErrandRequest,
    history: Sequence[CommandHistoryEntry],
) -> dict[UUID, list[CaseAction]]:
    return {
        case.id: list(case_policy(order, case, history).actions)
        for case in order.disputes
    }


def repairable_rejection(command: CreditCommandOutbox, outcome: CreditResult) -> bool:
    return (
        command.routing_key in ("credit.release", "credit.transfer")
        and outcome.outcome == CreditOperationOutcome.REJECTED
        and (
            outcome.reason == CreditRejectionReason.BALANCE_INCONSISTENT
            or bool(command.payload.get("repair"))
            and outcome.reason == CreditRejectionReason.INSUFFICIENT_CREDITS
        )
    )


async def command_histories(
    session: AsyncSession,
    order_ids: Sequence[UUID],
) -> dict[UUID, list[CommandHistoryEntry]]:
    histories: dict[UUID, list[CommandHistoryEntry]] = {
        order_id: [] for order_id in order_ids
    }
    if not histories:
        return histories
    rows = await session.execute(
        select(CreditCommandOutbox, CreditCommandResult)
        .outerjoin(
            CreditCommandResult,
            CreditCommandResult.request_id == CreditCommandOutbox.id,
        )
        .where(CreditCommandOutbox.order_id.in_(order_ids))
        .order_by(CreditCommandOutbox.created_at, CreditCommandOutbox.id)
    )
    for command, result in rows:
        histories[command.order_id].append(
            CommandHistoryEntry(
                command=command,
                result=CreditResult.model_validate(result.payload) if result else None,
            )
        )
    return histories


async def command_history(
    session: AsyncSession, order_id: UUID
) -> list[CommandHistoryEntry]:
    return (await command_histories(session, [order_id]))[order_id]


async def resolve_dispute(
    session: AsyncSession,
    dispute_id: UUID,
    actor_id: UUID,
    action: ResolutionAction,
    reason: str,
) -> ErrandRequest | None:
    case = await session.get(OrderDispute, dispute_id)
    if case is None:
        return None
    order = await session.scalar(
        select(ErrandRequest)
        .where(ErrandRequest.id == case.order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    await session.refresh(case)
    if case.closed_at is not None:
        if case.resolution != action or case.resolution_reason != reason:
            raise ResolutionConflict("This dispute already has a different resolution")
        return order
    commands = await command_history(session, order.id)
    policy = case_policy(order, case, commands)
    if action not in policy.actions:
        raise ResolutionConflict(policy.unavailable_reason)
    now = await session.scalar(select(func.clock_timestamp()))
    order.credit_status = CreditStatus.PENDING
    order.progress_due_at = None
    order.settlement_due_at = now + settlement_window()
    if action == "refund":
        order.credit_operation = "RELEASE"
        command = ReleaseCreditCommand(request_id=uuid4(), order_id=order.id)
    else:
        order.credit_operation = "TRANSFER"
        command = TransferCreditCommand(
            request_id=uuid4(), order_id=order.id, courier_id=order.courier_id
        )
    add_credit_command(session, command)
    case.closed_at, case.closed_by = now, actor_id
    case.resolution, case.resolution_reason = action, reason
    order.updated_at = now
    session.add(
        OrderAuditLog(
            order_id=order.id,
            actor_id=actor_id,
            action="dispute_resolved",
            reason=f"{case.id} ({action}): {reason}",
        )
    )
    await session.commit()
    await session.refresh(order)
    return order


async def repair_settlement(
    session: AsyncSession,
    dispute_id: UUID,
    actor_id: UUID,
    request: RepairSettlementRequest,
) -> ErrandRequest | None:
    """Durably authorize one atomic funding-and-settlement command, not two calls."""
    case = await session.get(OrderDispute, dispute_id)
    if case is None:
        return None
    order = await session.scalar(
        select(ErrandRequest)
        .where(ErrandRequest.id == case.order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    await session.refresh(case)
    existing = await session.get(CreditCommandOutbox, request.request_id)
    if existing is not None:
        repair = existing.payload.get("repair") or {}
        if (
            existing.order_id != order.id
            or repair.get("dispute_id") != str(dispute_id)
            or repair.get("actor_id") != str(actor_id)
            or repair.get("action") != request.action
            or repair.get("reason") != request.reason
        ):
            raise ResolutionConflict("Request ID was reused with different details")
        return order
    history = await command_history(session, order.id)
    policy = case_policy(order, case, history)
    if request.action not in policy.actions:
        raise ResolutionConflict(policy.unavailable_reason)
    last = history[-1].command
    command_type = {
        "credit.release": ReleaseCreditCommand,
        "credit.transfer": TransferCreditCommand,
    }.get(last.routing_key)
    if command_type is None:
        raise ResolutionConflict(
            "Only an existing refund or courier payment can be funded"
        )
    original = command_type.model_validate(last.payload)
    command = original.model_copy(
        update={
            "request_id": request.request_id,
            "repair": ReservationRepair(
                action=request.action,
                actor_id=actor_id,
                dispute_id=dispute_id,
                rejected_request_id=last.id,
                reason=request.reason,
            ),
        }
    )
    add_credit_command(session, command)
    order.credit_status = CreditStatus.PENDING
    order.settlement_due_at = (
        await session.scalar(select(func.clock_timestamp())) + settlement_window()
    )
    session.add(
        OrderAuditLog(
            order_id=order.id,
            actor_id=actor_id,
            action="settlement_repair_requested",
            reason=f"{dispute_id} / {request.request_id} ({request.action}): {request.reason}",
        )
    )
    await session.commit()
    await session.refresh(order)
    return order
