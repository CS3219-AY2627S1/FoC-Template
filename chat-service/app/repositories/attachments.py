# AI-influenced: photo attachments written with Claude (Opus 5.5); see ai/usage-log.md.
"""Queries on the `attachments` table."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachments import Attachment
from app.models.messages import Message


async def create(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    uploader_id: uuid.UUID,
    object_key: str,
    content_type: str,
    size: int,
    width: int,
    height: int,
) -> Attachment:
    row = await session.scalar(
        insert(Attachment)
        .values(
            conversation_id=conversation_id,
            uploader_id=uploader_id,
            object_key=object_key,
            content_type=content_type,
            size=size,
            width=width,
            height=height,
        )
        .returning(Attachment)
    )
    assert row is not None
    return row


async def get(session: AsyncSession, attachment_id: uuid.UUID) -> Attachment | None:
    return await session.get(Attachment, attachment_id, populate_existing=True)


async def get_for_update(session: AsyncSession, attachment_id: uuid.UUID) -> Attachment | None:
    return await session.scalar(
        select(Attachment).where(Attachment.id == attachment_id).with_for_update()
    )


async def bind(session: AsyncSession, attachment_id: uuid.UUID, message_id: uuid.UUID) -> None:
    await session.execute(
        update(Attachment).where(Attachment.id == attachment_id).values(message_id=message_id)
    )


async def count_unbound(session: AsyncSession, uploader_id: uuid.UUID) -> int:
    """Uploads by this user not yet attached to a message."""
    return (
        await session.scalar(
            select(func.count())
            .select_from(Attachment)
            .where(Attachment.uploader_id == uploader_id, Attachment.message_id.is_(None))
        )
        or 0
    )


async def lock_garbage(
    session: AsyncSession, *, unbound_before: datetime, limit: int
) -> list[Attachment]:
    """Rows whose object can go: the conversation was purged, the message was deleted,
    or the upload was never sent. Locked; other replicas skip them."""
    rows = await session.scalars(
        select(Attachment)
        .outerjoin(Message, Message.id == Attachment.message_id)
        .where(
            or_(
                Attachment.conversation_id.is_(None),
                Message.deleted_at.is_not(None),
                (Attachment.message_id.is_(None)) & (Attachment.created_at < unbound_before),
            )
        )
        .limit(limit)
        .with_for_update(of=Attachment, skip_locked=True)
    )
    return list(rows)


async def delete_many(session: AsyncSession, ids: list[uuid.UUID]) -> None:
    if ids:
        await session.execute(delete(Attachment).where(Attachment.id.in_(ids)))
