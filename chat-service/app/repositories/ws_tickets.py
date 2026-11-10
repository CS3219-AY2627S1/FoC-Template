# AI-influenced: WebSocket ticket queries written with Claude (Opus 5.5); see ai/usage-log.md.
"""Queries on the `ws_tickets` table. Callers pass the ticket's hash, never the ticket."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, func, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ws_tickets import WsTicket


async def create(
    session: AsyncSession, ticket_hash: str, user_id: uuid.UUID, expires_at: datetime
) -> None:
    await session.execute(
        insert(WsTicket).values(ticket_hash=ticket_hash, user_id=user_id, expires_at=expires_at)
    )


async def consume(session: AsyncSession, ticket_hash: str) -> uuid.UUID | None:
    """Delete a live ticket and return its user; None if unknown, used or expired."""
    return await session.scalar(
        delete(WsTicket)
        .where(WsTicket.ticket_hash == ticket_hash, WsTicket.expires_at > func.now())
        .returning(WsTicket.user_id)
    )


async def delete_expired(session: AsyncSession) -> int:
    result = await session.execute(delete(WsTicket).where(WsTicket.expires_at <= func.now()))
    return result.rowcount or 0
