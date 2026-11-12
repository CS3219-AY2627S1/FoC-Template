# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Enum, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from main.database import Base


class ErrandStatus(str, enum.Enum):
    OPEN = "OPEN"
    ACCEPTED = "ACCEPTED"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class Errand(Base):
    __tablename__ = "errands"
    __table_args__ = (
        CheckConstraint("length(trim(required_item)) > 0", name="required_item_nonblank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    status: Mapped[ErrandStatus] = mapped_column(Enum(ErrandStatus, name="errand_status"), nullable=False, default=ErrandStatus.OPEN)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    courier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    supplier_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    required_item: Mapped[str] = mapped_column(Text, nullable=False)
    credit_value: Mapped[int] = mapped_column(Integer, nullable=False)
    delivery_building_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    delivery_floor: Mapped[str | None] = mapped_column(String(20))
    delivery_description: Mapped[str | None] = mapped_column(String(500))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(String(500))
    credit_reservation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True)
    pending_credit_action: Mapped[str | None] = mapped_column(String(20))


class CreditOperation(Base):
    """Durable intent/retry journal; never contains bearer tokens.

    CREATE IDs are errand IDs. Terminal operations have separate IDs and lock
    their errand using pending_credit_action before any external side effect.
    """

    __tablename__ = "credit_operations"
    __table_args__ = (UniqueConstraint("requester_id", "request_key", name="uq_credit_request"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    errand_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    requester_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    request_key: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(20), default="PENDING")
    payload: Mapped[dict] = mapped_column(JSONB().with_variant(JSON(), "sqlite"))
    reservation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutboxEvent(Base):
    """A domain event waiting to be relayed to Kafka.

    Rows are written in the same transaction as the change they describe. Debezium reads
    inserts from the WAL and its Outbox Event Router publishes each one to the topic named
    by ``type``, keyed by ``aggregateid``. Column names are the router's defaults.
    """

    __tablename__ = "outbox"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    aggregatetype: Mapped[str] = mapped_column(String(255), nullable=False)
    aggregateid: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


