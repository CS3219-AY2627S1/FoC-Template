"""Validated request and response contracts for the Credit Service."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreditAccountCreate(BaseModel):
    """Optional UUID confirmation for administrator recovery provisioning."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID | None = None


class CreditBalanceResponse(BaseModel):
    """Available, held, and total credits for one account."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    available_balance: int
    reserved_balance: int
    total_balance: int
    created_at: datetime
    updated_at: datetime


class CreditTransactionResponse(BaseModel):
    """One immutable operation from the credit audit trail."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID | None
    affected_user_id: UUID
    counterparty_user_id: UUID | None
    actor_user_id: UUID | None
    transaction_type: str
    outcome: str
    amount: int
    available_delta: int
    reserved_delta: int
    reason: str
    correlation_id: UUID
    created_at: datetime


class CreditTransactionPage(BaseModel):
    items: list[CreditTransactionResponse]
    total: int
    limit: int
    offset: int


class AdminAdjustmentRequest(BaseModel):
    """Explicit, auditable administrator correction request."""

    model_config = ConfigDict(extra="forbid")

    # Positive adds credit; negative removes it. Zero is never meaningful.
    amount: int = Field(ge=-1000, le=1000)
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("amount")
    @classmethod
    def nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("must not be zero")
        return value

    @field_validator("reason", mode="before")
    @classmethod
    def nonblank_reason(cls, value: object) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("must not be blank")
        return value.strip()
