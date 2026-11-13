# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — the notification DTO as a union discriminated by type, the params schema for each type, UTC timestamps, and the page, unread-count, and read-all responses (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""Response schemas for the notification history and read-status API.

The notification DTO is a union discriminated by ``type``, so that the OpenAPI
document shows the ``params`` schema for each notification type.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal, Union
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, TypeAdapter


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("naive datetime is not allowed")
    return value.astimezone(timezone.utc)


UtcDatetime = Annotated[datetime, AfterValidator(_to_utc)]


class OrderOpenedParams(BaseModel):
    credit_amount: int


class OrderRejectedParams(BaseModel):
    reason: str | None


class OrderAcceptedParams(BaseModel):
    pass


class OrderPickedUpParams(BaseModel):
    pass


class OrderCompletedParams(BaseModel):
    credit_amount: int


class OrderExpiredParams(BaseModel):
    pass


class OrderCancelledParams(BaseModel):
    cancelled_by_role: Literal["requester", "admin"]
    previous_status: str


class _NotificationBase(BaseModel):
    id: int
    recipient_role: Literal["requester", "courier"]
    title: str
    body: str
    order_id: UUID
    occurred_at: UtcDatetime
    created_at: UtcDatetime
    read_at: UtcDatetime | None = Field(description="null while unread")


class OrderOpenedNotification(_NotificationBase):
    type: Literal["order.opened"]
    params: OrderOpenedParams


class OrderRejectedNotification(_NotificationBase):
    type: Literal["order.rejected"]
    params: OrderRejectedParams


class OrderAcceptedNotification(_NotificationBase):
    type: Literal["order.accepted"]
    params: OrderAcceptedParams


class OrderPickedUpNotification(_NotificationBase):
    type: Literal["order.picked_up"]
    params: OrderPickedUpParams


class OrderCompletedNotification(_NotificationBase):
    type: Literal["order.completed"]
    params: OrderCompletedParams


class OrderExpiredNotification(_NotificationBase):
    type: Literal["order.expired"]
    params: OrderExpiredParams


class OrderCancelledNotification(_NotificationBase):
    type: Literal["order.cancelled"]
    params: OrderCancelledParams


NotificationDTO = Annotated[
    Union[
        OrderOpenedNotification,
        OrderRejectedNotification,
        OrderAcceptedNotification,
        OrderPickedUpNotification,
        OrderCompletedNotification,
        OrderExpiredNotification,
        OrderCancelledNotification,
    ],
    Field(discriminator="type"),
]

notification_dto_adapter: TypeAdapter[NotificationDTO] = TypeAdapter(NotificationDTO)


class NotificationPage(BaseModel):
    items: list[NotificationDTO]
    next_cursor: int | None = Field(
        description="Pass as cursor to get the next page; null on the last page"
    )


class UnreadCount(BaseModel):
    count: int


class ReadAllResult(BaseModel):
    updated: int
