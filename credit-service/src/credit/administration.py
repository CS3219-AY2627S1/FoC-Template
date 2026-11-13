"""Read-only financial evidence. Money-moving actions arrive through Order's outbox."""

from uuid import UUID

from sqlalchemy import cast, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from credit.models import (
    CreditAuditLogResponse,
    CreditReservationResult,
    StoredCreditOutcome,
)
from credit.orm_models import Credit, CreditAuditLog, CreditOutbox, CreditReservation
from credit.repository import sum_active_reservations


async def order_diagnostics(session: AsyncSession, order_id: UUID) -> dict:
    reservation = await session.get(CreditReservation, order_id)
    entries = await session.scalars(
        select(CreditOutbox)
        .where(
            cast(CreditOutbox.payload, JSONB)["result"]["order_id"].astext
            == str(order_id),
        )
        .order_by(CreditOutbox.request_id)
    )
    outcomes = [
        StoredCreditOutcome.model_validate_json(entry.payload) for entry in entries
    ]
    audits = list(
        await session.scalars(
            select(CreditAuditLog)
            .where(
                CreditAuditLog.order_id == order_id,
            )
            .order_by(CreditAuditLog.created_at, CreditAuditLog.log_id)
        )
    )
    user_ids = {log.user_id for log in audits}
    user_ids.update(log.recipient_user_id for log in audits if log.recipient_user_id)
    if reservation:
        user_ids.add(reservation.user_id)
    for outcome in outcomes:
        for field in ("requester_id", "courier_id"):
            if outcome.command.get(field):
                user_ids.add(UUID(str(outcome.command[field])))
    accounts = []
    for user_id in sorted(user_ids):
        account = await session.get(Credit, user_id)
        if account is None:
            accounts.append({"user_id": user_id, "missing": True})
        else:
            active = await sum_active_reservations(session, user_id)
            accounts.append(
                {
                    "user_id": user_id,
                    "available_credits": account.available_credits,
                    "reserved_credits": account.reserved_credits,
                    "active_reservation_total": active,
                    "consistent": account.reserved_credits == active,
                    "missing": False,
                }
            )
    return {
        "order_id": order_id,
        "reservation": CreditReservationResult.model_validate(reservation).model_dump(
            mode="json"
        )
        if reservation
        else None,
        "accounts": accounts,
        "commands": [outcome.model_dump(mode="json") for outcome in outcomes],
        "audit_logs": [
            CreditAuditLogResponse.model_validate(log).model_dump(mode="json")
            for log in audits
        ],
    }
