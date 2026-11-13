"""PostgreSQL integration tests for first-use account initialization."""

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, delete, func, inspect, select
from sqlalchemy.orm import Session

from app.events import OrderEvent
from app.models import (
    CreditAccount,
    CreditReservation,
    CreditTransaction,
    OutboxEvent,
    ProcessedEvent,
)
from app.services.event_handlers import apply_incoming_event


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="Set TEST_DATABASE_URL to run PostgreSQL concurrency tests",
)


@pytest.fixture(scope="module")
def postgres_engine():
    assert TEST_DATABASE_URL is not None
    if not TEST_DATABASE_URL.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must point to PostgreSQL")
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    required = {
        "credit_accounts",
        "credit_reservations",
        "credit_transactions",
        "processed_events",
        "outbox_events",
    }
    missing = required - set(inspect(engine).get_table_names())
    if missing:
        pytest.fail(f"Run Credit migrations first; missing tables: {sorted(missing)}")
    account_columns = {
        column["name"] for column in inspect(engine).get_columns("credit_accounts")
    }
    if "nus_student_number" in account_columns:
        pytest.fail("Run the UUID-only Credit account migration before these tests")
    try:
        yield engine
    finally:
        engine.dispose()


def order_event(
    event_type: str,
    *,
    order_id: UUID,
    requester_id: UUID,
    amount: int,
    courier_id: UUID | None = None,
) -> OrderEvent:
    return OrderEvent(
        event_id=uuid4(),
        event_type=event_type,
        occurred_at=datetime.now(timezone.utc),
        correlation_id=uuid4(),
        order_id=order_id,
        requester_id=requester_id,
        credit_amount=amount,
        courier_id=courier_id,
    )


def process_at_barrier(engine, event: OrderEvent, barrier: threading.Barrier) -> None:
    barrier.wait(timeout=15)
    with Session(engine) as db:
        apply_incoming_event(db, event, initial_allocation=100)
        db.commit()


def run_together(engine, *events: OrderEvent) -> None:
    barrier = threading.Barrier(len(events))
    with ThreadPoolExecutor(max_workers=len(events)) as executor:
        futures = [
            executor.submit(process_at_barrier, engine, event, barrier)
            for event in events
        ]
        for future in futures:
            future.result(timeout=30)


def cleanup(db: Session, *, user_ids: list[UUID], events: list[OrderEvent]) -> None:
    order_ids = [event.order_id for event in events]
    event_ids = [event.event_id for event in events]
    db.execute(delete(OutboxEvent).where(OutboxEvent.order_id.in_(order_ids)))
    db.execute(delete(ProcessedEvent).where(ProcessedEvent.event_id.in_(event_ids)))
    db.execute(delete(CreditTransaction).where(CreditTransaction.order_id.in_(order_ids)))
    db.execute(delete(CreditReservation).where(CreditReservation.order_id.in_(order_ids)))
    db.execute(delete(CreditTransaction).where(CreditTransaction.affected_user_id.in_(user_ids)))
    db.execute(delete(CreditAccount).where(CreditAccount.user_id.in_(user_ids)))
    db.commit()


def test_concurrent_first_orders_grant_initial_allocation_once(postgres_engine) -> None:
    requester_id = uuid4()
    events = [
        order_event(
            "order.created",
            order_id=uuid4(),
            requester_id=requester_id,
            amount=10,
        ),
        order_event(
            "order.created",
            order_id=uuid4(),
            requester_id=requester_id,
            amount=20,
        ),
    ]
    try:
        run_together(postgres_engine, *events)
        with Session(postgres_engine) as db:
            account = db.get(CreditAccount, requester_id)
            assert account is not None
            assert (account.available_balance, account.reserved_balance) == (70, 30)
            assert db.scalar(
                select(func.count()).select_from(CreditTransaction).where(
                    CreditTransaction.affected_user_id == requester_id,
                    CreditTransaction.transaction_type == "INITIAL_ALLOCATION",
                )
            ) == 1
    finally:
        with Session(postgres_engine) as db:
            cleanup(db, user_ids=[requester_id], events=events)


def test_concurrent_settlements_initialize_shared_courier_once(postgres_engine) -> None:
    courier_id = uuid4()
    requester_ids = [uuid4(), uuid4()]
    amounts = [15, 20]
    events = [
        order_event(
            "order.completed",
            order_id=uuid4(),
            requester_id=requester_id,
            courier_id=courier_id,
            amount=amount,
        )
        for requester_id, amount in zip(requester_ids, amounts, strict=True)
    ]
    with Session(postgres_engine) as db:
        now = datetime.now(timezone.utc)
        for requester_id, amount, event in zip(
            requester_ids, amounts, events, strict=True
        ):
            db.add(
                CreditAccount(
                    user_id=requester_id,
                    available_balance=0,
                    reserved_balance=amount,
                    initial_allocation_granted_at=now,
                )
            )
            db.add(
                CreditReservation(
                    order_id=event.order_id,
                    requester_id=requester_id,
                    amount=amount,
                    status="ACTIVE",
                    correlation_id=event.correlation_id,
                )
            )
        db.commit()

    try:
        run_together(postgres_engine, *events)
        with Session(postgres_engine) as db:
            courier = db.get(CreditAccount, courier_id)
            assert courier is not None
            assert courier.available_balance == 135
            assert db.scalar(
                select(func.count()).select_from(CreditTransaction).where(
                    CreditTransaction.affected_user_id == courier_id,
                    CreditTransaction.transaction_type == "INITIAL_ALLOCATION",
                )
            ) == 1
    finally:
        with Session(postgres_engine) as db:
            cleanup(db, user_ids=[*requester_ids, courier_id], events=events)
