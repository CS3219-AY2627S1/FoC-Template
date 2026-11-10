# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented validation and serialization for Chat identity lookup requests and
# responses.
# Author review: I validated correctness and added boundary checks where needed.

"""Allow-listed identity DTOs; never serialize User ORM objects."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field, field_validator

from app.api.schemas import ApiModel
from app.models import AccountStatus
from app.registration.validation import normalize_username, validate_username


class ChatUserSearchQuery(ApiModel):
    username: str = Field(min_length=1, max_length=64)
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = Field(default=None, min_length=1, max_length=1024)

    @field_validator("username", mode="before")
    @classmethod
    def trim_username(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("username")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        return normalize_username(validate_username(value))


class ChatUserSummary(ApiModel):
    user_id: UUID
    username: str


class ChatUserSearchResponse(ApiModel):
    items: list[ChatUserSummary]
    next_cursor: str | None


class ChatParticipantsRequest(ApiModel):
    user_ids: list[UUID] = Field(min_length=1, max_length=100)


class ChatParticipantSummary(ApiModel):
    user_id: UUID
    display_name: str
    username: str | None
    account_status: AccountStatus


class ChatParticipantsResponse(ApiModel):
    items: list[ChatParticipantSummary]
    missing_user_ids: list[UUID]
