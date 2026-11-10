# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented Order request/response validation for participant operations.
# Author review: I validated correctness and added boundary checks where needed.

"""Versioned public schemas and typed dependency responses."""

from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid")


# N2F3: the problem a reporter selects; an accepted dispute records it as the failure reason.
FailureReason = Literal[
    "ITEM_UNAVAILABLE",
    "ITEM_DAMAGED",
    "UNABLE_TO_PICK_UP",
    "UNABLE_TO_DELIVER",
    "PARTICIPANT_UNREACHABLE",
    "OTHER",
]
# Legacy errands failed by an administrator before disputed errands keep ADMIN_DECISION.
RecordedFailureReason = FailureReason | Literal["ADMIN_DECISION"]
DisputeActor = Literal["USER", "ADMIN"]


class OpenDispute(ApiModel):
    # Admin Service names the dispute it is recording and whether a participant or an
    # administrator raised it; Order still checks that actor from the forwarded session.
    dispute_id: UUID
    actor_type: DisputeActor


class RestoreDispute(ApiModel):
    # USER: the reporter withdrew the dispute. ADMIN: an administrator rejected it.
    actor_type: DisputeActor


class AcceptDispute(ApiModel):
    reason: FailureReason
    details: str | None = Field(default=None, min_length=1, max_length=500)

    @field_validator("details", mode="before")
    @classmethod
    def trim_details(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def explain_other(self):
        if self.reason == "OTHER" and not self.details:
            raise ValueError("Provide details when selecting Other")
        return self


class CreateOrder(ApiModel):
    supplier_id: UUID
    item_description: str = Field(min_length=1, max_length=1000)
    delivery_location: str = Field(min_length=1, max_length=300)
    reward: StrictInt = Field(gt=0, le=2_147_483_647)
    acceptance_deadline: AwareDatetime
    delivery_deadline: AwareDatetime

    @field_validator("item_description", "delivery_location", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("acceptance_deadline", "delivery_deadline", mode="before")
    @classmethod
    def require_iso_time(cls, value):
        if not isinstance(value, str):
            raise ValueError("Use an ISO 8601 timestamp with a timezone offset")
        return value

    @field_validator("acceptance_deadline", "delivery_deadline")
    @classmethod
    def utc_time(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def deadline_order(self):
        if self.delivery_deadline <= self.acceptance_deadline:
            raise ValueError("Delivery deadline must be later than acceptance deadline")
        return self


OrderState = Literal[
    "OPEN",
    "ACCEPTED",
    "PICKED_UP",
    "DELIVERED",
    "DISPUTED",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
]


class PageQuery(ApiModel):
    page: int = Field(default=1, ge=1, le=1_000_000)
    page_size: int = Field(default=20, ge=1, le=50)


class OpenQuery(PageQuery):
    supplier_id: UUID | None = None


class OwnQuery(PageQuery):
    relationship: Literal["requester", "courier"]


class AdminQuery(PageQuery):
    # N2F2.2: every filter is optional and all supplied filters apply together.
    requester_id: UUID | None = None
    order_id: UUID | None = None
    participant_id: UUID | None = None
    state: list[OrderState] | None = None
    supplier_id: UUID | None = None
    created_from: date | None = None
    created_to: date | None = None
    overdue: bool | None = None

    @model_validator(mode="after")
    def creation_range(self):
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("createdFrom must not be later than createdTo")
        return self


class AnalyticsQuery(ApiModel):
    # Asia/Singapore calendar days; both ends are included.
    start: date = Field(alias="from")
    end: date = Field(alias="to")

    @model_validator(mode="after")
    def bounded_range(self):
        if self.start > self.end:
            raise ValueError("from must not be later than to")
        if (self.end - self.start).days >= 366:
            raise ValueError("Select at most 366 days")
        return self


class Principal(BaseModel):
    # User's additional profile fields are deliberately ignored, never persisted.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore")
    user_id: UUID
    system_role: Literal["USER", "ADMIN", "SUPER_ADMIN"]
    account_status: Literal["ACTIVE"]


class SupplierSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    name: str = Field(min_length=1)
    building_area: str = Field(min_length=1)
    pickup_location_description: str = Field(min_length=1)
    floor: str | None
    latitude: float | None = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(ge=-180, le=180, allow_inf_nan=False)
    updated_at: AwareDatetime
    status: Literal["ACTIVE"]

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Coordinates must be paired")
        return self

    def snapshot(self) -> dict:
        values = self.model_dump(mode="json", exclude={"id", "status"})
        return {to_camel(key): value for key, value in values.items()}


class Reservation(ApiModel):
    operation_id: UUID
    order_id: UUID
    requester_id: UUID
    amount: StrictInt = Field(gt=0)
    reservation_id: UUID | None
    state: Literal["RESERVED", "RELEASED", "TRANSFERRED", "CLOSED"]

    @model_validator(mode="after")
    def require_reservation(self):
        if self.state != "CLOSED" and self.reservation_id is None:
            raise ValueError("Reservation identity required")
        return self


class Pickup(ApiModel):
    name: str
    building_area: str
    pickup_location_description: str
    floor: str | None
    latitude: float | None
    longitude: float | None
    updated_at: AwareDatetime


class OrderAssessment(ApiModel):
    order_id: UUID
    supplier_id: UUID
    pickup: Pickup
    item_description: str
    delivery_location: str
    reward: int
    state: OrderState
    acceptance_deadline: AwareDatetime
    delivery_deadline: AwareDatetime
    created_at: AwareDatetime


class OrderParticipant(OrderAssessment):
    requester_id: UUID
    courier_id: UUID | None
    updated_at: AwareDatetime
    accepted_at: AwareDatetime | None = None
    cancelled_at: AwareDatetime | None = None
    expired_at: AwareDatetime | None = None
    picked_up_at: AwareDatetime | None = None
    delivered_at: AwareDatetime | None = None
    completed_at: AwareDatetime | None = None
    overdue_at: AwareDatetime | None = None
    failed_at: AwareDatetime | None = None
    failed_by: UUID | None = None
    failure_reason: RecordedFailureReason | None = None
    failure_details: str | None = None
    # Participants learn that an administrator decided the outcome, never which one.
    decided_by_administrator: bool = False
    decision_dispute_id: UUID | None = None
    decided_by: UUID | None = None
    # N2F3: the open dispute holding the errand and the state it returns to if withdrawn or
    # rejected.
    dispute_id: UUID | None = None
    disputed_from_state: Literal["ACCEPTED", "PICKED_UP", "DELIVERED"] | None = None
    disputed_at: AwareDatetime | None = None


class CreationResponse(ApiModel):
    operation_id: UUID
    stage: Literal[
        "VALIDATED", "RESERVATION_UNKNOWN", "READY_TO_FINALIZE", "SUCCEEDED", "ABORTING", "ABORTED"
    ]
    status_url: str
    retry_creation: bool
    error_code: str | None
    order_id: UUID | None = None


class HistoryEntry(ApiModel):
    sequence: int
    previous_state: OrderState | None
    new_state: OrderState
    actor_id: UUID | None
    actor_type: Literal["USER", "SYSTEM", "ADMIN"]
    occurred_at: AwareDatetime
    failure_reason: RecordedFailureReason | None = None
    failure_details: str | None = None
    dispute_id: UUID | None = None


class Page[T](ApiModel):
    items: list[T]
    page: int
    page_size: int
    total: int


class ErrandRates(ApiModel):
    # Share of errands created in the period now in each state; None (N/A) when none exist.
    completed: float | None
    cancelled: float | None
    expired: float | None
    failed: float | None


class DailyCreated(ApiModel):
    day: date
    created: int


class Participants(ApiModel):
    requesters: int
    couriers: int
    distinct_participants: int


class SupplierActivity(ApiModel):
    supplier_id: UUID
    supplier_name: str
    created: int
    completed: int
    mean_completion_minutes: float | None


class AnalyticsPeriod(ApiModel):
    start: date = Field(alias="from")
    end: date = Field(alias="to")
    time_zone: Literal["Asia/Singapore"]
    generated_at: AwareDatetime


class OrderAnalytics(AnalyticsPeriod):
    total_created: int
    by_state: dict[OrderState, int]
    rates: ErrandRates
    daily: list[DailyCreated]
    participants: Participants
    mean_completion_minutes: float | None
    suppliers: list[SupplierActivity]


class RoleActivity(ApiModel):
    total: int
    by_state: dict[OrderState, int]


class UserOrderAnalytics(AnalyticsPeriod):
    user_id: UUID
    as_requester: RoleActivity
    as_courier: RoleActivity
