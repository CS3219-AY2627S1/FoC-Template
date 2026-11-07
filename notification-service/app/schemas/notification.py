from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    notification_id: str
    event_type: str
    order_id: str
    order_name: str
    order_status: str
    title: str
    body: str
    created_at: datetime
    read_at: datetime | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    unread_count: int
    total: int


class MarkAllReadResponse(BaseModel):
    marked_read: int
    unread_count: int
