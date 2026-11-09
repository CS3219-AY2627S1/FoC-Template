# AI-influenced: repository layer extracted from the ported chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Queries on the `outbox` table (transactional outbox for domain events)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox import Outbox


def add(session: AsyncSession, topic: str, payload: dict[str, Any]) -> None:
    """Stage an event; it is written with the caller's transaction."""
    session.add(Outbox(topic=topic, payload=payload))


async def lock_unpublished(session: AsyncSession, limit: int) -> list[Outbox]:
    """Oldest unpublished events, locked; other relays skip them."""
    rows = await session.scalars(
        select(Outbox)
        .where(Outbox.published_at.is_(None))
        .order_by(Outbox.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(rows)


async def mark_published(session: AsyncSession, ids: list[int]) -> None:
    if ids:
        await session.execute(
            update(Outbox).where(Outbox.id.in_(ids)).values(published_at=func.now())
        )


async def prune_published(session: AsyncSession, keep_hours: int) -> None:
    """Delete events already published more than `keep_hours` ago."""
    await session.execute(
        delete(Outbox).where(
            Outbox.published_at.is_not(None),
            Outbox.published_at < func.now() - timedelta(hours=keep_hours),
        )
    )
