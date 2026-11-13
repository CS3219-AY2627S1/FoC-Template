# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-sonnet-5-5, then claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code; Refactoring and documentation improvements — write SQLAlchemy 2 models matching the migration and a TimestampTZ type that rejects naive datetimes; later refactor the recipient_role CHECK to be built from RECIPIENT_ROLES (ai-20261104-001).
# Author review: Keith confirmed that all tests and manual verification were completed and approved, and confirmed rerunning the tests himself, with commands and results unspecified (ai-20261104-001).
# Details: notification-service/ai/usage-log.md; ai-20261104-001

"""SQLAlchemy models for the Notification Service tables."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.db import Base

RECIPIENT_ROLES = ("requester", "courier")
RECIPIENT_ROLE_CHECK = "recipient_role IN ({})".format(
    ", ".join(f"'{role}'" for role in RECIPIENT_ROLES)
)


class TimestampTZ(TypeDecorator):
    """timestamptz that rejects naive datetimes instead of guessing a zone.

    PostgreSQL would interpret a naive value in the session time zone, which
    silently stores the wrong instant. Binding a naive datetime raises instead.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect):
        if value is not None and value.tzinfo is None:
            raise ValueError("naive datetime is not allowed; supply a timezone")
        return value


class ProcessedEvent(Base):
    """One row per consumed Kafka event."""

    __tablename__ = "processed_events"

    event_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(TimestampTZ, nullable=False)


class Notification(Base):
    """One row per recipient per event.

    ``recipient_id`` is a User Service user ID. There is deliberately no
    foreign key, because users live in another service.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(RECIPIENT_ROLE_CHECK, name="ck_notifications_recipient_role"),
        UniqueConstraint(
            "event_id", "recipient_id", name="uq_notifications_event_recipient"
        ),
        Index("ix_notifications_recipient_id_desc", "recipient_id", text("id DESC")),
        Index(
            "ix_notifications_recipient_unread",
            "recipient_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recipient_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    recipient_role: Mapped[str] = mapped_column(String(16), nullable=False)
    event_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    order_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    params: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(TimestampTZ, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TimestampTZ, nullable=False, server_default=text("now()")
    )
    read_at: Mapped[datetime | None] = mapped_column(TimestampTZ, nullable=True)
