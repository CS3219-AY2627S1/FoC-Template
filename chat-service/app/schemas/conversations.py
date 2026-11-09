# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""HTTP bodies for the client API and the internal (service) API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

# Client API


class CreateDirectBody(BaseModel):
    user_id: uuid.UUID


class CreateGroupBody(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    member_ids: list[uuid.UUID] = Field(default_factory=list, max_length=255)


# Internal (service) API


class MemberSpec(BaseModel):
    user_id: uuid.UUID
    label: str | None = Field(default=None, max_length=50)


class CreateConversationBody(BaseModel):
    kind: Literal["direct", "group"] = "group"
    unique_key: str | None = Field(default=None, max_length=255)
    title: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] = Field(default_factory=dict)
    members: list[MemberSpec] = Field(default_factory=list, max_length=255)
    purge_after: datetime | None = None


class UpdateConversationBody(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] | None = None
    purge_after: datetime | None = None


class AddMemberBody(BaseModel):
    user_id: uuid.UUID
    label: str | None = Field(default=None, max_length=50)
    include_history: bool = True


class SystemMessageBody(BaseModel):
    key: Annotated[str, Field(min_length=1, max_length=100)]
    params: dict[str, Any] = Field(default_factory=dict)
