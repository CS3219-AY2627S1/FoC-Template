from datetime import datetime, time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, computed_field

from orders.models import (
    CaseAction,
    CreditOperation,
    CreditResult,
    RepairAction,
    ResolutionAction,
)
from orders.orm_models import CreditStatus, Status
from orders.policy import ParticipantAction, ReviewCategory

MAX_CREDITS = 9_223_372_036_854_775_807


class OrderItem(BaseModel):
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    quantity: int = Field(ge=1)


class CreateOrderRequest(BaseModel):
    supplier_id: UUID
    items: list[OrderItem] = Field(min_length=1)
    pickup_notes: str | None = None
    credits: int = Field(ge=1, le=MAX_CREDITS)


class DisputeOrderRequest(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ResolveOrderRequest(DisputeOrderRequest):
    action: ResolutionAction


class RepairSettlementRequest(DisputeOrderRequest):
    model_config = ConfigDict(extra='forbid')

    request_id: UUID
    action: RepairAction


class CommandHistoryResponse(BaseModel):
    request_id: UUID
    operation: CreditOperation
    command: dict
    result: CreditResult | None
    created_at: datetime
    published_at: datetime | None
    attempts: int
    last_error: str | None


class DisputeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    order_id: UUID
    kind: Literal["fulfilment", "financial"]
    reason: str
    opened_by: UUID | None
    created_at: datetime
    closed_at: datetime | None
    closed_by: UUID | None
    resolution: Literal["refund", "pay", "recovered"] | None
    resolution_reason: str | None
    available_actions: list[CaseAction] = Field(default_factory=list)

    @computed_field
    @property
    def status(self) -> Literal['open', 'resolved']:
        return 'resolved' if self.closed_at is not None else 'open'


class SupplierSnapshot(BaseModel):
    id: UUID
    name: str
    category: str
    building: str
    floor: int
    lattitude: float
    longitude: float
    description: str
    startingTime: time
    closingTime: time
    imageUrl: str | None


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    requester_id: UUID
    supplier_id: UUID
    supplier_snapshot: SupplierSnapshot | None
    items: list[OrderItem]
    pickup_notes: str | None
    credits: int
    status: Status
    credit_status: CreditStatus
    credit_operation: str
    disputes: list[DisputeResponse] = Field(default_factory=list)
    available_actions: list[ParticipantAction] = Field(default_factory=list)
    is_active: bool = False
    review_category: ReviewCategory = "history"
    credit_reason: str | None = None
    courier_id: UUID | None
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    progress_due_at: datetime | None
    settlement_due_at: datetime | None
    status_reason: str | None
    updated_at: datetime


class ServerClockResponse(BaseModel):
    server_time: datetime


class OrderAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: UUID
    order_id: UUID
    actor_id: UUID | None = None
    action: str
    reason: str | None = None
    created_at: datetime


class ParticipantProfile(BaseModel):
    user_id: UUID
    username: str
    email: str


class CreditDiagnostics(BaseModel):
    order_id: UUID
    accounts: list[dict]
    reservation: dict | None
    commands: list[dict]
    audit_logs: list[dict]


class OrderReviewResponse(BaseModel):
    order: OrderResponse
    diagnostics: CreditDiagnostics | None
    commands: list[CommandHistoryResponse]
    audit: list[OrderAuditLogResponse]
    people: list[ParticipantProfile]
    evidence_error: str | None