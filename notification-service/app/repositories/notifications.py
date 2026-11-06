from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models._util import _utcnow
from app.models.notification import Notification
from app.services.rules import NotificationDraft


def _naive_utc(value: datetime) -> datetime:
    """Coerce an event timestamp to naive UTC for the timezone=False column."""
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


class NotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert_notifications(self, drafts: Iterable[NotificationDraft]) -> int:
        inserted = 0
        for d in drafts:
            try:
                async with self._session.begin_nested():
                    self._session.add(
                        Notification(
                            recipient_id=d.recipient_id,
                            event_id=d.event_id,
                            event_type=d.event_type,
                            order_id=d.order_id,
                            order_name=d.order_name,
                            order_status=d.order_status,
                            title=d.title,
                            body=d.body,
                            created_at=_naive_utc(d.created_at),
                        )
                    )
            except IntegrityError:
                continue
            inserted += 1
        return inserted

    async def list_for_recipient(
        self,
        recipient_id: str,
        *,
        unread_only: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[Sequence[Notification], int, int]:
        filters = [Notification.recipient_id == recipient_id]
        if unread_only:
            filters.append(Notification.read_at.is_(None))

        items_result = await self._session.execute(
            select(Notification)
            .where(*filters)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = items_result.scalars().all()

        total = await self._session.scalar(select(func.count()).where(*filters))
        unread_count = await self._session.scalar(
            select(func.count()).where(
                Notification.recipient_id == recipient_id,
                Notification.read_at.is_(None),
            )
        )
        return items, int(total or 0), int(unread_count or 0)

    async def mark_read(self, recipient_id: str, notification_id: str) -> bool:
        notification = await self._session.get(Notification, notification_id)
        if notification is None or notification.recipient_id != recipient_id:
            return False
        if notification.read_at is None:
            notification.read_at = _utcnow()
        return True

    async def mark_all_read(self, recipient_id: str) -> int:
        result = await self._session.execute(
            select(Notification).where(
                Notification.recipient_id == recipient_id,
                Notification.read_at.is_(None),
            )
        )
        now = _utcnow()
        marked = 0
        for notification in result.scalars():
            notification.read_at = now
            marked += 1
        return marked
