# AI-influenced: WebSocket ticket flow written with Claude (Opus 5.5); see ai/usage-log.md.
"""One-time WebSocket tickets.

Browsers cannot put an ``Authorization`` header on a WebSocket handshake, and a
long-lived JWT in a URL ends up in proxy and access logs. So the client first calls
``POST /chat/ws-ticket`` over normal authenticated HTTP and receives a random ticket
that is valid for a few seconds and can be redeemed exactly once, as
``/chat/ws?ticket=...``.

Tickets live in Postgres, so any replica can redeem a ticket issued by another one.
Only the SHA-256 of a ticket is stored.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import ws_tickets as ticket_repo


def _hash(ticket: str) -> str:
    return hashlib.sha256(ticket.encode()).hexdigest()


async def issue(session: AsyncSession, user_id: uuid.UUID, ttl_s: int) -> tuple[str, datetime]:
    ticket = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(seconds=ttl_s)
    await ticket_repo.create(session, _hash(ticket), user_id, expires_at)
    return ticket, expires_at


async def redeem(session: AsyncSession, ticket: str) -> uuid.UUID | None:
    """Return the ticket's user and delete it, or None if unknown, used or expired."""
    if not ticket or len(ticket) > 200:
        return None
    return await ticket_repo.consume(session, _hash(ticket))


async def delete_expired(session: AsyncSession) -> int:
    return await ticket_repo.delete_expired(session)
