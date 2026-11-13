from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._util import _new_id


class Notification(Base):
    """One user-visible notification derived from an order event.

    Unique on (event_id, recipient_id) so a redelivered event never produces a
    duplicate notification for the same recipient.
    """

    __tablename__ = "notifications"

    notification_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id)
    recipient_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False)
    order_name: Mapped[str] = mapped_column(String(255), nullable=False)
    order_status: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    __table_args__ = (
        UniqueConstraint("event_id", "recipient_id", name="uq_notifications_event_recipient"),
        Index("ix_notifications_recipient_created", "recipient_id", created_at.desc()),
    )
