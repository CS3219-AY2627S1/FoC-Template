# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented Chat request and response validation.
# Author review: I validated correctness and added boundary checks where needed.

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateConversation(StrictModel):
    recipientUserId: UUID


class PageQuery(StrictModel):
    limit: int = Field(default=20, ge=1, le=50)
    cursor: UUID | None = None


class SearchQuery(StrictModel):
    username: str = Field(min_length=1, max_length=64)
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=2048)


class HistoryQuery(StrictModel):
    limit: int = Field(default=50, ge=1, le=50)
    beforeSequence: int | None = Field(default=None, ge=1)
    afterSequence: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def mutually_exclusive(self):
        if self.beforeSequence is not None and self.afterSequence is not None:
            raise ValueError("Choose one sequence boundary.")
        return self


class Read(StrictModel):
    upToSequence: int = Field(ge=0, strict=True)


class Authenticate(StrictModel):
    type: Literal["authenticate"]
    accessToken: str = Field(min_length=1, max_length=8192, repr=False)


class Command(StrictModel):
    requestId: UUID


class Send(Command):
    type: Literal["message.send"]
    conversationId: UUID
    clientMessageId: UUID
    text: str

    @field_validator("text")
    @classmethod
    def validate_raw_text(cls, value):
        # Python len counts Unicode code points, before any outer whitespace is removed.
        if (
            len(value) > 4096
            or not value.strip()
            or "\x00" in value
            or any(0xD800 <= ord(c) <= 0xDFFF for c in value)
        ):
            raise ValueError("Text must contain 1–4096 valid Unicode code points.")
        return value.strip()


class ReadCommand(Command, Read):
    type: Literal["conversation.read"]
    conversationId: UUID


class Ping(Command):
    type: Literal["ping"]
