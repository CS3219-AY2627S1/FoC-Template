# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Implemented the requested credit-account model and event-supplied creation timestamps
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Implemented the requested CreditAuditLog SQLAlchemy model and its initial named constraints
# Author review: I reviewed correctness and edited the changes to fit the project

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from credit.models import CreditAuditAction, CreditReservationStatus


class Base(DeclarativeBase):
    pass


class CreditOutbox(Base):
    __tablename__ = "credit_outbox"

    request_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True,
    )
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True,
    )

    __table_args__ = (
        Index(
            "credit_outbox_pending_idx", "request_id",
            postgresql_where=text("published_at IS NULL"),
        ),
    )


class CreditOrderGuard(Base):
    """Serialize all money-moving commands for an order."""

    __tablename__ = "credit_order_guards"
    order_id: Mapped[UUID] = mapped_column(PostgresUUID(as_uuid=True), primary_key=True)

class Credit(Base):
    __tablename__ = "credits"

    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True,
    )
    available_credits: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("100"),
    )
    reserved_credits: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False,
    )

    @property
    def total_credits(self) -> int:
        """The wallet total, derived from its two stored balances."""
        return self.available_credits + self.reserved_credits

    __table_args__ = (
        CheckConstraint(
            "available_credits >= 0", name="credits_available_non_negative",
        ),
        CheckConstraint(
            "reserved_credits >= 0", name="credits_reserved_non_negative",
        ),
    )


class CreditReservation(Base):
    __tablename__ = "credit_reservations"

    order_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), ForeignKey("credits.user_id"), nullable=False,
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        Text, nullable=False,
        server_default=text(f"'{CreditReservationStatus.RESERVED}'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False,
        server_default=func.now(), onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="credit_reservations_amount_positive"),
        CheckConstraint(
            "status IN (" + ", ".join(f"'{status}'" for status in CreditReservationStatus) + ")",
            name="credit_reservations_valid_status",
        ),
        Index("credit_reservations_user_status_idx", "user_id", "status"),
    )


class CreditAuditLog(Base):
    __tablename__ = "credit_audit_logs"

    log_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), primary_key=True, default=uuid4,
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=False,
    )
    recipient_user_id: Mapped[UUID | None] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=True,
    )
    order_id: Mapped[UUID | None] = mapped_column(
        PostgresUUID(as_uuid=True), nullable=True,
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False,
    )

    actor_id: Mapped[UUID | None] = mapped_column(PostgresUUID(as_uuid=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[UUID | None] = mapped_column(PostgresUUID(as_uuid=True), nullable=True)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "action IN (" + ", ".join(f"'{action}'" for action in CreditAuditAction) + ")",
            name="credit_audit_logs_valid_action",
        ),
        CheckConstraint(
            "amount >= 0", name="credit_audit_logs_amount_positive",
        ),
        CheckConstraint(
            f"(action = '{CreditAuditAction.TRANSFER}' AND recipient_user_id IS NOT NULL "
            "AND recipient_user_id <> user_id) "
            f"OR (action <> '{CreditAuditAction.TRANSFER}' AND recipient_user_id IS NULL)",
            name="credit_audit_logs_valid_recipient",
        ),
        CheckConstraint(
            f"(action = '{CreditAuditAction.INITIAL_ALLOCATION}' AND order_id IS NULL) "
            f"OR (action <> '{CreditAuditAction.INITIAL_ALLOCATION}' AND order_id IS NOT NULL)",
            name="credit_audit_logs_valid_order",
        ),
    )
