# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-28
# Scope: Implemented atomic reserve, release and transfer operations with row locking; added
# admin settlement and credit totals queries.
# Author review: I validated correctness and supplied additional boundary checks.

"""Atomic credit operations: one transaction per call, no network I/O while locked."""

from uuid import UUID, uuid4

from sqlalchemy import func, insert, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.credits.errors import (
    IdentityConflict,
    InsufficientCredit,
    SettlementConflict,
    UnknownReservation,
    WalletNotReady,
)
from app.credits.schemas import OrderTerminal, ReservationRequest, UserRegistered
from app.credits.tables import (
    event_failures,
    processed_events,
    reservations,
    transactions,
    wallets,
)


async def _lock(session, key: str) -> None:
    # Transaction-scoped; released automatically on commit or rollback.
    await session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(key, 0))))


def _same_identity(row, request: ReservationRequest) -> None:
    stored = (row["operation_id"], row["requester_id"], row["amount"])
    if stored != (request.operation_id, request.requester_id, request.amount):
        raise IdentityConflict()


class CreditLedger:
    def __init__(self, sessions, initial_allocation: int | None = None):
        self.sessions = sessions
        # Unset: missing wallets are never get-or-created and report WALLET_NOT_READY.
        self.initial_allocation = initial_allocation

    # ---- Order-facing reservation contract -------------------------------------------------

    async def reserve(self, order_id: UUID, request: ReservationRequest) -> tuple[dict, bool]:
        async with self.sessions() as session, session.begin():
            await _lock(session, f"order:{order_id}")
            existing = await self._reservation(session, order_id)
            if existing is not None:
                _same_identity(existing, request)
                return existing, False
            # Users who existed before Credit get their wallet on first use.
            await self._ensure_wallet(session, request.requester_id)
            locked = await self._lock_wallets(session, [request.requester_id])
            wallet = locked.get(request.requester_id)
            if wallet is None:
                raise WalletNotReady()
            if wallet["available"] < request.amount:
                raise InsufficientCredit()
            reservation_id = uuid4()
            await self._move(
                session, request.requester_id, available=-request.amount, reserved=request.amount
            )
            row = await self._insert_reservation(
                session, order_id, request, state="RESERVED", reservation_id=reservation_id
            )
            await self._journal(
                session,
                "RESERVATION",
                request.amount,
                request.requester_id,
                order_id=order_id,
                reservation_id=reservation_id,
            )
            return row, True

    async def status(self, order_id: UUID) -> dict | None:
        async with self.sessions() as session:
            return await self._reservation(session, order_id)

    async def abort(self, order_id: UUID, request: ReservationRequest) -> tuple[dict, bool]:
        async with self.sessions() as session, session.begin():
            await _lock(session, f"order:{order_id}")
            existing = await self._reservation(session, order_id)
            if existing is None:
                # Fence: a delayed reserve for this order can never succeed afterwards.
                row = await self._insert_reservation(
                    session, order_id, request, state="CLOSED", reservation_id=None
                )
                return row, True
            _same_identity(existing, request)
            if existing["state"] == "TRANSFERRED":
                raise SettlementConflict()
            if existing["state"] == "CLOSED":
                return existing, False
            if existing["state"] == "RESERVED":
                await self._lock_wallets(session, [existing["requester_id"]])
                await self._release(session, existing, event_id=None)
            return await self._set_state(session, order_id, "CLOSED"), False

    # ---- Event-driven operations -------------------------------------------------------------

    async def allocate_initial(self, event: UserRegistered, attempt: int) -> str:
        if self.initial_allocation is None:
            raise WalletNotReady()
        async with self.sessions() as session, session.begin():
            await _lock(session, f"wallet:{event.user_id}")
            if await self._processed(session, event.event_id):
                return "DUPLICATE"
            created = await self._ensure_wallet(session, event.user_id, event_id=event.event_id)
            outcome = "APPLIED" if created else "NO_CHANGE"
            await self._record(
                session, event.event_id, event.event_type, event.user_id, outcome, attempt
            )
            return outcome

    async def settle(self, event: OrderTerminal, attempt: int) -> str:
        async with self.sessions() as session, session.begin():
            await _lock(session, f"order:{event.order_id}")
            if await self._processed(session, event.event_id):
                return "DUPLICATE"
            row = await self._reservation(session, event.order_id)
            if row is None or row["reservation_id"] != event.reservation_id:
                raise UnknownReservation()
            if event.is_completion:
                outcome = await self._transfer(session, row, event)
            else:
                outcome = await self._release_for_event(session, row, event)
            await self._record(
                session, event.event_id, event.event_type, event.order_id, outcome, attempt
            )
            return outcome

    async def record_failure(
        self, *, event_id, event_type, entity_id, attempt, error_code, dead_lettered
    ) -> None:
        async with self.sessions() as session, session.begin():
            await session.execute(
                insert(event_failures).values(
                    event_id=event_id,
                    event_type=event_type[:100] if event_type else None,
                    entity_id=entity_id,
                    attempt=attempt,
                    error_code=error_code,
                    dead_lettered=dead_lettered,
                )
            )

    # ---- Reads -------------------------------------------------------------------------------

    async def owner_wallet(self, user_id: UUID) -> dict | None:
        """The authenticated owner's wallet, get-or-created for users who predate Credit."""
        async with self.sessions() as session, session.begin():
            await self._ensure_wallet(session, user_id)
            return await self._wallet(session, user_id)

    async def wallet(self, user_id: UUID) -> dict | None:
        """Read-only lookup (administrators): never creates a wallet for an arbitrary ID."""
        async with self.sessions() as session:
            return await self._wallet(session, user_id)

    async def history(self, user_id: UUID, page: int, page_size: int) -> tuple[list[dict], int]:
        involved = or_(
            transactions.c.wallet_user_id == user_id,
            transactions.c.counterparty_user_id == user_id,
        )
        async with self.sessions() as session:
            total = await session.scalar(
                select(func.count()).select_from(transactions).where(involved)
            )
            result = await session.execute(
                select(transactions)
                .where(involved)
                .order_by(transactions.c.created_at.desc(), transactions.c.id.desc())
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
            return [dict(row) for row in result.mappings()], total

    async def credit_totals(self, start, end) -> dict:
        """Read-only dashboard figures (N2F4.5): current balances and transfers in [start, end).

        TRANSFER rows are unique per reservation, so reprocessed events cannot inflate them.
        """
        async with self.sessions() as session, session.begin():
            available, reserved = (
                await session.execute(
                    select(
                        func.coalesce(func.sum(wallets.c.available), 0),
                        func.coalesce(func.sum(wallets.c.reserved), 0),
                    )
                )
            ).one()
            count, amount = (
                await session.execute(
                    select(func.count(), func.coalesce(func.sum(transactions.c.amount), 0)).where(
                        transactions.c.type == "TRANSFER",
                        transactions.c.created_at >= start,
                        transactions.c.created_at < end,
                    )
                )
            ).one()
        return {
            "available": int(available),
            "reserved": int(reserved),
            "transfer_count": int(count),
            "transfer_amount": int(amount),
        }

    # ---- Internals (always inside the caller's transaction) ---------------------------------

    async def _ensure_wallet(self, session, user_id: UUID, *, event_id: UUID | None = None):
        """Create a missing wallet with the initial allocation; True only if created here."""
        if self.initial_allocation is None:
            return False
        created = await session.scalar(
            pg_insert(wallets)
            .values(user_id=user_id, available=self.initial_allocation, reserved=0)
            .on_conflict_do_nothing(index_elements=["user_id"])
            .returning(wallets.c.user_id)
        )
        if created is None:
            return False
        await self._journal(
            session, "ALLOCATION", self.initial_allocation, user_id, event_id=event_id
        )
        return True

    async def _transfer(self, session, row, event: OrderTerminal) -> str:
        if row["requester_id"] != event.requester_id or row["amount"] != event.amount:
            raise IdentityConflict()
        if row["state"] == "TRANSFERRED":
            if row["courier_id"] == event.courier_id:
                return "NO_CHANGE"
            raise SettlementConflict()
        if row["state"] != "RESERVED":
            raise SettlementConflict()
        await self._ensure_wallet(session, event.courier_id)
        locked = await self._lock_wallets(session, [row["requester_id"], event.courier_id])
        if event.courier_id not in locked:
            raise WalletNotReady()
        await self._move(session, row["requester_id"], reserved=-row["amount"])
        await self._move(session, event.courier_id, available=row["amount"])
        await session.execute(
            update(reservations)
            .where(reservations.c.order_id == row["order_id"])
            .values(state="TRANSFERRED", courier_id=event.courier_id, updated_at=func.now())
        )
        await self._journal(
            session,
            "TRANSFER",
            row["amount"],
            row["requester_id"],
            counterparty=event.courier_id,
            order_id=row["order_id"],
            reservation_id=row["reservation_id"],
            event_id=event.event_id,
        )
        return "APPLIED"

    async def _release_for_event(self, session, row, event: OrderTerminal) -> str:
        if row["state"] != "RESERVED":
            # Already released/closed, or transferred first (M4F5.2): never touch balances.
            return "NO_CHANGE"
        await self._lock_wallets(session, [row["requester_id"]])
        await self._release(session, row, event_id=event.event_id)
        await self._set_state(session, row["order_id"], "RELEASED")
        return "APPLIED"

    async def _release(self, session, row, *, event_id) -> None:
        await self._move(
            session, row["requester_id"], available=row["amount"], reserved=-row["amount"]
        )
        await self._journal(
            session,
            "RELEASE",
            row["amount"],
            row["requester_id"],
            order_id=row["order_id"],
            reservation_id=row["reservation_id"],
            event_id=event_id,
        )

    async def _wallet(self, session, user_id: UUID) -> dict | None:
        result = await session.execute(select(wallets).where(wallets.c.user_id == user_id))
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def _reservation(self, session, order_id: UUID) -> dict | None:
        result = await session.execute(
            select(reservations).where(reservations.c.order_id == order_id)
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    async def _insert_reservation(self, session, order_id, request, *, state, reservation_id):
        result = await session.execute(
            insert(reservations)
            .values(
                order_id=order_id,
                reservation_id=reservation_id,
                operation_id=request.operation_id,
                requester_id=request.requester_id,
                amount=request.amount,
                state=state,
            )
            .returning(reservations)
        )
        return dict(result.mappings().one())

    async def _set_state(self, session, order_id: UUID, state: str) -> dict:
        result = await session.execute(
            update(reservations)
            .where(reservations.c.order_id == order_id)
            .values(state=state, updated_at=func.now())
            .returning(reservations)
        )
        return dict(result.mappings().one())

    async def _lock_wallets(self, session, user_ids) -> dict:
        # Sorted locking order prevents deadlocks between concurrent transfers.
        result = await session.execute(
            select(wallets)
            .where(wallets.c.user_id.in_(sorted(set(user_ids))))
            .order_by(wallets.c.user_id)
            .with_for_update()
        )
        return {row["user_id"]: row for row in result.mappings()}

    async def _move(self, session, user_id: UUID, *, available: int = 0, reserved: int = 0):
        # CHECK (>= 0) constraints reject any change that would make a balance negative.
        await session.execute(
            update(wallets)
            .where(wallets.c.user_id == user_id)
            .values(
                available=wallets.c.available + available,
                reserved=wallets.c.reserved + reserved,
                updated_at=func.now(),
            )
        )

    async def _journal(
        self,
        session,
        kind: str,
        amount: int,
        wallet_user_id: UUID,
        *,
        counterparty: UUID | None = None,
        order_id: UUID | None = None,
        reservation_id: UUID | None = None,
        event_id: UUID | None = None,
    ) -> None:
        await session.execute(
            insert(transactions).values(
                id=uuid4(),
                type=kind,
                amount=amount,
                wallet_user_id=wallet_user_id,
                counterparty_user_id=counterparty,
                order_id=order_id,
                reservation_id=reservation_id,
                source_event_id=event_id,
            )
        )

    async def _processed(self, session, event_id: UUID) -> bool:
        found = await session.scalar(
            select(processed_events.c.event_id).where(processed_events.c.event_id == event_id)
        )
        return found is not None

    async def _record(self, session, event_id, event_type, entity_id, outcome, attempt) -> None:
        await session.execute(
            insert(processed_events).values(
                event_id=event_id,
                event_type=event_type,
                entity_id=entity_id,
                outcome=outcome,
                attempt=attempt,
            )
        )
