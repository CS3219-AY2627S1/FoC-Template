from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Status(str, Enum):
    OPEN = "open"
    ACCEPTED = "accepted"
    PICKED_UP = "picked_up"
    DELIVERED = "delivered"
    RECEIVED = "received"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    INIT = "init"
    REJECTED = "rejected"


class CreditStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    REJECTED = "rejected"


class ErrandRequest(Base):
    __tablename__ = "errand_requests"

    id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True, default=text("gen_random_uuid()"),
    )

    requester_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=False,
    )

    supplier_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=False,
    )

    items: Mapped[list | dict] = mapped_column(JSONB, nullable=False,)

    supplier_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    pickup_notes: Mapped[str | None] = mapped_column(Text, nullable=True,)

    credits: Mapped[int] = mapped_column(BigInteger, nullable=False,)

    status: Mapped[Status] = mapped_column(
        SQLEnum(Status, name="request_status", 
                values_callable=lambda enum: [e.value for e in enum],),
        nullable=False,
        default=Status.INIT,
    )

    credit_status: Mapped[CreditStatus] = mapped_column(
        SQLEnum(CreditStatus, name="order_credit_status",
                values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
        default=CreditStatus.PENDING,
    )

    credit_operation: Mapped[str] = mapped_column(String(16), nullable=False, default="RESERVE")
    disputes: Mapped[list["OrderDispute"]] = relationship(lazy="selectin", order_by="OrderDispute.created_at")

    courier_id: Mapped[UUID | None] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.clock_timestamp(),
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, 
            default=text("(clock_timestamp() + interval '15 minutes')"),
    )

    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    progress_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    settlement_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.clock_timestamp(),
    )


    __table_args__ = (
        CheckConstraint("credits >= 1", name="errand_requests_credits_check"),
    )


class OrderDispute(Base):
    """A review case orthogonal to the order's fulfilment milestone."""

    __tablename__ = "order_disputes"
    id: Mapped[UUID] = mapped_column(PostgresUUID(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), ForeignKey("errand_requests.id", ondelete="CASCADE"), nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    opened_by: Mapped[UUID | None] = mapped_column(PostgresUUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_by: Mapped[UUID | None] = mapped_column(PostgresUUID(as_uuid=True))
    resolution: Mapped[str | None] = mapped_column(String(32))
    resolution_reason: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint("kind IN ('fulfilment', 'financial')", name="dispute_kind_check"),
        Index("one_open_dispute_per_kind", "order_id", "kind", unique=True,
              postgresql_where=text("closed_at IS NULL")),
    )


class OrderCreationKey(Base):
    __tablename__ = "order_creation_keys"

    requester_id: Mapped[UUID] = mapped_column(PostgresUUID(as_uuid=True), primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    order_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), ForeignKey("errand_requests.id", ondelete="CASCADE"),
        nullable=False, unique=True,)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)


class CreditCommandOutbox(Base):
    __tablename__ = "credit_command_outbox"

    id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True, default=uuid4,
    )
    order_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("errand_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    routing_key: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("credit_command_outbox_pending_idx", "available_at", "created_at"),
    )


class CreditCommandResult(Base):
    __tablename__ = "order_credit_results"

    request_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("credit_command_outbox.id", ondelete="CASCADE"),
        primary_key=True,
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp(),
    )

class OrderAuditLog(Base):
    __tablename__ = "order_audit_logs"

    log_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True, default=uuid4,
    )
    order_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True),
        ForeignKey("errand_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    # nullable because system triggered events dont have an actor
    actor_id: Mapped[UUID | None] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=True,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.clock_timestamp(),
    )

    __table_args__ = (
        Index("order_audit_logs_order_id_idx", "order_id", "created_at"),
    )
