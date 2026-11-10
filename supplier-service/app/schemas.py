# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated Supplier input validation and response serialization; applied lint fixes.
# Author review: I validated correctness, and added boundary checks.

"""Supplier creation, update, and removal models."""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

TIME_PATTERN = re.compile(r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")


class SupplierCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    categories: list[str] = Field(min_length=1)
    building_area: str
    pickup_location_description: str
    floor: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False, strict=True)
    opening_time: str | None = None
    closing_time: str | None = None
    image_url: HttpUrl | None = None
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"

    @field_validator("name", "building_area", "pickup_location_description")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()

    @field_validator("floor")
    @classmethod
    def clean_floor(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("categories")
    @classmethod
    def distinct_categories(cls, value: list[str]) -> list[str]:
        if any(not code or not re.fullmatch(r"[A-Z][A-Z0-9_]*", code) for code in value):
            raise ValueError("Use supported category codes")
        if len(value) != len(set(value)):
            raise ValueError("Do not repeat a category")
        return value

    @field_validator("opening_time", "closing_time")
    @classmethod
    def exact_time(cls, value: str | None) -> str | None:
        if value is not None and not TIME_PATTERN.fullmatch(value):
            raise ValueError("Use 24-hour HH:mm")
        return value

    @model_validator(mode="after")
    def paired_fields(self) -> "SupplierCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        if (self.opening_time is None) != (self.closing_time is None):
            raise ValueError("opening_time and closing_time must be supplied together")
        return self


class SupplierPatch(BaseModel):
    """Only supplied fields are changed; the repository validates the merged row."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    categories: list[str] | None = None
    building_area: str | None = None
    pickup_location_description: str | None = None
    floor: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False, strict=True)
    opening_time: str | None = None
    closing_time: str | None = None
    image_url: HttpUrl | None = None
    status: Literal["ACTIVE", "INACTIVE"] | None = None

    @model_validator(mode="after")
    def require_change(self) -> "SupplierPatch":
        if not self.model_fields_set:
            raise ValueError("At least one supplier field must be supplied")
        return self


class SupplierResponse(BaseModel):
    id: UUID
    name: str
    categories: list[str]
    building_area: str
    pickup_location_description: str
    floor: str | None
    latitude: float | None
    longitude: float | None
    opening_time: str | None
    closing_time: str | None
    image_url: str | None
    status: Literal["ACTIVE", "INACTIVE"]
    created_at: datetime
    updated_at: datetime


class SupplierRemovalResponse(BaseModel):
    id: UUID
    outcome: Literal["DEACTIVATED"]


class CategoryResponse(BaseModel):
    code: str
    display_name: str


@dataclass(frozen=True)
class SupplierListFilters:
    q: str | None
    categories: list[str]
    sort: Literal["asc", "desc"]
    page: int
    page_size: int


class SupplierListItem(BaseModel):
    id: UUID
    name: str
    categories: list[str]
    building_area: str
    floor: str | None
    status: Literal["ACTIVE", "INACTIVE"]
    opening_time: str | None
    closing_time: str | None


class SupplierListResponse(BaseModel):
    items: list[SupplierListItem]
    page: int
    page_size: int
    total: int
