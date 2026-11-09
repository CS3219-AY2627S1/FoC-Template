# AI-influenced: repository layer extracted from the ported chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Queries on the `messages` table."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import insert, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.messages import Message


async def create(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    seq: int,
    sender_id: uuid.UUID | None,
    client_msg_id: uuid.UUID | None,
    kind: str,
    body: str | None,
    payload: dict[str, Any] | None,
    reply_to_id: uuid.UUID | None,
) -> Message:
    msg = await session.scalar(
        insert(Message)
        .values(
            conversation_id=conversation_id,
            seq=seq,
            sender_id=sender_id,
            client_msg_id=client_msg_id,
            kind=kind,
            body=body,
            payload=payload,
            reply_to_id=reply_to_id,
        )
        .returning(Message)
    )
    assert msg is not None
    return msg


async def get(session: AsyncSession, message_id: uuid.UUID) -> Message | None:
    return await session.get(Message, message_id)


async def get_for_update(session: AsyncSession, message_id: uuid.UUID) -> Message | None:
    return await session.scalar(select(Message).where(Message.id == message_id).with_for_update())


async def by_client_id(
    session: AsyncSession, sender_id: uuid.UUID, client_msg_id: uuid.UUID
) -> Message | None:
    """A message this sender already sent with this idempotency key."""
    return await session.scalar(
        select(Message).where(
            Message.sender_id == sender_id, Message.client_msg_id == client_msg_id
        )
    )


async def at_seq(session: AsyncSession, conversation_id: uuid.UUID, seq: int) -> Message | None:
    return await session.scalar(
        select(Message).where(Message.conversation_id == conversation_id, Message.seq == seq)
    )


async def at_seqs(
    session: AsyncSession, keys: list[tuple[uuid.UUID, int]]
) -> dict[uuid.UUID, Message]:
    """One message per (conversation_id, seq), keyed by conversation (inbox previews)."""
    if not keys:
        return {}
    rows = await session.scalars(
        select(Message).where(tuple_(Message.conversation_id, Message.seq).in_(keys))
    )
    return {msg.conversation_id: msg for msg in rows}


async def page(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    *,
    visible_after: int,
    before_seq: int | None,
    after_seq: int | None,
    limit: int,
) -> tuple[list[Message], bool]:
    """A page of messages in seq order, and whether more exist in the paging direction.

    With `after_seq` the page starts right after it (catching up after a reconnect or a
    gap); otherwise it is the newest page, or the one before `before_seq` (scrolling
    back). Messages at or before `visible_after` (the member's history start) never show.
    """
    q = select(Message).where(
        Message.conversation_id == conversation_id, Message.seq > visible_after
    )
    if before_seq is not None:
        q = q.where(Message.seq < before_seq)
    if after_seq is not None:
        q = q.where(Message.seq > after_seq).order_by(Message.seq.asc())
        rows = list(await session.scalars(q.limit(limit + 1)))
        return rows[:limit], len(rows) > limit
    rows = list(await session.scalars(q.order_by(Message.seq.desc()).limit(limit + 1)))
    return list(reversed(rows[:limit])), len(rows) > limit
