from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationSourceEvent(BaseModel):
    """Tolerant view over the order events notification-service consumes.

    Accepts both ``OrderEvent`` and ``OrderApprovedEvent`` JSON bodies; fields
    absent on one shape are optional, and unknown fields are ignored.
    """

    model_config = ConfigDict(extra="ignore")

    event_type: str
    order_id: str
    requester_id: str
    courier_id: str | None = None
    timestamp: datetime
    reason: str | None = None
    order_name: str | None = None
    task_id: str | None = None
    reservation_id: str | None = None
