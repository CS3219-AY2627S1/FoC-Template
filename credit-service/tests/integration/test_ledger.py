# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-15
# Scope: Added ledger concurrency and conservation integration tests and credit-verify checks.
# Author review: I validated correctness and supplied additional boundary checks.

"""WRITES DATA. Point CREDIT_TEST_DATABASE_URL only at a disposable migrated Credit database."""

import asyncio
import io
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.credits.errors import (
    IdentityConflict,
    InsufficientCredit,
    SettlementConflict,
    UnknownReservation,
    WalletNotReady,
)
from app.credits.ledger import CreditLedger
from app.credits.schemas import OrderTerminal, ReservationRequest, UserRegistered
from app.credits.verify import verify
from app.db import Database

pytestmark = pytest.mark.integration
ALLOCATION = 100
TABLES = (
    "credit_service.event_failures, credit_service.processed_events, "
    "credit_service.credit_transactions, credit_service.order_reservations, "
    "credit_service.wallets"
)


@pytest.fixture
async def database():
    url = os.environ.get("CREDIT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set CREDIT_TEST_DATABASE_URL to a disposable migrated Credit database")
    database = Database(url)
    async with database.session_context() as session, session.begin():
        await session.execute(text(f"TRUNCATE {TABLES}"))
    yield database
    await database.dispose()


@pytest.fixture
def ledger(database):
    return CreditLedger(database.session_context, ALLOCATION)


@pytest.fixture
def unconfigured(database):
    # No allocation configured: missing wallets are never get-or-created.
    return CreditLedger(database.session_context, None)


def now():
    return datetime.now(UTC).isoformat()


def registered(user_id: UUID, event_id: UUID | None = None) -> UserRegistered:
    return UserRegistered.model_validate(
        {
            "eventId": str(event_id or uuid4()),
            "eventType": "user.registered.v1",
            "userId": str(user_id),
            "occurredAt": now(),
        }
    )


def released(event_type: str, order_id: UUID, reservation_id: UUID) -> OrderTerminal:
    return OrderTerminal.model_validate(
        {
            "eventId": str(uuid4()),
            "eventType": event_type,
            "orderId": str(order_id),
            "reservationId": str(reservation_id),
            "occurredAt": now(),
        }
    )


def completed(order_id, reservation_id, requester, courier, amount, event_id=None):
    return OrderTerminal.model_validate(
        {
            "eventId": str(event_id or uuid4()),
            "eventType": "order.completed.v1",
            "orderId": str(order_id),
            "reservationId": str(reservation_id),
            "occurredAt": now(),
            "requesterId": str(requester),
            "courierId": str(courier),
            "amount": amount,
        }
    )


def ask(requester: UUID, amount: int, operation_id: UUID | None = None):
    return ReservationRequest(
        operation_id=operation_id or uuid4(), requester_id=requester, amount=amount
    )


async def balances(database, user_id) -> tuple[int, int] | None:
    async with database.session_context() as session:
        row = (
            await session.execute(
                text("SELECT available, reserved FROM credit_service.wallets WHERE user_id=:u"),
                {"u": user_id},
            )
        ).one_or_none()
        return (row.available, row.reserved) if row else None


async def count(database, sql: str, **params) -> int:
    async with database.session_context() as session:
        return await session.scalar(text(sql), params)


async def allocations(database) -> int:
    return await count(
        database,
        "SELECT count(*) FROM credit_service.credit_transactions WHERE type='ALLOCATION'",
    )


async def funded(ledger) -> UUID:
    user = uuid4()
    assert await ledger.allocate_initial(registered(user), 1) == "APPLIED"
    return user


# ---- Initial allocation (M4F1.1) ---------------------------------------------------------


async def test_allocation_is_applied_once(ledger, database):
    user, event_id = uuid4(), uuid4()
    assert await ledger.allocate_initial(registered(user, event_id), 1) == "APPLIED"
    # Same event redelivered, then a different event for the same user.
    assert await ledger.allocate_initial(registered(user, event_id), 2) == "DUPLICATE"
    assert await ledger.allocate_initial(registered(user), 1) == "NO_CHANGE"
    assert await balances(database, user) == (ALLOCATION, 0)
    assert await allocations(database) == 1
    assert await count(database, "SELECT count(*) FROM credit_service.processed_events") == 2


async def test_concurrent_registration_deliveries_allocate_once(ledger, database):
    user, event_id = uuid4(), uuid4()
    outcomes = await asyncio.gather(
        *(ledger.allocate_initial(registered(user, event_id), 1) for _ in range(5))
    )
    assert sorted(outcomes) == ["APPLIED"] + ["DUPLICATE"] * 4
    assert await allocations(database) == 1


# ---- Get-or-create for users who existed before Credit -----------------------------------


async def test_owner_wallet_is_get_or_created_once(ledger, database):
    user = uuid4()
    rows = await asyncio.gather(*(ledger.owner_wallet(user) for _ in range(10)))
    assert all(row["available"] == ALLOCATION and row["reserved"] == 0 for row in rows)
    assert await allocations(database) == 1


async def test_registration_after_get_or_create_does_not_double_allocate(ledger, database):
    user = uuid4()
    await ledger.owner_wallet(user)
    assert await ledger.allocate_initial(registered(user), 1) == "NO_CHANGE"
    assert await balances(database, user) == (ALLOCATION, 0)
    assert await allocations(database) == 1


async def test_admin_read_never_creates_a_wallet(ledger, database):
    user = uuid4()
    assert await ledger.wallet(user) is None
    assert await balances(database, user) is None


async def test_reserve_get_or_creates_requester_wallet(ledger, database):
    user = uuid4()
    row, created = await ledger.reserve(uuid4(), ask(user, 5))
    assert created and row["state"] == "RESERVED"
    assert await balances(database, user) == (ALLOCATION - 5, 5)
    assert await allocations(database) == 1


async def test_completion_get_or_creates_courier_wallet(ledger, database):
    requester, courier, order = await funded(ledger), uuid4(), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 5))
    event = completed(order, row["reservation_id"], requester, courier, 5)
    assert await ledger.settle(event, 1) == "APPLIED"
    assert await balances(database, courier) == (ALLOCATION + 5, 0)
    assert await allocations(database) == 2


async def test_unconfigured_allocation_reports_wallet_not_ready(ledger, unconfigured, database):
    with pytest.raises(WalletNotReady):
        await unconfigured.reserve(uuid4(), ask(uuid4(), 1))
    requester, order = await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 5))
    with pytest.raises(WalletNotReady):
        await unconfigured.settle(
            completed(order, row["reservation_id"], requester, uuid4(), 5), 1
        )
    assert await unconfigured.owner_wallet(uuid4()) is None
    assert await balances(database, requester) == (ALLOCATION - 5, 5)
    assert await count(database, "SELECT count(*) FROM credit_service.order_reservations") == 1


# ---- Reservation (M4F3) ------------------------------------------------------------------


async def test_reserve_moves_available_to_reserved(ledger, database):
    user, order = await funded(ledger), uuid4()
    row, created = await ledger.reserve(order, ask(user, 30))
    assert created and row["state"] == "RESERVED" and row["reservation_id"] is not None
    assert await balances(database, user) == (70, 30)
    replay, created_again = await ledger.reserve(
        order, ask(user, 30, operation_id=row["operation_id"])
    )
    assert not created_again and replay["reservation_id"] == row["reservation_id"]
    assert await balances(database, user) == (70, 30)


async def test_rejected_reservation_changes_nothing(ledger, database):
    user = await funded(ledger)
    with pytest.raises(InsufficientCredit):
        await ledger.reserve(uuid4(), ask(user, ALLOCATION + 1))
    assert await balances(database, user) == (ALLOCATION, 0)
    assert await count(database, "SELECT count(*) FROM credit_service.order_reservations") == 0
    assert await count(database, "SELECT count(*) FROM credit_service.credit_transactions") == 1


async def test_replay_with_different_identity_conflicts(ledger):
    user, order = await funded(ledger), uuid4()
    await ledger.reserve(order, ask(user, 10))
    with pytest.raises(IdentityConflict):
        await ledger.reserve(order, ask(user, 11))


async def test_concurrent_reserves_never_overdraw(ledger, database):
    user = await funded(ledger)
    results = await asyncio.gather(
        *(ledger.reserve(uuid4(), ask(user, 10)) for _ in range(20)), return_exceptions=True
    )
    assert sum(isinstance(result, tuple) for result in results) == 10
    assert all(isinstance(result, tuple | InsufficientCredit) for result in results)
    assert await balances(database, user) == (0, ALLOCATION)


async def test_concurrent_reserve_same_order_deducts_once(ledger, database):
    user, order, operation = await funded(ledger), uuid4(), uuid4()
    results = await asyncio.gather(
        *(ledger.reserve(order, ask(user, 25, operation)) for _ in range(10))
    )
    assert sum(created for _, created in results) == 1
    assert len({row["reservation_id"] for row, _ in results}) == 1
    assert await balances(database, user) == (75, 25)


# ---- Transfer and release (M4F4, M4F5) ---------------------------------------------------


async def test_completion_transfers_exactly_once(ledger, database):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 40))
    event = completed(order, row["reservation_id"], requester, courier, 40)
    outcomes = await asyncio.gather(*(ledger.settle(event, 1) for _ in range(5)))
    assert sorted(outcomes) == ["APPLIED"] + ["DUPLICATE"] * 4
    # A second, distinct completion event for the same order is also harmless.
    again = completed(order, row["reservation_id"], requester, courier, 40)
    assert await ledger.settle(again, 1) == "NO_CHANGE"
    assert await balances(database, requester) == (60, 0)
    assert await balances(database, courier) == (140, 0)
    assert await count(
        database, "SELECT count(*) FROM credit_service.credit_transactions WHERE type='TRANSFER'"
    ) == 1


async def test_completion_with_wrong_amount_or_requester_conflicts(ledger, database):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 10))
    with pytest.raises(IdentityConflict):
        await ledger.settle(completed(order, row["reservation_id"], requester, courier, 11), 1)
    with pytest.raises(UnknownReservation):
        await ledger.settle(completed(order, uuid4(), requester, courier, 10), 1)
    assert await balances(database, requester) == (90, 10)


@pytest.mark.parametrize("kind", ["order.cancelled.v1", "order.expired.v1", "order.failed.v1"])
async def test_release_returns_credits_once(ledger, database, kind):
    user, order = await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(user, 20))
    event = released(kind, order, row["reservation_id"])
    assert await ledger.settle(event, 1) == "APPLIED"
    assert await ledger.settle(event, 2) == "DUPLICATE"
    assert await ledger.settle(released(kind, order, row["reservation_id"]), 1) == "NO_CHANGE"
    assert await balances(database, user) == (ALLOCATION, 0)


async def test_release_after_transfer_changes_nothing(ledger, database):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 10))
    await ledger.settle(completed(order, row["reservation_id"], requester, courier, 10), 1)
    late = released("order.cancelled.v1", order, row["reservation_id"])
    assert await ledger.settle(late, 1) == "NO_CHANGE"
    assert await balances(database, requester) == (90, 0)
    assert await balances(database, courier) == (110, 0)


async def test_transfer_after_release_conflicts(ledger, database):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 10))
    await ledger.settle(released("order.expired.v1", order, row["reservation_id"]), 1)
    with pytest.raises(SettlementConflict):
        await ledger.settle(completed(order, row["reservation_id"], requester, courier, 10), 1)
    assert await balances(database, courier) == (ALLOCATION, 0)


# ---- Creation abort (Order's compensation fence) ----------------------------------------


async def test_abort_releases_and_fences_future_reserve(ledger, database):
    user, order = await funded(ledger), uuid4()
    request = ask(user, 15)
    await ledger.reserve(order, request)
    closed, created = await ledger.abort(order, request)
    assert not created and closed["state"] == "CLOSED"
    assert await balances(database, user) == (ALLOCATION, 0)
    late, created = await ledger.reserve(order, request)
    assert not created and late["state"] == "CLOSED"
    assert await balances(database, user) == (ALLOCATION, 0)


async def test_abort_before_reserve_creates_fence(ledger, database):
    user, order = await funded(ledger), uuid4()
    request = ask(user, 15)
    fence, created = await ledger.abort(order, request)
    assert created and fence["state"] == "CLOSED" and fence["reservation_id"] is None
    again, created_again = await ledger.abort(order, request)
    assert not created_again and again["state"] == "CLOSED"
    late, _ = await ledger.reserve(order, request)
    assert late["state"] == "CLOSED"
    assert await balances(database, user) == (ALLOCATION, 0)


async def test_abort_racing_reserve_never_leaves_credits_held(ledger, database):
    user = await funded(ledger)
    for _ in range(10):
        order, request = uuid4(), ask(user, 5)
        await asyncio.gather(ledger.reserve(order, request), ledger.abort(order, request))
        row = await ledger.status(order)
        assert row["state"] == "CLOSED"
    assert await balances(database, user) == (ALLOCATION, 0)


async def test_abort_after_transfer_conflicts(ledger):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    request = ask(requester, 10)
    row, _ = await ledger.reserve(order, request)
    await ledger.settle(completed(order, row["reservation_id"], requester, courier, 10), 1)
    with pytest.raises(SettlementConflict):
        await ledger.abort(order, request)


# ---- Invariants, history and traceability ------------------------------------------------


async def test_credits_are_conserved(ledger, database):
    # M4NFR1.4 / M4NFR5.2: credits held equal credits allocated; total = available + reserved.
    users = [await funded(ledger) for _ in range(4)]
    orders = []
    for index in range(8):
        order = uuid4()
        row, _ = await ledger.reserve(order, ask(users[index % 4], 7))
        orders.append((order, row["reservation_id"], users[index % 4]))
    for index, (order, reservation, requester) in enumerate(orders):
        if index % 2:
            await ledger.settle(released("order.expired.v1", order, reservation), 1)
        else:
            courier = users[(users.index(requester) + 1) % 4]
            await ledger.settle(completed(order, reservation, requester, courier, 7), 1)
    held = await count(database, "SELECT sum(available + reserved) FROM credit_service.wallets")
    allocated = await count(
        database,
        "SELECT sum(amount) FROM credit_service.credit_transactions WHERE type='ALLOCATION'",
    )
    assert held == allocated == 4 * ALLOCATION
    assert await count(
        database, "SELECT count(*) FROM credit_service.wallets WHERE reserved <> 0"
    ) == 0


async def test_history_includes_incoming_transfers(ledger):
    requester, courier, order = await funded(ledger), await funded(ledger), uuid4()
    row, _ = await ledger.reserve(order, ask(requester, 10))
    await ledger.settle(completed(order, row["reservation_id"], requester, courier, 10), 1)
    items, total = await ledger.history(courier, 1, 20)
    assert total == 2 and {item["type"] for item in items} == {"ALLOCATION", "TRANSFER"}
    items, total = await ledger.history(requester, 1, 2)
    assert total == 3 and len(items) == 2 and items[0]["type"] == "TRANSFER"


async def test_failures_are_recorded(ledger, database):
    await ledger.record_failure(
        event_id=uuid4(),
        event_type="order.completed.v1",
        entity_id=uuid4(),
        attempt=1,
        error_code="WALLET_NOT_READY",
        dead_lettered=False,
    )
    assert await count(database, "SELECT count(*) FROM credit_service.event_failures") == 1


# ---- Integrity check (credit-verify, M4NFR5.2) --------------------------------------------


async def test_verify_passes_after_activity_and_flags_tampering(ledger, database):
    requester, courier = await funded(ledger), await funded(ledger)
    paid, cancelled = uuid4(), uuid4()
    row, _ = await ledger.reserve(paid, ask(requester, 5))
    await ledger.settle(completed(paid, row["reservation_id"], requester, courier, 5), 1)
    row, _ = await ledger.reserve(cancelled, ask(requester, 2))
    await ledger.settle(released("order.cancelled.v1", cancelled, row["reservation_id"]), 1)
    await ledger.reserve(uuid4(), ask(requester, 3))
    settings = Settings(_env_file=None, database_url=os.environ["CREDIT_TEST_DATABASE_URL"])

    report = io.StringIO()
    assert await verify(settings, out=report)
    assert "FAIL" not in report.getvalue() and "ACTION" not in report.getvalue()

    # A balance edited outside the ledger no longer matches its history or the economy.
    async with database.session_context() as session, session.begin():
        await session.execute(
            text("UPDATE credit_service.wallets SET available = available + 1 WHERE user_id=:u"),
            {"u": courier},
        )
    report = io.StringIO()
    assert not await verify(settings, out=report)
    assert "FAIL (1) M4F6.1" in report.getvalue()
    assert "FAIL (1) M4NFR1.4" in report.getvalue()
