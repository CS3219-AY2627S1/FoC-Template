# AI-influenced: photo attachments written with Claude (Opus 5.5); see ai/usage-log.md.
"""Photos uploaded to a conversation. The bytes live in a private bucket; this row is the
only way to reach them, and chat-service checks access on every read."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # Both links are SET NULL rather than CASCADE so a purge or delete never loses track
    # of a stored object: rows that lose their conversation or message are garbage the
    # cleanup sweep deletes from the bucket first.
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL")
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), unique=True
    )
    uploader_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("attachments_conversation_idx", "conversation_id"),
        Index(
            "attachments_unbound_idx",
            "uploader_id",
            "created_at",
            postgresql_where=text("message_id IS NULL"),
        ),
    )
