# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — define separate Pydantic client and cleaned-result types, strict trimmed text, forbidden extra fields, nested coordinate validation, daily-time parsing, and category membership checks at original entry positions.
# Scope: Writing implementation code; Refactoring and documentation improvements — share mutable-field validators between creation and PATCH, add SupplierPatch presence tracking and a separate cleaned PATCH result, and document omission versus explicit null.
# Scope: Writing implementation code; Refactoring and documentation improvements — extract shared scalar fields and add category-free seed input/result schemas using the existing location and daily-time rules.
# Scope: Writing implementation code — define separate read response models and explicit loaded-value conversion preserving nulls, ordering, coordinates, and time precision. (ai-20260930-016)
# Author review: Keith confirmed review of the creation-validation and PATCH-validation changes (ai-20260930-001; ai-20260930-002). Keith also confirmed review of the shared seed scalar validation changes (ai-20260930-006) and read response models (ai-20260930-016).
# Details: ../ai/usage-log.md; ai-20260930-001; ai-20260930-002; ai-20260930-006; ai-20260930-016

"""Shared supplier scalars, seed/API inputs, and separately typed results."""

from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING, Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, ValidationInfo,
    StrictStr, field_validator,
)
from pydantic_core import PydanticCustomError

from app.validation import APPROVED_AREAS, DomainValidationError, validate_coordinates

if TYPE_CHECKING:
    from app.repositories.suppliers import CategoryRead, SupplierPage, SupplierRead


class LocationResponse(BaseModel):
    latitude: float
    longitude: float


class CategoryResponse(BaseModel):
    id: UUID
    name: str

    @classmethod
    def from_read(cls, value: "CategoryRead") -> "CategoryResponse":
        return cls(id=value.id, name=value.name)


class SupplierResponse(BaseModel):
    """Loaded output values, independent of mutation normalization."""

    id: UUID
    name: str
    area: str
    location: LocationResponse
    categories: list[CategoryResponse]
    description: str | None
    building: str | None
    floor: str | None
    image_key: str | None
    opening_time: time | None
    closing_time: time | None
    closing_day_offset: int | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int

    @classmethod
    def from_read(cls, value: "SupplierRead") -> "SupplierResponse":
        return cls(
            id=value.id, name=value.name, area=value.area,
            location=LocationResponse(latitude=value.latitude, longitude=value.longitude),
            categories=[CategoryResponse.from_read(category) for category in value.categories],
            description=value.description, building=value.building, floor=value.floor,
            image_key=value.image_key, opening_time=value.opening_time,
            closing_time=value.closing_time, closing_day_offset=value.closing_day_offset,
            created_at=value.created_at, updated_at=value.updated_at,
            deleted_at=value.deleted_at, version=value.version,
        )


class SupplierPageResponse(BaseModel):
    items: list[SupplierResponse]
    total: int
    limit: int
    offset: int

    @classmethod
    def from_read(cls, value: "SupplierPage") -> "SupplierPageResponse":
        return cls(
            items=[SupplierResponse.from_read(item) for item in value.items],
            total=value.total, limit=value.limit, offset=value.offset,
        )


def _coordinate(value: object, *, latitude: bool) -> Decimal:
    try:
        pair = validate_coordinates(value, 0) if latitude else validate_coordinates(0, value)
    except DomainValidationError as error:
        issue = error.errors[0]
        raise PydanticCustomError(issue.code, issue.message) from error
    return pair[0 if latitude else 1]


class LocationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")

    latitude: Annotated[Decimal, BeforeValidator(lambda value: _coordinate(value, latitude=True))]
    longitude: Annotated[Decimal, BeforeValidator(lambda value: _coordinate(value, latitude=False))]


def _time_input(value: object) -> object:
    if value is not None and not isinstance(value, (str, time)):
        raise PydanticCustomError("INVALID_TIME", "Enter a time string or datetime.time value.")
    return value


def _naive_time(value: time | None) -> time | None:
    if value is not None and value.tzinfo is not None:
        raise PydanticCustomError("TIMEZONE_NOT_ALLOWED", "Daily times must not contain a timezone.")
    return value


DailyTime = Annotated[time | None, BeforeValidator(_time_input), AfterValidator(_naive_time)]


def _known_category(value: UUID, info: ValidationInfo) -> UUID:
    # Membership is caller-specific; ordinary schema parsing only validates UUIDs.
    if info.context is not None and value not in info.context["category_ids"]:
        raise PydanticCustomError("UNKNOWN_CATEGORY", "Category does not exist.")
    return value


CategoryId = Annotated[UUID, AfterValidator(_known_category)]


class SupplierScalarValues(BaseModel):
    """Shared text and schedule values, without categories or identity."""

    model_config = ConfigDict(extra="forbid", revalidate_instances="always")

    name: StrictStr
    area: StrictStr
    description: StrictStr | None = None
    building: StrictStr | None = None
    floor: StrictStr | None = None
    image_key: StrictStr | None = None
    opening_time: DailyTime = None
    closing_time: DailyTime = None

    @field_validator("name", "area")
    @classmethod
    def required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise PydanticCustomError("BLANK_TEXT", "Enter nonblank text.")
        return value

    @field_validator("area")
    @classmethod
    def approved_area(cls, value: str) -> str:
        if value not in APPROVED_AREAS:
            raise PydanticCustomError("UNKNOWN_AREA", "Select an approved area.")
        return value

    @field_validator("description", "building", "floor", "image_key")
    @classmethod
    def optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class SupplierEditableValues(SupplierScalarValues):
    """Complete mutable API values, without location or server-managed fields."""

    category_ids: list[CategoryId]

    @field_validator("category_ids")
    @classmethod
    def nonempty_categories(cls, value: list[UUID]) -> list[UUID]:
        if not value:
            raise PydanticCustomError("EMPTY_CATEGORIES", "Select at least one category.")
        return value


class SupplierSeedInput(SupplierScalarValues):
    """Scalar seed input; category names remain the importer's responsibility."""

    location: LocationInput


class SupplierSeedResult(SupplierSeedInput):
    """Checked scalar seed values with the derived daily schedule offset."""

    closing_day_offset: Literal[0, 1] | None


class _SupplierFields(SupplierEditableValues):
    location: LocationInput


class SupplierCreateInput(_SupplierFields):
    """Editable client fields only; use validate_supplier_create before saving."""


class SupplierCreateResult(_SupplierFields):
    """Cleaned creation values, including the server-derived schedule offset."""

    closing_day_offset: Literal[0, 1] | None


class SupplierPatch(SupplierEditableValues):
    """Optional presence, not optional validity: supplied required fields reject null.

    Unvalidated defaults represent omission only. Always use exclude_unset=True
    when merging; explicit null optional values must remain in the patch.
    """

    name: StrictStr = Field(default=None)
    area: StrictStr = Field(default=None)
    category_ids: list[CategoryId] = Field(default=None)


class SupplierPatchResult(SupplierEditableValues):
    """Complete checked mutable values for update service."""

    closing_day_offset: Literal[0, 1] | None
