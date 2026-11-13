# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Implemented duplicate-safe wallet insertion using the user ID and event timestamps
# Author review: I reviewed correctness and edited the changes to fit the project

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from credit.models import (
    CreditAuditAction,
    CreditAuditLogResponse,
    CreditCommand,
    CreditReservationStatus,
    CreditResponse,
    UserCreated,
)
from credit.orm_models import (
    Credit,
    CreditAuditLog,
    CreditOrderGuard,
    CreditOutbox,
    CreditReservation,
)


async def lock_credit_order(session: AsyncSession, order_id: UUID) -> CreditOrderGuard:
    await session.execute(insert(CreditOrderGuard).values(
        order_id=order_id,
    ).on_conflict_do_nothing(index_elements=[CreditOrderGuard.order_id]))
    return await session.scalar(select(CreditOrderGuard).where(
        CreditOrderGuard.order_id == order_id,
    ).with_for_update().execution_options(populate_existing=True))


async def claim_credit_command(session: AsyncSession, command: CreditCommand) -> bool:
    # Claim the request ID and save its final outcome in the same transaction
    statement = (
        insert(CreditOutbox)
        .values(request_id=command.request_id, payload=command.model_dump_json())
        .on_conflict_do_nothing(index_elements=[CreditOutbox.request_id])
        .returning(CreditOutbox.request_id)
    )
    return await session.scalar(statement) is not None


async def find_credit_outcome(
    session: AsyncSession, request_id: UUID,
) -> CreditOutbox | None:
    statement = (
        select(CreditOutbox)
        .where(CreditOutbox.request_id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return await session.scalar(statement)


async def find_pending_credit_outcome(session: AsyncSession) -> CreditOutbox | None:
    statement = (
        select(CreditOutbox)
        .where(CreditOutbox.published_at.is_(None))
        .order_by(CreditOutbox.request_id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return await session.scalar(statement)


async def find_credit_account_by_user_id(
    session: AsyncSession, user_id: UUID,
) -> CreditResponse | None:
    account = await session.get(Credit, user_id)
    if account is None:
        return None
    return CreditResponse.model_validate(account)


async def insert_credit_account(
    session: AsyncSession, event: UserCreated, initial_allocation: int,
) -> bool:
    statement = insert(Credit).values(
        user_id=event.user_id,
        available_credits=initial_allocation,
        reserved_credits=0,
        created_at=event.created_at,
        updated_at=event.created_at,
    ).on_conflict_do_nothing(index_elements=[Credit.user_id]).returning(Credit.user_id)
    created_user_id = await session.scalar(statement)
    return created_user_id is not None


async def lock_credit_accounts(
    session: AsyncSession, user_ids: set[UUID],
) -> dict[UUID, Credit]:
    statement = (
        select(Credit)
        .where(Credit.user_id.in_(user_ids))
        .order_by(Credit.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    accounts = await session.scalars(statement)
    return {account.user_id: account for account in accounts}


async def find_credit_reservation(
    session: AsyncSession, order_id: UUID, *, for_update: bool = False,
) -> CreditReservation | None:
    statement = select(CreditReservation).where(CreditReservation.order_id == order_id)
    if for_update:
        statement = statement.with_for_update()
    return await session.scalar(statement.execution_options(populate_existing=True))


async def insert_credit_reservation(
    session: AsyncSession, order_id: UUID, user_id: UUID, amount: int,
) -> CreditReservation | None:
    statement = (
        insert(CreditReservation)
        .values(
            order_id=order_id, user_id=user_id, amount=amount,
            status=CreditReservationStatus.RESERVED,
        )
        .on_conflict_do_nothing(index_elements=[CreditReservation.order_id])
        .returning(CreditReservation)
        .execution_options(populate_existing=True)
    )
    return await session.scalar(statement)


async def sum_active_reservations(session: AsyncSession, user_id: UUID) -> int:
    statement = select(func.coalesce(func.sum(CreditReservation.amount), 0)).where(
        CreditReservation.user_id == user_id,
        CreditReservation.status == CreditReservationStatus.RESERVED,
    )
    return int(await session.scalar(statement))


async def find_credit_transfer(
    session: AsyncSession, order_id: UUID,
) -> CreditAuditLog | None:
    statement = select(CreditAuditLog).where(
        CreditAuditLog.order_id == order_id,
        CreditAuditLog.action == CreditAuditAction.TRANSFER,
    )
    return (await session.scalars(statement)).one_or_none()


async def find_credit_audit_logs_by_user_id(
    session: AsyncSession, user_id: UUID,
) -> list[CreditAuditLogResponse]:
    statement = (
        select(CreditAuditLog)
        .where(or_(
            CreditAuditLog.user_id == user_id,
            CreditAuditLog.recipient_user_id == user_id,
        ))
        .order_by(CreditAuditLog.created_at.desc(), CreditAuditLog.log_id.desc())
    )
    logs = await session.scalars(statement)
    return [CreditAuditLogResponse.model_validate(log) for log in logs]


def record_initial_credit_allocation(
    session: AsyncSession, user_id: UUID, amount: int, created_at: datetime,
) -> None:
    session.add(CreditAuditLog(
        user_id=user_id,
        action=CreditAuditAction.INITIAL_ALLOCATION,
        amount=amount,
        created_at=created_at,
    ))


def record_credit_reservation(
    session: AsyncSession, reservation: CreditReservation, created_at: datetime,
) -> None:
    session.add(CreditAuditLog(
        user_id=reservation.user_id,
        order_id=reservation.order_id,
        action=CreditAuditAction.RESERVE,
        amount=reservation.amount,
        created_at=created_at,
    ))


def record_credit_release(
    session: AsyncSession, reservation: CreditReservation, created_at: datetime,
) -> None:
    session.add(CreditAuditLog(
        user_id=reservation.user_id,
        order_id=reservation.order_id,
        action=CreditAuditAction.RELEASE,
        amount=reservation.amount,
        created_at=created_at,
    ))


def record_credit_transfer(
    session: AsyncSession, reservation: CreditReservation,
    recipient_user_id: UUID, created_at: datetime,
) -> None:
    session.add(CreditAuditLog(
        user_id=reservation.user_id,
        recipient_user_id=recipient_user_id,
        order_id=reservation.order_id,
        action=CreditAuditAction.TRANSFER,
        amount=reservation.amount,
        created_at=created_at,
    ))
