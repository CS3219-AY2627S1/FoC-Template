# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: The wallet-creation transaction was later moved here from repository.py
# Author review: I reviewed correctness and edited the changes to fit the project

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.exc import MultipleResultsFound
from sqlalchemy.ext.asyncio import AsyncSession, AsyncSessionTransaction

from common.config_manager import settings
from credit.exceptions import (
    CreditConsistencyError,
    CreditNotFoundError,
    CreditRequestConflictError,
    CreditReservationConflictError,
    CreditReservationNotFoundError,
    CreditsAlreadyReleasedError,
    CreditsAlreadyTransferredError,
    InsufficientCreditsError,
)
from credit.models import (
    MAX_CREDITS,
    CreditAuditLogResponse,
    CreditCommand,
    CreditOperationOutcome,
    CreditOperationResult,
    CreditOutboxResponse,
    CreditRejectionReason,
    CreditReservationResult,
    CreditReservationStatus,
    CreditResponse,
    ReleaseCreditCommand,
    ReserveCreditCommand,
    StoredCreditOutcome,
    TransferCreditCommand,
    UserCreated,
)
from credit.orm_models import Credit, CreditReservation
from credit.repair import fund_settlement_shortfall
from credit.repository import (
    claim_credit_command,
    find_credit_account_by_user_id,
    find_credit_audit_logs_by_user_id,
    find_credit_outcome,
    find_credit_reservation,
    find_credit_transfer,
    insert_credit_account,
    insert_credit_reservation,
    lock_credit_accounts,
    lock_credit_order,
    record_credit_release,
    record_credit_reservation,
    record_credit_transfer,
    record_initial_credit_allocation,
    sum_active_reservations,
)


async def process_credit_command(
    session: AsyncSession, command: CreditCommand,
) -> CreditOperationResult:
    """Commit a command's decision with its credit changes; repeat its original reply."""
    async with _operation_transaction(session):
        await lock_credit_order(session, command.order_id)
        claimed = await claim_credit_command(session, command)
        entry = await find_credit_outcome(session, command.request_id)
        if entry is None:
            raise CreditConsistencyError("The command's outbox record is missing.")

        if not claimed:
            stored = CreditOutboxResponse.model_validate(entry).payload
            outcome = stored.result
            if outcome.operation != command.operation or stored.command != command.model_dump(mode="json"):
                raise CreditRequestConflictError("Request ID was reused for another command.")
            entry.published_at = None
            return outcome

        reservation = None
        reason = None
        try:
            # Funding and settlement share a savepoint. A rejected settlement
            # must never leave behind a charge or newly issued credits.
            async with session.begin_nested():
                if isinstance(command, (ReleaseCreditCommand, TransferCreditCommand)) and command.repair:
                    await fund_settlement_shortfall(session, command)
                reservation = await _execute_credit_command(session, command)
        except ValueError as error:
            match error:
                case CreditNotFoundError():
                    # Provisioning retries belong to the UserCreated consumer,
                    # not to this payment command. Preserve this refusal on replay.
                    reason = CreditRejectionReason.ACCOUNT_NOT_FOUND
                case CreditReservationNotFoundError():
                    reason = CreditRejectionReason.RESERVATION_NOT_FOUND
                case CreditConsistencyError():
                    reason = CreditRejectionReason.BALANCE_INCONSISTENT
                case CreditsAlreadyTransferredError():
                    reason = CreditRejectionReason.ALREADY_TRANSFERRED
                case CreditsAlreadyReleasedError():
                    reason = CreditRejectionReason.ALREADY_RELEASED
                case InsufficientCreditsError():
                    reason = CreditRejectionReason.INSUFFICIENT_CREDITS
                case CreditReservationConflictError():
                    reason = CreditRejectionReason.RESERVATION_CONFLICT
                case _ if type(error) is ValueError:
                    reason = CreditRejectionReason.INVALID_OPERATION
                case _:
                    raise

        if (
            isinstance(command, ReserveCreditCommand)
            and reservation is not None
            and reservation.status != CreditReservationStatus.RESERVED
        ):
            reservation = None
            reason = CreditRejectionReason.RESERVATION_CONFLICT

        outcome = CreditOperationResult(
            request_id=command.request_id,
            order_id=command.order_id,
            operation=command.operation,
            outcome=(
                CreditOperationOutcome.REJECTED
                if reason is not None else CreditOperationOutcome.SUCCEEDED
            ),
            reason=reason,
        )
        entry.payload = StoredCreditOutcome(
            command=command.model_dump(mode="json"), result=outcome,
        ).model_dump_json()
        await session.flush()
        return outcome


async def _execute_credit_command(
    session: AsyncSession, command: CreditCommand,
) -> CreditReservationResult:
    match command:
        case ReserveCreditCommand():
            return await reserve_credits(
                session, command.order_id, command.requester_id, command.amount,
            )
        case ReleaseCreditCommand():
            return await release_credits(session, command.order_id)
        case TransferCreditCommand():
            return await transfer_credits(session, command.order_id, command.courier_id)


async def create_credit_account(session: AsyncSession, event: UserCreated) -> None:
    """Create a wallet and record its initial allocation once."""
    async with _operation_transaction(session):
        amount = settings.initial_credit_allocation
        if await insert_credit_account(session, event, amount):
            record_initial_credit_allocation(session, event.user_id, amount, _now())


async def get_current_credit_balance(user_id: UUID, session: AsyncSession) -> CreditResponse:
    account = await find_credit_account_by_user_id(session, user_id)
    if account is None:
        raise CreditNotFoundError("Credit account not found.")
    return account


async def get_credit_audit_logs(
    user_id: UUID, session: AsyncSession,
) -> list[CreditAuditLogResponse]:
    return await find_credit_audit_logs_by_user_id(session, user_id)


async def get_credit_reservation(
    session: AsyncSession, order_id: UUID,
) -> CreditReservationResult:
    """Look up an order's durable credit outcome for reconciliation."""
    _validate_ids(order_id)
    async with _operation_transaction(session):
        reservation = await _require_reservation(session, order_id)
        return await _reservation_result(session, reservation)


async def reserve_credits(
    session: AsyncSession, order_id: UUID, requester_id: UUID, amount: int,
) -> CreditReservationResult:
    """Reserve available credits once for an order; a matching retry is harmless."""
    _validate_ids(order_id, requester_id)
    if type(amount) is not int or not 1 <= amount <= MAX_CREDITS:
        raise ValueError("Credit amount must be a positive supported integer.")

    async with _operation_transaction(session):
        accounts = await lock_credit_accounts(session, {requester_id})
        account = _require_account(accounts, requester_id)
        reservation = await find_credit_reservation(session, order_id, for_update=True)
        await _validate_reserved_balance(session, account)
        if reservation is not None:
            _validate_reserve_retry(reservation, requester_id, amount)
            return await _reservation_result(session, reservation)

        if account.available_credits < amount:
            raise InsufficientCreditsError("Insufficient available credits.")
        _validate_balance_limit(account.reserved_credits + amount)

        reservation = await insert_credit_reservation(session, order_id, requester_id, amount)
        if reservation is None:
            reservation = await _require_reservation(session, order_id, for_update=True)
            _validate_reserve_retry(reservation, requester_id, amount)
            return await _reservation_result(session, reservation)

        now = _now()
        account.available_credits -= amount
        account.reserved_credits += amount
        account.updated_at = now
        record_credit_reservation(session, reservation, now)
        await session.flush()
        return await _reservation_result(session, reservation)


async def release_credits(
    session: AsyncSession, order_id: UUID,
) -> CreditReservationResult:
    """Refund a cancelled or expired order once, retaining its reservation record."""
    _validate_ids(order_id)
    async with _operation_transaction(session):
        reservation = await _require_reservation(session, order_id)
        accounts = await lock_credit_accounts(session, {reservation.user_id})
        reservation = await _require_reservation(session, order_id, for_update=True)
        account = _require_account(accounts, reservation.user_id)
        await _validate_reserved_balance(session, account)
        if reservation.status == CreditReservationStatus.RELEASED:
            return await _reservation_result(session, reservation)
        if reservation.status != CreditReservationStatus.RESERVED:
            raise CreditsAlreadyTransferredError("Transferred credits cannot be released.")
        _validate_balance_limit(account.available_credits + reservation.amount)

        now = _now()
        account.reserved_credits -= reservation.amount
        account.available_credits += reservation.amount
        account.updated_at = now
        reservation.status = CreditReservationStatus.RELEASED
        reservation.updated_at = now
        record_credit_release(session, reservation, now)
        await session.flush()
        return await _reservation_result(session, reservation)


async def transfer_credits(
    session: AsyncSession, order_id: UUID, courier_id: UUID,
) -> CreditReservationResult:
    """Settle confirmed delivery once, atomically paying the courier and recording it."""
    _validate_ids(order_id, courier_id)
    async with _operation_transaction(session):
        reservation = await _require_reservation(session, order_id)
        if reservation.user_id == courier_id:
            raise ValueError("The requester cannot receive their own credit transfer.")

        accounts = await lock_credit_accounts(session, {reservation.user_id, courier_id})
        reservation = await _require_reservation(session, order_id, for_update=True)
        requester = _require_account(accounts, reservation.user_id)
        courier = _require_account(accounts, courier_id)
        await _validate_reserved_balance(session, requester)
        await _validate_reserved_balance(session, courier)
        if reservation.status == CreditReservationStatus.TRANSFERRED:
            result = await _reservation_result(session, reservation)
            if result.recipient_user_id != courier_id:
                raise CreditReservationConflictError("The order was transferred to another courier.")
            return result
        if reservation.status != CreditReservationStatus.RESERVED:
            raise CreditsAlreadyReleasedError("Released credits cannot be transferred.")
        _validate_balance_limit(courier.total_credits + reservation.amount)

        now = _now()
        requester.reserved_credits -= reservation.amount
        courier.available_credits += reservation.amount
        requester.updated_at = courier.updated_at = now
        reservation.status = CreditReservationStatus.TRANSFERRED
        reservation.updated_at = now
        record_credit_transfer(session, reservation, courier_id, now)
        await session.flush()
        return await _reservation_result(session, reservation)


def _operation_transaction(session: AsyncSession) -> AsyncSessionTransaction:
    """Use a savepoint inside a caller transaction; otherwise commit the operation."""
    return session.begin_nested() if session.in_transaction() else session.begin()


def _validate_ids(*identifiers: UUID) -> None:
    if any(not isinstance(identifier, UUID) for identifier in identifiers):
        raise ValueError("Credit operation identifiers must be UUIDs.")


def _validate_balance_limit(balance: int) -> None:
    if balance > MAX_CREDITS:
        raise ValueError("Credit balance exceeds the supported limit.")


def _require_account(accounts: dict[UUID, Credit], user_id: UUID) -> Credit:
    account = accounts.get(user_id)
    if account is None:
        raise CreditNotFoundError("Credit account not found.")
    return account


async def _require_reservation(
    session: AsyncSession, order_id: UUID, *, for_update: bool = False,
) -> CreditReservation:
    reservation = await find_credit_reservation(session, order_id, for_update=for_update)
    if reservation is None:
        raise CreditReservationNotFoundError("Credit reservation not found.")
    return reservation


def _validate_reserve_retry(
    reservation: CreditReservation, requester_id: UUID, amount: int,
) -> None:
    if reservation.user_id != requester_id or reservation.amount != amount:
        raise CreditReservationConflictError("The order has different reservation details.")


async def _validate_reserved_balance(session: AsyncSession, account: Credit) -> None:
    if account.reserved_credits != await sum_active_reservations(session, account.user_id):
        raise CreditConsistencyError("Reserved balance does not match active reservations.")


async def _reservation_result(
    session: AsyncSession, reservation: CreditReservation,
) -> CreditReservationResult:
    result = CreditReservationResult.model_validate(reservation)
    if reservation.status == CreditReservationStatus.TRANSFERRED:
        try:
            transfer = await find_credit_transfer(session, reservation.order_id)
        except MultipleResultsFound:
            raise CreditConsistencyError("The order has multiple credit transfer records.") from None
        if (
            transfer is None
            or transfer.user_id != reservation.user_id
            or transfer.amount != reservation.amount
            or transfer.recipient_user_id is None
        ):
            raise CreditConsistencyError("The transferred reservation has no matching transfer record.")
        result.recipient_user_id = transfer.recipient_user_id
    return result


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
