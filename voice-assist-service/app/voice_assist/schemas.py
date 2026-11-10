# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30, 2026-10-31, 2026-11-02
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""Contracts: the caller, the provider's extraction schema and the draft response."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Principal(BaseModel):
    # User's additional profile fields are deliberately ignored, never persisted.
    model_config = ConfigDict(alias_generator=to_camel, extra="ignore", populate_by_name=True)
    user_id: UUID
    system_role: Literal["USER", "ADMIN", "SUPER_ADMIN"]
    account_status: Literal["ACTIVE"]


# --- Provider extraction schema (Structured Outputs). Every field is required and nullable so
# the model must state "not mentioned" explicitly instead of omitting a key.


SpokenDay = Literal[
    "TODAY",
    "TOMORROW",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
]


class TimePhrase(BaseModel):
    raw: str = Field(description="The exact words the requester used for this time.")
    day: SpokenDay | None = Field(
        description="Only when the requester said today, tomorrow or a weekday."
    )
    next_week: bool = Field(description="True only when 'next' was said before the weekday.")
    date: str | None = Field(
        description="MM-DD when a calendar date was said ('7th of November' is 11-07), else null."
    )
    clock: str | None = Field(
        description="HH:MM with the hour as said ('9pm' is 09:00) when a clock time was said."
    )
    meridiem: Literal["AM", "PM"] | None = Field(
        description="Only when AM or PM was said or plainly meant, never guessed."
    )
    relative_minutes: int | None = Field(
        description="Minutes from now for 'in N minutes/hours/half an hour', else null."
    )


class RewardPhrase(BaseModel):
    raw: str = Field(description="The exact words the requester used for the reward.")
    amount: float | None = Field(description="The number said, exactly as said.")
    unit: Literal["CREDITS", "CURRENCY", "UNSPECIFIED"]


ConflictField = Literal[
    "itemDescription",
    "deliveryLocation",
    "reward",
    "acceptanceDeadline",
    "deliveryDeadline",
    "supplier",
]


class FieldConflict(BaseModel):
    field: ConflictField
    reason: str


class ExtractedDraft(BaseModel):
    errand_count: int = Field(description="How many independent errands were described.")
    item_description: str | None
    delivery_location: str | None
    pickup_supplier_name: str | None
    pickup_area: str | None
    reward: RewardPhrase | None
    acceptance_time: TimePhrase | None
    delivery_time: TimePhrase | None
    conflicts: list[FieldConflict]


# --- Supplier Service views (snake_case, as Supplier publishes them).


class SupplierCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    name: str
    building_area: str
    floor: str | None = None


class SupplierDetail(SupplierCandidate):
    pickup_location_description: str
    status: Literal["ACTIVE", "INACTIVE"]


class SupplierPage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    items: list[SupplierCandidate]
    total: int


# --- API responses.


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


FieldStatus = Literal["FILLED", "MISSING", "AMBIGUOUS", "CONFLICT"]


class DraftField(ApiModel):
    value: str | int | None = None
    status: FieldStatus
    note: str | None = None
    display: str | None = None


class SupplierOption(ApiModel):
    id: UUID
    name: str
    building_area: str
    floor: str | None = None


class SupplierSuggestion(SupplierOption):
    pickup_location_description: str


class SupplierField(ApiModel):
    value: UUID | None = None
    status: FieldStatus
    note: str | None = None
    suggestion: SupplierSuggestion | None = None
    candidates: list[SupplierOption] = []


class DraftFields(ApiModel):
    item_description: DraftField
    delivery_location: DraftField
    reward: DraftField
    acceptance_deadline: DraftField
    delivery_deadline: DraftField
    supplier: SupplierField


class DraftResponse(ApiModel):
    request_id: str
    generated_at: datetime
    time_zone: Literal["Asia/Singapore"] = "Asia/Singapore"
    outcome: Literal["DRAFT", "NO_SPEECH", "NO_ERRAND", "MULTIPLE_ERRANDS"]
    transcript: str
    fields: DraftFields | None = None


class StatusResponse(ApiModel):
    available: bool
    provider: str
    max_recording_seconds: int = 60
    processing_timeout_seconds: int = 30
    retention_notice: str
