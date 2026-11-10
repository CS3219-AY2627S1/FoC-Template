# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-22, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Implemented and updated validation for registration, sessions, profiles,
# authorization, and admin operations.
# Author review: I validated correctness and added boundary checks where needed.

"""Strict public DTOs for registration, authentication, and self profiles."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import AccountStatus, SystemRole
from app.registration.validation import (
    validate_email,
    validate_otp,
    validate_password,
    validate_profile_name,
    validate_username,
)


def to_camel(value: str) -> str:
    """Expose the documented camelCase JSON contract."""

    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    """Reject unrecognised client fields, including protected identity fields."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class RegistrationRequest(ApiModel):
    username: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    display_name: str | None = Field(default=None, max_length=64)

    @field_validator("username")
    @classmethod
    def validate_requested_username(cls, value: str) -> str:
        return validate_username(value)

    @field_validator("email")
    @classmethod
    def validate_requested_email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def validate_requested_password(cls, value: str) -> str:
        return validate_password(value)

    @field_validator("display_name")
    @classmethod
    def validate_requested_display_name(cls, value: str | None) -> str | None:
        return None if value is None else validate_profile_name(value)

    @model_validator(mode="after")
    def default_display_name_to_username(self) -> RegistrationRequest:
        if self.display_name is None:
            self.display_name = self.username
        return self


class EmailVerificationRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    otp: str = Field(min_length=1, max_length=12)

    @field_validator("email")
    @classmethod
    def validate_requested_email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("otp")
    @classmethod
    def validate_requested_otp(cls, value: str) -> str:
        return validate_otp(value)


class EmailResendRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_requested_email(cls, value: str) -> str:
        return validate_email(value)


class VerificationPendingResponse(ApiModel):
    status: Literal["verification_pending"] = "verification_pending"
    email: str
    expires_at: datetime


class AccountActivatedResponse(ApiModel):
    status: Literal["active"] = "active"
    user_id: UUID
    username: str
    email: str
    display_name: str
    system_role: Literal["USER"] = "USER"
    email_verified_at: datetime


class SessionCreateRequest(ApiModel):
    """Credential payload deliberately kept generic to avoid account enumeration."""

    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class AccessSessionResponse(ApiModel):
    """Public token response; the opaque refresh token is cookie-only."""

    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: datetime


class CurrentUserResponse(ApiModel):
    """Only the authenticated caller's safe identity."""

    user_id: UUID
    username: str
    email: str
    display_name: str
    system_role: SystemRole
    account_status: AccountStatus


class ProfileUpdateRequest(ApiModel):
    """The only mutable fields on a caller's own identity profile."""

    display_name: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("display_name")
    @classmethod
    def validate_updated_display_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Display name must not be null.")
        return validate_profile_name(value)

    @model_validator(mode="after")
    def require_a_mutable_field(self) -> ProfileUpdateRequest:
        if not self.model_fields_set:
            raise ValueError("Supply displayName.")
        return self


class PasswordChangeRequest(ApiModel):
    """A current-password-verified replacement credential for the caller."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_replacement_password(cls, value: str) -> str:
        return validate_password(value)


class AccountDeletionRequest(ApiModel):
    """Explicit self-deletion confirmation; no protected profile fields are accepted."""

    current_password: str = Field(min_length=1, max_length=128)
    acknowledge_deletion: Literal[True]


class AdminUserLookupRequest(ApiModel):
    """One exact, normalized administrative account lookup criterion."""

    username: str | None = Field(default=None, min_length=1, max_length=64)
    email: str | None = Field(default=None, min_length=3, max_length=254)

    @field_validator("username")
    @classmethod
    def validate_lookup_username(cls, value: str | None) -> str | None:
        return None if value is None else validate_username(value)

    @field_validator("email")
    @classmethod
    def validate_lookup_email(cls, value: str | None) -> str | None:
        return None if value is None else validate_email(value)

    @model_validator(mode="after")
    def require_exactly_one_identity(self) -> AdminUserLookupRequest:
        if (self.username is None) == (self.email is None):
            raise ValueError("Supply exactly one of username or email.")
        return self


class AdminAccountSummary(ApiModel):
    """The minimal identity fields in the Super Admin-only administrator list."""

    user_id: UUID
    username: str
    email: str
    system_role: Literal[SystemRole.ADMIN, SystemRole.SUPER_ADMIN]


class AdminUserLookupResponse(ApiModel):
    """The safe identity details available to authorised administrators."""

    user_id: UUID
    username: str
    display_name: str
    email: str
    email_verified: bool
    account_status: AccountStatus
    system_role: SystemRole
    created_at: datetime


class SystemRoleUpdateRequest(ApiModel):
    """The strictly limited role choice available to a current Super Admin."""

    system_role: SystemRole


class SystemRoleUpdateResponse(ApiModel):
    """Safe confirmation of an atomic target-role transition."""

    user_id: UUID
    system_role: SystemRole
    role_version: int


class SupplierManagementAction(StrEnum):
    """The narrow administrative actions Supplier Service may ask about."""

    CREATE = "SUPPLIER_CREATE"
    UPDATE = "SUPPLIER_UPDATE"
    DEACTIVATE = "SUPPLIER_DEACTIVATE"


class AuthorizationDecisionRequest(ApiModel):
    """A Supplier Service request for an immediate, current-role decision."""

    action: SupplierManagementAction


class AuthorizationDecisionResponse(ApiModel):
    """Safe current-state information for a Supplier Service enforcement point."""

    subject_id: UUID
    account_status: AccountStatus
    system_role: SystemRole
    allowed: bool
