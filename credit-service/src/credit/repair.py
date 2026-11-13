"""Reservation shortfall funding, executed in the settlement's transaction."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from credit.exceptions import CreditConsistencyError, InsufficientCreditsError
from credit.models import (
    MAX_CREDITS,
    CreditAuditAction,
    CreditOperationOutcome,
    CreditRejectionReason,
    CreditReservationStatus,
    ReleaseCreditCommand,
    StoredCreditOutcome,
    TransferCreditCommand,
)
from credit.orm_models import CreditAuditLog
from credit.repository import (
    find_credit_outcome,
    find_credit_reservation,
    lock_credit_accounts,
    sum_active_reservations,
)


async def fund_settlement_shortfall(
    session: AsyncSession,
    command: ReleaseCreditCommand | TransferCreditCommand,
) -> None:
    """Caller holds the order guard and rolls back funding if settlement fails."""
    repair = command.repair
    prior = await find_credit_outcome(session, repair.rejected_request_id)
    if prior is None:
        raise CreditConsistencyError("The rejected settlement is missing")
    stored = StoredCreditOutcome.model_validate_json(prior.payload)
    original = dict(stored.command)
    original.pop("request_id", None)
    original.pop("repair", None)
    replacement = command.model_dump(mode="json", exclude={"request_id", "repair"})
    repairable = (
        stored.result.reason == CreditRejectionReason.BALANCE_INCONSISTENT
        or bool(stored.command.get("repair"))
        and stored.result.reason == CreditRejectionReason.INSUFFICIENT_CREDITS
    )
    if (
        stored.result.outcome != CreditOperationOutcome.REJECTED
        or not repairable
        or original != replacement
    ):
        raise CreditConsistencyError(
            "Funding requires the same previously rejected settlement"
        )

    reservation = await find_credit_reservation(session, command.order_id)
    if reservation is None or reservation.status != CreditReservationStatus.RESERVED:
        raise CreditConsistencyError("Funding requires an active reservation")
    # Lock all settlement participants in the same order as ordinary settlement.
    user_ids = {reservation.user_id}
    if isinstance(command, TransferCreditCommand):
        user_ids.add(command.courier_id)
    accounts = await lock_credit_accounts(session, user_ids)
    account = accounts.get(reservation.user_id)
    if account is None:
        raise CreditConsistencyError("Requester account is missing")
    active = await sum_active_reservations(session, reservation.user_id)
    amount = active - account.reserved_credits
    if not 0 < amount <= reservation.amount or active > MAX_CREDITS:
        raise CreditConsistencyError("No bounded reservation shortfall exists")
    before = {
        "available_credits": account.available_credits,
        "reserved_credits": account.reserved_credits,
    }
    if repair.action == "charge_reserved":
        if account.available_credits < amount:
            raise InsufficientCreditsError("Requester cannot fund the shortfall")
        account.available_credits -= amount
        action = CreditAuditAction.ADMIN_CHARGE_RESERVED
    else:
        if account.total_credits + amount > MAX_CREDITS:
            raise CreditConsistencyError("Funding exceeds the balance limit")
        action = CreditAuditAction.ADMIN_COVER_RESERVED
    account.reserved_credits += amount
    account.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(
        CreditAuditLog(
            user_id=account.user_id,
            order_id=command.order_id,
            actor_id=repair.actor_id,
            request_id=command.request_id,
            action=action,
            amount=amount,
            reason=f"{repair.dispute_id}: {repair.reason}",
            created_at=account.updated_at,
            before=before,
            after={
                "available_credits": account.available_credits,
                "reserved_credits": account.reserved_credits,
            },
        )
    )
    # Ordinary settlement re-reads the locked accounts, so persist before it does.
    await session.flush()
