# AI-influenced: event inbox queries written with Claude (Opus 5.5); see ai/usage-log.md.
"""Queries on the `processed_events` inbox (idempotent event consumption)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.processed_events import ProcessedEvent


async def record(session: AsyncSession, event_id: str, event_type: str) -> bool:
    """Remember an event id. False if it was already recorded (a redelivery)."""
    inserted = await session.scalar(
        pg_insert(ProcessedEvent)
        .values(event_id=event_id, event_type=event_type)
        .on_conflict_do_nothing(index_elements=[ProcessedEvent.event_id])
        .returning(ProcessedEvent.event_id)
    )
    return inserted is not None


async def prune(session: AsyncSession, keep_days: int) -> None:
    await session.execute(
        delete(ProcessedEvent).where(
            ProcessedEvent.processed_at < func.now() - timedelta(days=keep_days)
        )
    )
