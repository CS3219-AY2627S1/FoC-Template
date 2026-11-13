"""Tests for the annotated Credit saga participant business rules."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.db import Base
from app.events import OrderEvent
from app.models import (
    CreditAccount,
    CreditReservation,
    CreditTransaction,
    OutboxEvent,
    ProcessedEvent,
)
from app.services.credits import (
    CreditStateConflict,
    InvalidCreditAdjustment,
    adjust_account,
    ensure_credit_account,
    reserve_credits,
)
from app.services.event_handlers import apply_incoming_event, apply_order_event


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def order_event(
    event_type: str,
    *,
    requester_id=None,
    order_id=None,
    courier_id=None,
    amount: int = 20,
    previous_status: str | None = None,
) -> OrderEvent:
    return OrderEvent(
        event_id=uuid4(),
        event_type=event_type,
        occurred_at=datetime.now(timezone.utc),
        correlation_id=uuid4(),
        order_id=order_id or uuid4(),
        requester_id=requester_id or uuid4(),
        credit_amount=amount,
        courier_id=courier_id,
        previous_status=previous_status,
    )


def add_account(
    db: Session,
    *,
    user_id=None,
    available: int = 100,
    reserved: int = 0,
) -> CreditAccount:
    account = CreditAccount(
        user_id=user_id or uuid4(),
        available_balance=available,
        reserved_balance=reserved,
        initial_allocation_granted_at=datetime.now(timezone.utc),
    )
    db.add(account)
    db.commit()
    return account


def test_ensure_account_allocates_and_audits_exactly_once(db: Session) -> None:
    user_id = uuid4()
    event_id = uuid4()
    correlation_id = uuid4()

    first = ensure_credit_account(
        db,
        user_id=user_id,
        initial_allocation=100,
        operation_id=event_id,
        correlation_id=correlation_id,
    )
    db.commit()
    second = ensure_credit_account(
        db,
        user_id=user_id,
        initial_allocation=100,
        operation_id=uuid4(),
        correlation_id=uuid4(),
    )
    db.commit()

    assert first.user_id == second.user_id == user_id
    assert second.available_balance == 100
    assert second.reserved_balance == 0
    audits = list(db.scalars(select(CreditTransaction)))
    assert len(audits) == 1
    assert audits[0].transaction_type == "INITIAL_ALLOCATION"
    assert audits[0].available_delta == 100
    assert audits[0].event_id == event_id


def test_ensure_allocates_an_existing_unallocated_account_once(
    db: Session,
) -> None:
    user_id = uuid4()
    account = CreditAccount(
        user_id=user_id,
        available_balance=0,
        reserved_balance=0,
        initial_allocation_granted_at=None,
    )
    db.add(account)
    db.commit()

    ensured = ensure_credit_account(
        db,
        user_id=user_id,
        initial_allocation=100,
        operation_id=uuid4(),
        correlation_id=uuid4(),
    )
    db.commit()

    assert ensured.available_balance == 100
    assert ensured.initial_allocation_granted_at is not None
    assert db.scalar(select(func.count()).select_from(CreditTransaction)) == 1


def test_reservation_stages_balance_audit_reservation_and_outbox(
    db: Session,
) -> None:
    requester = add_account(db)
    event = order_event("order.created", requester_id=requester.user_id, amount=30)

    apply_order_event(db, event)
    db.commit()

    db.refresh(requester)
    reservation = db.scalar(
        select(CreditReservation).where(CreditReservation.order_id == event.order_id)
    )
    audit = db.scalar(select(CreditTransaction))
    outbox = db.scalar(select(OutboxEvent))
    assert (requester.available_balance, requester.reserved_balance) == (70, 30)
    assert reservation is not None and reservation.status == "ACTIVE"
    assert (audit.available_delta, audit.reserved_delta) == (-30, 30)
    assert outbox.event_type == "credit.reserved"
    assert outbox.payload["credit_amount"] == 30


def test_domain_reservation_does_not_create_integration_rows(db: Session) -> None:
    requester = add_account(db)

    result = reserve_credits(
        db,
        order_id=uuid4(),
        requester_id=requester.user_id,
        amount=10,
        operation_id=uuid4(),
        correlation_id=uuid4(),
    )
    db.commit()

    assert result.outcome == "RESERVED"
    assert db.scalar(select(func.count()).select_from(CreditReservation)) == 1
    assert db.scalar(select(func.count()).select_from(CreditTransaction)) == 1
    assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 0
    assert db.scalar(select(func.count()).select_from(ProcessedEvent)) == 0


def test_insufficient_reservation_is_committed_business_outcome(
    db: Session,
) -> None:
    requester = add_account(db, available=10)
    event = order_event("order.created", requester_id=requester.user_id, amount=20)

    apply_order_event(db, event)
    db.commit()

    db.refresh(requester)
    audit = db.scalar(select(CreditTransaction))
    outbox = db.scalar(select(OutboxEvent))
    assert requester.available_balance == 10
    assert requester.reserved_balance == 0
    assert db.scalar(select(func.count()).select_from(CreditReservation)) == 0
    assert audit.outcome == "REJECTED"
    assert audit.reason == "INSUFFICIENT_CREDIT"
    assert outbox.event_type == "credit.reservation_failed"
    assert outbox.payload["reason"] == "INSUFFICIENT_CREDIT"


def test_first_order_lazily_initializes_then_reserves(db: Session) -> None:
    event = order_event("order.created", amount=20)

    apply_order_event(db, event)
    db.commit()

    account = db.get(CreditAccount, event.requester_id)
    audits = list(db.scalars(select(CreditTransaction).order_by(CreditTransaction.created_at)))
    outbox = db.scalar(select(OutboxEvent))
    assert (account.available_balance, account.reserved_balance) == (80, 20)
    assert db.scalar(select(func.count()).select_from(CreditReservation)) == 1
    assert [audit.transaction_type for audit in audits] == [
        "INITIAL_ALLOCATION",
        "RESERVATION",
    ]
    assert outbox.event_type == "credit.reserved"


def test_insufficient_first_order_commits_initialization_and_rejection(
    db: Session,
) -> None:
    event = order_event("order.created", amount=150)

    apply_incoming_event(db, event, initial_allocation=100)
    db.commit()

    account = db.get(CreditAccount, event.requester_id)
    audits = list(db.scalars(select(CreditTransaction).order_by(CreditTransaction.created_at)))
    outbox = db.scalar(select(OutboxEvent))
    assert (account.available_balance, account.reserved_balance) == (100, 0)
    assert [audit.transaction_type for audit in audits] == [
        "INITIAL_ALLOCATION",
        "RESERVATION",
    ]
    assert audits[1].outcome == "REJECTED"
    assert audits[1].reason == "INSUFFICIENT_CREDIT"
    assert outbox.event_type == "credit.reservation_failed"


def test_completed_order_transfers_reserved_credit_and_audits_both_accounts(
    db: Session,
) -> None:
    requester = add_account(db)
    courier = add_account(db, available=5)
    order_id = uuid4()
    apply_order_event(
        db,
        order_event(
            "order.created",
            requester_id=requester.user_id,
            order_id=order_id,
            amount=25,
        ),
    )
    db.commit()

    apply_order_event(
        db,
        order_event(
            "order.completed",
            requester_id=requester.user_id,
            courier_id=courier.user_id,
            order_id=order_id,
            amount=25,
        ),
    )
    db.commit()

    db.refresh(requester)
    db.refresh(courier)
    reservation = db.scalar(
        select(CreditReservation).where(CreditReservation.order_id == order_id)
    )
    transfer_audits = list(
        db.scalars(
            select(CreditTransaction).where(
                CreditTransaction.transaction_type == "TRANSFER"
            )
        )
    )
    assert (requester.available_balance, requester.reserved_balance) == (75, 0)
    assert courier.available_balance == 30
    assert reservation.status == "TRANSFERRED"
    assert reservation.courier_id == courier.user_id
    assert len(transfer_audits) == 2
    total_delta = sum(
        item.available_delta + item.reserved_delta for item in transfer_audits
    )
    assert total_delta == 0
    assert list(
        db.scalars(select(OutboxEvent.event_type).order_by(OutboxEvent.id))
    ) == ["credit.reserved"]


def test_cancelled_order_releases_reserved_credit(db: Session) -> None:
    requester = add_account(db)
    order_id = uuid4()
    apply_order_event(
        db,
        order_event(
            "order.created",
            requester_id=requester.user_id,
            order_id=order_id,
            amount=40,
        ),
    )
    db.commit()

    apply_order_event(
        db,
        order_event(
            "order.cancelled",
            requester_id=requester.user_id,
            order_id=order_id,
            amount=40,
            previous_status="created",
        ),
    )
    db.commit()

    db.refresh(requester)
    reservation = db.scalar(
        select(CreditReservation).where(CreditReservation.order_id == order_id)
    )
    assert (requester.available_balance, requester.reserved_balance) == (100, 0)
    assert reservation.status == "RELEASED"
    release_audit = db.scalar(
        select(CreditTransaction).where(
            CreditTransaction.transaction_type == "RELEASE"
        )
    )
    assert (release_audit.available_delta, release_audit.reserved_delta) == (
        40,
        -40,
    )
    assert release_audit.reason == "ORDER_CANCELLED"
    assert list(
        db.scalars(select(OutboxEvent.event_type).order_by(OutboxEvent.id))
    ) == ["credit.reserved"]


def test_duplicate_incoming_event_is_a_complete_no_op(db: Session) -> None:
    requester = add_account(db)
    event = order_event("order.created", requester_id=requester.user_id, amount=15)

    apply_incoming_event(db, event, initial_allocation=100)
    db.commit()
    apply_incoming_event(db, event, initial_allocation=100)
    db.commit()

    db.refresh(requester)
    assert (requester.available_balance, requester.reserved_balance) == (85, 15)
    assert db.scalar(select(func.count()).select_from(ProcessedEvent)) == 1
    assert db.scalar(select(func.count()).select_from(CreditTransaction)) == 1
    assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 1


def test_transfer_after_release_is_rejected_without_mutation(db: Session) -> None:
    requester = add_account(db)
    courier = add_account(db)
    order_id = uuid4()
    created = order_event(
        "order.created",
        requester_id=requester.user_id,
        order_id=order_id,
    )
    apply_order_event(db, created)
    db.commit()
    apply_order_event(
        db,
        order_event(
            "order.expired", requester_id=requester.user_id, order_id=order_id
        ),
    )
    db.commit()
    release_audit = db.scalar(
        select(CreditTransaction).where(
            CreditTransaction.transaction_type == "RELEASE"
        )
    )
    assert (release_audit.available_delta, release_audit.reserved_delta) == (
        20,
        -20,
    )
    assert release_audit.reason == "ORDER_EXPIRED"
    assert list(
        db.scalars(select(OutboxEvent.event_type).order_by(OutboxEvent.id))
    ) == ["credit.reserved"]

    with pytest.raises(CreditStateConflict):
        apply_order_event(
            db,
            order_event(
                "order.completed",
                requester_id=requester.user_id,
                courier_id=courier.user_id,
                order_id=order_id,
            ),
        )
    db.rollback()

    db.refresh(requester)
    db.refresh(courier)
    assert (requester.available_balance, requester.reserved_balance) == (100, 0)
    assert courier.available_balance == 100


def test_cancel_after_pickup_credits_the_courier(db: Session) -> None:
    requester = add_account(db)
    courier = add_account(db)
    order_id = uuid4()
    apply_order_event(
        db,
        order_event(
            "order.created",
            requester_id=requester.user_id,
            order_id=order_id,
            amount=20,
        ),
    )
    db.commit()

    apply_order_event(
        db,
        order_event(
            "order.cancelled",
            requester_id=requester.user_id,
            courier_id=courier.user_id,
            order_id=order_id,
            amount=20,
            previous_status="picked_up",
        ),
    )
    db.commit()

    db.refresh(requester)
    db.refresh(courier)
    reservation = db.scalar(
        select(CreditReservation).where(CreditReservation.order_id == order_id)
    )
    transfer_audits = list(
        db.scalars(
            select(CreditTransaction).where(
                CreditTransaction.transaction_type == "TRANSFER"
            )
        )
    )
    assert (requester.available_balance, requester.reserved_balance) == (80, 0)
    assert courier.available_balance == 120
    assert reservation.status == "TRANSFERRED"
    assert reservation.courier_id == courier.user_id
    assert list(
        db.scalars(select(OutboxEvent.event_type).order_by(OutboxEvent.id))
    ) == ["credit.reserved"]
    assert all(
        "ORDER_CANCELLED_AFTER_PICKUP" in item.reason
        for item in transfer_audits
    )


def test_rollback_removes_all_staged_reservation_changes(db: Session) -> None:
    requester = add_account(db)
    event = order_event("order.created", requester_id=requester.user_id, amount=30)

    apply_order_event(db, event)
    db.rollback()

    db.refresh(requester)
    assert (requester.available_balance, requester.reserved_balance) == (100, 0)
    assert db.scalar(select(func.count()).select_from(CreditReservation)) == 0
    assert db.scalar(select(func.count()).select_from(CreditTransaction)) == 0
    assert db.scalar(select(func.count()).select_from(OutboxEvent)) == 0


def test_admin_adjustment_records_actor_and_preserves_nonnegative_balance(
    db: Session,
) -> None:
    account = add_account(db, available=10)
    actor_user_id = uuid4()
    correlation_id = uuid4()

    adjust_account(
        db,
        user_id=account.user_id,
        actor_user_id=actor_user_id,
        amount=-5,
        reason="Correct duplicate grant",
        correlation_id=correlation_id,
    )
    db.commit()

    db.refresh(account)
    audit = db.scalar(select(CreditTransaction))
    assert account.available_balance == 5
    assert audit.actor_user_id == actor_user_id
    assert audit.amount == 5
    assert audit.available_delta == -5
    assert audit.correlation_id == correlation_id

    with pytest.raises(InvalidCreditAdjustment):
        adjust_account(
            db,
            user_id=account.user_id,
            actor_user_id=actor_user_id,
            amount=-6,
            reason="Would become negative",
            correlation_id=uuid4(),
        )
    db.rollback()


def test_valid_settlement_lazily_initializes_courier(db: Session) -> None:
    requester = add_account(db)
    courier_id = uuid4()
    order_id = uuid4()
    apply_order_event(
        db,
        order_event(
            "order.created", requester_id=requester.user_id, order_id=order_id
        ),
    )
    db.commit()

    apply_order_event(
        db,
        order_event(
            "order.completed",
            requester_id=requester.user_id,
            courier_id=courier_id,
            order_id=order_id,
        ),
        initial_allocation=100,
    )
    db.commit()

    courier = db.get(CreditAccount, courier_id)
    assert courier.available_balance == 120
    assert courier.initial_allocation_granted_at is not None
    assert db.scalar(
        select(func.count()).select_from(CreditTransaction).where(
            CreditTransaction.affected_user_id == courier_id,
            CreditTransaction.transaction_type == "INITIAL_ALLOCATION",
        )
    ) == 1


def test_invalid_settlement_does_not_initialize_courier(db: Session) -> None:
    requester = add_account(db)
    courier_id = uuid4()

    with pytest.raises(CreditStateConflict):
        apply_order_event(
            db,
            order_event(
                "order.completed",
                requester_id=requester.user_id,
                courier_id=courier_id,
            ),
            initial_allocation=100,
        )
    db.rollback()

    assert db.get(CreditAccount, courier_id) is None
