from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import NotFoundError
from app.models.notification import Notification
from app.repositories.notifications import NotificationRepository


class NotificationService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = NotificationRepository(session)

    async def list_notifications(
        self,
        user_id: str,
        *,
        unread_only: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[Sequence[Notification], int, int]:
        return await self._repo.list_for_recipient(
            user_id, unread_only=unread_only, limit=limit, offset=offset
        )

    async def mark_read(self, user_id: str, notification_id: str) -> None:
        if not await self._repo.mark_read(user_id, notification_id):
            raise NotFoundError("Notification not found.")
        await self._session.commit()

    async def mark_all_read(self, user_id: str) -> int:
        marked = await self._repo.mark_all_read(user_id)
        await self._session.commit()
        return marked
