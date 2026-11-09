# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Client -> server WebSocket frames."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.schemas.payloads import UserMessageKind


class SendData(BaseModel):
    conversation_id: uuid.UUID
    client_msg_id: uuid.UUID
    kind: UserMessageKind = "text"
    body: str | None = None
    payload: dict[str, Any] | None = None
    reply_to_id: uuid.UUID | None = None


class EditData(BaseModel):
    message_id: uuid.UUID
    body: str


class DeleteData(BaseModel):
    message_id: uuid.UUID


class SeqData(BaseModel):
    conversation_id: uuid.UUID
    seq: int = Field(ge=0)


class ConversationRef(BaseModel):
    conversation_id: uuid.UUID


class SendFrame(BaseModel):
    type: Literal["send"]
    req_id: str | None = None
    data: SendData


class EditFrame(BaseModel):
    type: Literal["edit"]
    req_id: str | None = None
    data: EditData


class DeleteFrame(BaseModel):
    type: Literal["delete"]
    req_id: str | None = None
    data: DeleteData


class DeliveredFrame(BaseModel):
    type: Literal["delivered"]
    req_id: str | None = None
    data: SeqData


class ReadFrame(BaseModel):
    type: Literal["read"]
    req_id: str | None = None
    data: SeqData


class TypingFrame(BaseModel):
    type: Literal["typing"]
    req_id: str | None = None
    data: ConversationRef


class PingFrame(BaseModel):
    type: Literal["ping"]
    req_id: str | None = None


ClientFrame = Annotated[
    SendFrame | EditFrame | DeleteFrame | DeliveredFrame | ReadFrame | TypingFrame | PingFrame,
    Field(discriminator="type"),
]
