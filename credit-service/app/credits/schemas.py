# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-28
# Scope: Implemented HTTP and event payload schemas; added admin settlement and analytics
# schemas.
# Author review: I validated correctness and supplied additional boundary checks.

"""Versioned HTTP schemas and consumed event payloads (camelCase on the wire)."""

from collections.abc import Mapping
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, model_validator
from pydantic.alias_generators import to_camel

ReservationState = Literal["RESERVED", "RELEASED", "TRANSFERRED", "CLOSED"]
TransactionType = Literal["ALLOCATION", "RESERVATION", "RELEASE", "TRANSFER"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid", populate_by_name=True)


class ReservationRequest(ApiModel):
    operation_id: UUID
    requester_id: UUID
    amount: StrictInt = Field(gt=0, le=2_147_483_647)


class ReservationView(ApiModel):
    # Exactly the six fields Order's client accepts (it forbids extras).
    operation_id: UUID
    order_id: UUID
    requester_id: UUID
    amount: int
    reservation_id: UUID | None
    state: ReservationState


def reservation_view(row: Mapping) -> ReservationView:
    return ReservationView(
        operation_id=row["operation_id"],
        order_id=row["order_id"],
        requester_id=row["requester_id"],
        amount=row["amount"],
        reservation_id=row["reservation_id"],
        state=row["state"],
    )


class WalletView(ApiModel):
    user_id: UUID
    available: int
    reserved: int
    total: int
    updated_at: datetime


class TransactionView(ApiModel):
    transaction_id: UUID
    type: TransactionType
    amount: int
    wallet_user_id: UUID
    counterparty_user_id: UUID | None
    order_id: UUID | None
    created_at: datetime


class SettlementView(ApiModel):
    # Credit-side outcome only; the dashboard shows it separately from the errand's state.
    order_id: UUID
    state: ReservationState
    amount: int
    updated_at: datetime


class AnalyticsQuery(ApiModel):
    # Inclusive Asia/Singapore calendar days, matching Order's analytics periods.
    start: date = Field(alias="from")
    end: date = Field(alias="to")

    @model_validator(mode="after")
    def bounded_range(self):
        if self.start > self.end:
            raise ValueError("from must not be later than to")
        if (self.end - self.start).days >= 366:
            raise ValueError("Select at most 366 days")
        return self


class Circulation(ApiModel):
    available: int
    reserved: int
    total: int


class TransferTotals(ApiModel):
    count: int
    amount: int


class CreditAnalytics(ApiModel):
    start: date = Field(alias="from")
    end: date = Field(alias="to")
    time_zone: Literal["Asia/Singapore"]
    generated_at: datetime
    circulation: Circulation  # current balances, not limited to the period
    transfers: TransferTotals  # committed during the period


class PageQuery(ApiModel):
    page: int = Field(default=1, ge=1, le=1_000_000)
    page_size: int = Field(default=20, ge=1, le=50)


class Page[T](ApiModel):
    items: list[T]
    page: int
    page_size: int
    total: int


class Principal(BaseModel):
    # User's additional profile fields are deliberately ignored, never persisted.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", populate_by_name=True)
    user_id: UUID
    system_role: Literal["USER", "ADMIN", "SUPER_ADMIN"]
    account_status: Literal["ACTIVE"]


class UserRegistered(ApiModel):
    event_id: UUID
    event_type: Literal["user.registered.v1"]
    user_id: UUID
    occurred_at: AwareDatetime


class OrderTerminal(ApiModel):
    event_id: UUID
    event_type: Literal[
        "order.completed.v1", "order.cancelled.v1", "order.expired.v1", "order.failed.v1"
    ]
    order_id: UUID
    reservation_id: UUID
    occurred_at: AwareDatetime
    requester_id: UUID | None = None
    courier_id: UUID | None = None
    amount: StrictInt | None = Field(default=None, gt=0)

    @property
    def is_completion(self) -> bool:
        return self.event_type == "order.completed.v1"

    @model_validator(mode="after")
    def completion_identity(self):
        transfer = (self.requester_id, self.courier_id, self.amount)
        if self.is_completion:
            if None in transfer or self.requester_id == self.courier_id:
                raise ValueError("Completion requires distinct participants and an amount")
        elif any(value is not None for value in transfer):
            raise ValueError("Release events carry no transfer identity")
        return self
