"""Persistence model for accounts, reservations, audit rows, and messaging."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


RESERVATION_STATUSES = ("ACTIVE", "TRANSFERRED", "RELEASED")
TRANSACTION_TYPES = (
    "INITIAL_ALLOCATION",
    "RESERVATION",
    "TRANSFER",
    "RELEASE",
    "ADMIN_ADJUSTMENT",
)
TRANSACTION_OUTCOMES = ("SUCCEEDED", "REJECTED")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CreditAccount(Base):
    """One closed-economy credit account per User Service identity."""

    __tablename__ = "credit_accounts"
    __table_args__ = (
        CheckConstraint(
            "available_balance >= 0", name="ck_credit_accounts_available_nonnegative"
        ),
        CheckConstraint(
            "reserved_balance >= 0", name="ck_credit_accounts_reserved_nonnegative"
        ),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, nullable=False)
    available_balance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    reserved_balance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    initial_allocation_granted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    @property
    def total_balance(self) -> int:
        return self.available_balance + self.reserved_balance


class CreditReservation(Base):
    """The credits held for one order until release or transfer."""

    __tablename__ = "credit_reservations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_credit_reservations_amount_positive"),
        CheckConstraint(
            "status IN ('ACTIVE', 'TRANSFERRED', 'RELEASED')",
            name="ck_credit_reservations_status",
        ),
        Index(
            "ix_credit_reservations_active_requester",
            "requester_id",
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    requester_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    courier_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CreditTransaction(Base):
    """Immutable audit record, including rejected credit operations."""

    __tablename__ = "credit_transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_credit_transactions_amount_positive"),
        CheckConstraint(
            "transaction_type IN ('INITIAL_ALLOCATION', 'RESERVATION', 'TRANSFER', "
            "'RELEASE', 'ADMIN_ADJUSTMENT')",
            name="ck_credit_transactions_type",
        ),
        CheckConstraint(
            "outcome IN ('SUCCEEDED', 'REJECTED')",
            name="ck_credit_transactions_outcome",
        ),
        Index(
            "ix_credit_transactions_user_created_at",
            "affected_user_id",
            "created_at",
        ),
        Index(
            "ix_credit_transactions_order_created_at", "order_id", "created_at"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    event_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    order_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    affected_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    counterparty_user_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    actor_user_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    transaction_type: Mapped[str] = mapped_column(String(32), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    available_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reserved_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ProcessedEvent(Base):
    """Inbox deduplication record for at-least-once broker delivery."""

    __tablename__ = "processed_events"

    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class OutboxEvent(Base):
    """An event committed with a credit mutation and relayed by the worker."""

    __tablename__ = "outbox_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_credit_outbox_event_id"),
        Index(
            "ix_credit_outbox_unpublished",
            "id",
            postgresql_where=text("published_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    order_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
