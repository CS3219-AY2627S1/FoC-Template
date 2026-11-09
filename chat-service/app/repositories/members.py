# AI-influenced: repository layer extracted from the ported chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Queries on the `conversation_members` table."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversations import ConversationMember


async def get(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> ConversationMember | None:
    """The membership row, also if the user has left (`left_at` set)."""
    return await session.scalar(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
        .execution_options(populate_existing=True)
    )


async def active(session: AsyncSession, conversation_id: uuid.UUID) -> list[ConversationMember]:
    rows = await session.scalars(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.left_at.is_(None),
        )
        .order_by(ConversationMember.joined_at)
        .execution_options(populate_existing=True)
    )
    return list(rows)


async def active_in(
    session: AsyncSession, conversation_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[ConversationMember]]:
    """Active members of several conversations, grouped by conversation."""
    rows = await session.scalars(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id.in_(conversation_ids),
            ConversationMember.left_at.is_(None),
        )
        .order_by(ConversationMember.joined_at)
    )
    grouped: dict[uuid.UUID, list[ConversationMember]] = {}
    for member in rows:
        grouped.setdefault(member.conversation_id, []).append(member)
    return grouped


async def add_many(
    session: AsyncSession, conversation_id: uuid.UUID, members: list[tuple[uuid.UUID, str | None]]
) -> None:
    if members:
        await session.execute(
            insert(ConversationMember),
            [
                {"conversation_id": conversation_id, "user_id": user_id, "label": label}
                for user_id, label in members
            ],
        )


async def join(
    session: AsyncSession,
    existing: ConversationMember | None,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    label: str | None,
    set_label: bool,
    history_from_seq: int,
    seen_seq: int,
    joined_at: datetime,
) -> None:
    """Add a member, or bring back one who left. Messages up to `seen_seq` count as seen."""
    if existing is None:
        session.add(
            ConversationMember(
                conversation_id=conversation_id,
                user_id=user_id,
                label=label,
                history_from_seq=history_from_seq,
                delivered_seq=seen_seq,
                read_seq=seen_seq,
            )
        )
    else:
        existing.left_at = None
        existing.joined_at = joined_at
        existing.history_from_seq = history_from_seq
        existing.delivered_seq = max(existing.delivered_seq, seen_seq)
        existing.read_seq = max(existing.read_seq, seen_seq)
        if set_label:
            existing.label = label
    await session.flush()


async def advance(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    delivered_seq: int,
    read_seq: int | None,
) -> tuple[int, int]:
    """Move delivered/read positions forward (never back). Returns the new positions."""
    values = {"delivered_seq": func.greatest(ConversationMember.delivered_seq, delivered_seq)}
    if read_seq is not None:
        values["read_seq"] = func.greatest(ConversationMember.read_seq, read_seq)
    row = (
        await session.execute(
            update(ConversationMember)
            .where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user_id,
            )
            .values(**values)
            .returning(ConversationMember.delivered_seq, ConversationMember.read_seq)
            .execution_options(synchronize_session=False)
        )
    ).one()
    return row.delivered_seq, row.read_seq


async def mark_left(session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    await session.execute(
        update(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
        .values(left_at=func.now())
    )
