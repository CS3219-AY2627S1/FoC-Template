from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.notifications import NotificationRepository
from app.services.rules import NotificationDraft


class DeliveryChannel(Protocol):
    async def deliver(self, session: AsyncSession, drafts: Sequence[NotificationDraft]) -> int: ...


class InAppChannel:
    # A future WebSocket/SSE push channel plugs in here as another DeliveryChannel.
    async def deliver(self, session: AsyncSession, drafts: Sequence[NotificationDraft]) -> int:
        return await NotificationRepository(session).insert_notifications(drafts)
