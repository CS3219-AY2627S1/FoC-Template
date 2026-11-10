# AI-influenced: event inbox table written with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ProcessedEvent(Base):
    """Inbox for consumed broker events: one row per event id, written in the same
    transaction as its effects, so a redelivered event changes nothing."""

    __tablename__ = "processed_events"

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
