# AI-influenced: WebSocket ticket table written with Claude (Opus 5.5); see ai/usage-log.md.
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WsTicket(Base):
    """A one-time credential for opening a WebSocket. Only its SHA-256 is stored."""

    __tablename__ = "ws_tickets"

    ticket_hash: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ws_tickets_expires_idx", "expires_at"),)
