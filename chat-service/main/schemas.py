# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-09
# Scope: Implementation and test assistance for Chat Service API schemas.

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing import Annotated


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    errand_id: UUID
    requester_id: UUID
    courier_id: UUID
    delivery_status: str
    expires_at: datetime | None
    accepted_at: datetime | None
    delivered_at: datetime | None
    closed_at: datetime | None
    chat_closes_at: datetime | None
    writable: bool


class PendingConversationResponse(BaseModel):
    status: str = "PENDING"
    message: str = "The delivery conversation is being prepared."


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    client_message_id: UUID
    sequence_number: int
    content: str
    created_at: datetime


MessageContent = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_message_id: UUID
    content: MessageContent


class MessagePage(BaseModel):
    items: list[MessageResponse]
    has_more: bool


class ConversationListItem(ConversationResponse):
    last_message: MessageResponse | None


class ConversationPage(BaseModel):
    items: list[ConversationListItem]


class TicketResponse(BaseModel):
    ticket: str
    expires_at: datetime


class WebSocketSendFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(pattern="^send_message$")
    client_message_id: UUID
    content: MessageContent

