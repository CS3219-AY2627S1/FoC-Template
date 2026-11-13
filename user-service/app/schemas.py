"""Pydantic request and response schemas for user accounts."""

import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


_DISPLAY_NAME_PATTERN = re.compile(r"[A-Za-z]+(?: [A-Za-z]+)*")


def _normalize_display_name(value: object) -> str:
    """Normalize a display name and reject unsupported characters."""

    if not isinstance(value, str):
        raise ValueError("must be a string")
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    if not _DISPLAY_NAME_PATTERN.fullmatch(value):
        raise ValueError("display_name contains unsupported characters")
    return value


class UserCreate(BaseModel):
    """Validate the fields required to register a new user."""

    model_config = ConfigDict(extra="forbid")

    nus_student_number: str = Field(min_length=9, max_length=9)
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=100)

    @field_validator("nus_student_number", "display_name", mode="before")
    @classmethod
    def non_blank(cls, value: object) -> str:
        """Trim surrounding whitespace and reject blank text values."""

        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def validate_display_name(cls, value: object) -> str:
        """Normalize and validate the registration display name."""

        return _normalize_display_name(value)

    @field_validator("nus_student_number")
    @classmethod
    def student_number_format(cls, value: str) -> str:
        """Normalize and validate the NUS student number format."""

        value = value.upper()
        if not re.fullmatch(r"[AU][0-9]{7}[A-Z]", value):
            raise ValueError("must be a valid NUS student number")
        return value

    @field_validator("password")
    @classmethod
    def password_policy(cls, value: str) -> str:
        """Require a password containing letters, numbers, and symbols."""

        if not re.search(r"[A-Za-z]", value) or not re.search(r"[0-9]", value) or not re.search(
            r"[^A-Za-z0-9]", value
        ):
            raise ValueError("password must contain a letter, number, and special character")
        return value


class UserLogin(BaseModel):
    """Validate the credentials required to log in."""

    model_config = ConfigDict(extra="forbid")

    nus_student_number: str = Field(min_length=9, max_length=9)
    password: str = Field(min_length=1, max_length=100)

    @field_validator("nus_student_number", mode="before")
    @classmethod
    def normalize_student_number(cls, value: object) -> str:
        """Normalize and validate the NUS student number format."""

        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = value.strip().upper()
        if not re.fullmatch(r"[AU][0-9]{7}[A-Z]", value):
            raise ValueError("must be a valid NUS student number")
        return value


class UserUpdate(BaseModel):
    """Validate mutable fields accepted by a profile update."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=100)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        """Trim and lowercase email addresses before validation and storage."""

        if value is None:
            raise ValueError("must be a string")
        if not isinstance(value, str):
            raise ValueError("must be a string")
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value.lower()

    @field_validator("display_name", mode="before")
    @classmethod
    def normalize_display_name(cls, value: object) -> str:
        """Normalize and validate the profile display name."""

        return _normalize_display_name(value)

    @field_validator("password", mode="before")
    @classmethod
    def password_policy(cls, value: object) -> str:
        """Apply the same password policy used during registration."""

        if value is None or not isinstance(value, str):
            raise ValueError("must be a string")
        if not re.search(r"[A-Za-z]", value) or not re.search(
            r"\d", value
        ) or not re.search(r"[^A-Za-z0-9]", value):
            raise ValueError("password must contain a letter, number, and special character")
        return value


class UserResponse(BaseModel):
    """Public representation of a user account without authentication data."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nus_student_number: str
    email: EmailStr
    display_name: str
    role: str
    status: str
    created_at: datetime
    updated_at: datetime


class UserPage(BaseModel):
    """One page of accounts returned to an administrator, newest first."""

    items: list[UserResponse]
    total: int
    limit: int
    offset: int


class BasicProfileResponse(BaseModel):
    """Minimal profile representation visible to another authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    display_name: str


class InternalIdentityResponse(BaseModel):
    """Minimal active identity returned to a trusted consuming service."""

    id: UUID
    role: Literal["user", "admin"]
    status: Literal["active"]


class AdminCheckResponse(BaseModel):
    """Minimal authorization result returned to a trusted service."""

    is_admin: bool


class UserStatusResponse(BaseModel):
    """Account status returned to a trusted service."""

    status: Literal["active", "deactivated", "suspended", "unknown"]


class LoginResponse(BaseModel):
    """Public result returned after successful authentication."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserResponse
