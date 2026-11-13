"""Pydantic request and response schemas for orders."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


OrderStatus = Literal[
    "PENDING_CREDIT",
    "OPEN",
    "REJECTED",
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
]


MAX_CREDIT_AMOUNT = 1000


def _stripped_text(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("must be a string")
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


class DeliveryLocation(BaseModel):
    """Delivery destination within the NUS campus."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    details: str = Field(min_length=1, max_length=500)

    @field_validator("label", "details", mode="before")
    @classmethod
    def non_blank(cls, value: object) -> str:
        return _stripped_text(value)


class OrderCreate(BaseModel):
    """Validate the fields required to create a new errand request."""

    model_config = ConfigDict(extra="forbid")

    pickup_supplier_id: UUID
    delivery: DeliveryLocation
    item_description: str = Field(min_length=1, max_length=500)
    credit_amount: int = Field(ge=1, le=MAX_CREDIT_AMOUNT)

    @field_validator("item_description", mode="before")
    @classmethod
    def non_blank(cls, value: object) -> str:
        return _stripped_text(value)


class OrderResponse(BaseModel):
    """Public representation of an errand request."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    requester_id: UUID
    courier_id: UUID | None
    pickup_supplier_id: UUID
    delivery_label: str
    delivery_latitude: float
    delivery_longitude: float
    delivery_details: str
    item_description: str
    credit_amount: int
    status: str
    rejection_reason: str | None
    accepted_at: datetime | None
    picked_up_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancelled_by: UUID | None
    expired_at: datetime | None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime


class OrderPage(BaseModel):
    """One page of orders, matching the Supplier Service list shape."""

    items: list[OrderResponse]
    total: int
    limit: int
    offset: int


class OrderActivityBucket(BaseModel):
    """Lifecycle counts for one hour, starting at ``start``."""

    start: datetime
    end: datetime
    created: int
    accepted: int
    completed: int


class OrderActivity(BaseModel):
    """Hourly order activity for administrators. The last bucket is the past hour."""

    window_start: datetime
    window_end: datetime
    bucket_minutes: int
    buckets: list[OrderActivityBucket]
