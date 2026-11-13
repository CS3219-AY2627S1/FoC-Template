"""SQLAlchemy models for the Order Service."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    JSON,
    LargeBinary,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

ORDER_STATUSES = (
    "PENDING_CREDIT",
    "OPEN",
    "REJECTED",
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
)

_STATUS_CHECK = "status IN ({})".format(
    ", ".join(f"'{status}'" for status in ORDER_STATUSES)
)


def utc_now() -> datetime:
    """Return the current timezone-aware UTC timestamp."""

    return datetime.now(timezone.utc)


class Order(Base):
    """Persisted errand request and lifecycle state."""

    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint(
            "requester_id", "idempotency_key", name="uq_orders_requester_idempotency"
        ),
        CheckConstraint("credit_amount > 0", name="ck_orders_credit_amount_positive"),
        CheckConstraint(_STATUS_CHECK, name="ck_orders_status"),
        Index("ix_orders_requester_created_at", "requester_id", "created_at"),
        Index("ix_orders_courier_created_at", "courier_id", "created_at"),
        Index(
            "ix_orders_open_created_at",
            "created_at",
            postgresql_where=text("status = 'OPEN'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    requester_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    pickup_supplier_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    delivery_label: Mapped[str] = mapped_column(String(200), nullable=False)
    delivery_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    delivery_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    delivery_details: Mapped[str] = mapped_column(String(500), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    credit_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    courier_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    rejection_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OutboxEvent(Base):
    """Lifecycle event committed in the same transaction as the order change.

    The API never publishes directly. The worker relays unpublished rows in id order.
    """

    __tablename__ = "outbox_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_outbox_events_event_id"),
        Index(
            "ix_outbox_events_unpublished",
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
    order_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ParkedMessage(Base):
    """Credit message the DLQ could not accept. The worker relays it to the DLQ later."""

    __tablename__ = "parked_messages"
    __table_args__ = (
        UniqueConstraint(
            "source_topic", "source_partition", "source_offset", name="uq_parked_messages_source"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_topic: Mapped[str] = mapped_column(String(255), nullable=False)
    source_partition: Mapped[int] = mapped_column(Integer, nullable=False)
    source_offset: Mapped[int] = mapped_column(BigInteger, nullable=False)
    key: Mapped[bytes | None] = mapped_column(LargeBinary)
    value: Mapped[bytes | None] = mapped_column(LargeBinary)
    headers: Mapped[list | None] = mapped_column(JSON)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProcessedEvent(Base):
    """Incoming event ids that have already been applied. Consumers dedupe on this."""

    __tablename__ = "processed_events"

    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
