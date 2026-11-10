# AI-influenced: repository layer extracted from the ported chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Queries on the `conversations` table."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversations import Conversation, ConversationKind, ConversationMember


async def get(session: AsyncSession, conversation_id: uuid.UUID) -> Conversation | None:
    """Fresh from the database (other statements may have changed the row)."""
    return await session.get(Conversation, conversation_id, populate_existing=True)


async def get_for_update(session: AsyncSession, conversation_id: uuid.UUID) -> Conversation | None:
    return await session.scalar(
        select(Conversation).where(Conversation.id == conversation_id).with_for_update()
    )


async def insert(
    session: AsyncSession,
    *,
    kind: ConversationKind,
    unique_key: str | None,
    title: str | None,
    metadata: dict[str, Any],
    purge_after: datetime | None,
) -> tuple[Conversation, bool]:
    """Insert, or return the existing row with the same `unique_key`. (row, created)"""
    stmt = (
        pg_insert(Conversation)
        .values(
            kind=kind,
            unique_key=unique_key,
            title=title,
            metadata_=metadata,
            purge_after=purge_after,
        )
        .returning(Conversation)
    )
    if unique_key is not None:
        stmt = stmt.on_conflict_do_nothing(index_elements=[Conversation.unique_key])
    conv = await session.scalar(stmt)
    if conv is not None:
        return conv, True
    existing = await session.scalar(
        select(Conversation).where(Conversation.unique_key == unique_key)
    )
    assert existing is not None
    return existing, False


async def find(
    session: AsyncSession,
    *,
    unique_key: str | None,
    metadata: dict[str, Any] | None,
    limit: int,
) -> list[Conversation]:
    q = select(Conversation)
    if unique_key is not None:
        q = q.where(Conversation.unique_key == unique_key)
    if metadata:
        q = q.where(Conversation.metadata_.contains(metadata))  # uses the GIN index (@>)
    rows = await session.scalars(q.order_by(Conversation.created_at.desc()).limit(limit))
    return list(rows)


async def for_member(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Conversation, ConversationMember]]:
    """The user's active conversations with their membership, most recent first."""
    rows = await session.execute(
        select(Conversation, ConversationMember)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None))
        .order_by(Conversation.last_message_at.desc().nulls_last(), Conversation.created_at.desc())
    )
    return [(conv, member) for conv, member in rows.all()]


async def allocate_seq(session: AsyncSession, conversation_id: uuid.UUID) -> int | None:
    """Next message seq. The row lock serialises sends per conversation.
    None if the conversation is missing or closed."""
    return await session.scalar(
        update(Conversation)
        .where(Conversation.id == conversation_id, Conversation.closed_at.is_(None))
        .values(last_seq=Conversation.last_seq + 1, last_message_at=func.now())
        .returning(Conversation.last_seq)
    )


async def mark_closed(session: AsyncSession, conversation_id: uuid.UUID) -> None:
    await session.execute(
        update(Conversation).where(Conversation.id == conversation_id).values(closed_at=func.now())
    )


async def lock_purgeable(session: AsyncSession, batch: int) -> list[uuid.UUID]:
    """Ids past `purge_after`, locked; other replicas skip them."""
    rows = await session.scalars(
        select(Conversation.id)
        .where(Conversation.purge_after.is_not(None), Conversation.purge_after <= func.now())
        .limit(batch)
        .with_for_update(skip_locked=True)
    )
    return list(rows)


async def delete(session: AsyncSession, conversation_id: uuid.UUID) -> None:
    """Members and messages go with it (ON DELETE CASCADE)."""
    conv = await session.get(Conversation, conversation_id)
    if conv is not None:
        await session.delete(conv)
