# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented Chat event payloads for publication and consumption.
# Author review: I validated correctness and added boundary checks where needed.

from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas import StrictModel


class MessageEvent(StrictModel):
    conversationId: UUID
    messageId: UUID
    sequence: int = Field(gt=0, strict=True)


class ReadEvent(StrictModel):
    conversationId: UUID
    userId: UUID
    upToSequence: int = Field(ge=0, strict=True)


class Envelope(StrictModel):
    eventId: UUID
    eventType: Literal["chat.message.created.v1", "chat.unread.updated.v1"]
    data: dict
