# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation, debugging, and test assistance for Chat Service endpoints.

import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from main.auth import authenticated_user_id
from main.chat import (
    consume_ticket,
    conversation_response,
    create_ticket,
    get_conversation,
    get_conversation_for_errand,
    get_message,
    list_conversations,
    list_messages,
    save_message,
)
from main.connections import manager
from main.database import SessionLocal, get_db
from main.models import Conversation
from main.schemas import (
    ConversationResponse,
    ConversationPage,
    MessagePage,
    MessageResponse,
    PendingConversationResponse,
    SendMessageRequest,
    TicketResponse,
    WebSocketSendFrame,
)


router = APIRouter()
TICKET_TTL_SECONDS = int(os.getenv("CHAT_WS_TICKET_TTL_SECONDS", "30"))
ALLOWED_WEBSOCKET_ORIGINS = {
    origin.strip()
    for origin in os.getenv("CHAT_CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
}


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get(
    "/conversations",
    response_model=ConversationPage,
)
def conversations_for_user(
    limit: int = Query(default=50, ge=1, le=100),
    user_id: UUID = Depends(authenticated_user_id),
    db: Session = Depends(get_db),
) -> ConversationPage:
    return ConversationPage(items=list_conversations(db, user_id, limit))


@router.get(
    "/conversations/by-errand/{errand_id}",
    response_model=ConversationResponse | PendingConversationResponse,
)
def conversation_for_errand(
    errand_id: UUID,
    response: Response,
    user_id: UUID = Depends(authenticated_user_id),
    db: Session = Depends(get_db),
) -> ConversationResponse | PendingConversationResponse:
    # A generic pending response avoids disclosing whether an errand exists while
    # allowing the UI to handle Kafka propagation delay after acceptance.
    conversation = db.scalar(select(Conversation).where(Conversation.errand_id == errand_id))
    if conversation is None or conversation.delivery_status == "OPEN":
        response.status_code = 202
        return PendingConversationResponse()
    return conversation_response(get_conversation_for_errand(db, errand_id, user_id))


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def conversation_by_id(
    conversation_id: UUID,
    user_id: UUID = Depends(authenticated_user_id),
    db: Session = Depends(get_db),
) -> ConversationResponse:
    return conversation_response(get_conversation(db, conversation_id, user_id))


@router.get(
    "/conversations/{conversation_id}/messages/{message_id}",
    response_model=MessageResponse,
)
def message_by_id(
    conversation_id: UUID,
    message_id: UUID,
    user_id: UUID = Depends(authenticated_user_id),
    db: Session = Depends(get_db),
) -> MessageResponse:
    return MessageResponse.model_validate(
        get_message(db, conversation_id, message_id, user_id),
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessagePage,
)
def message_history(
    conversation_id: UUID,
    after_sequence: int | None = Query(default=None, ge=0),
    before_sequence: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    user_id: UUID = Depends(authenticated_user_id),
    db: Session = Depends(get_db),
) -> MessagePage:
    if after_sequence is not None and before_sequence is not None:
        raise HTTPException(422, "Use either after_sequence or before_sequence, not both")
    messages, has_more = list_messages(
        db, conversation_id, user_id, after_sequence, before_sequence, limit,
    )
    return MessagePage(
        items=[MessageResponse.model_validate(message) for message in messages],
        has_more=has_more,
    )


def persist_message(
    conversation_id: UUID,
    user_id: UUID,
    request: SendMessageRequest | WebSocketSendFrame,
):
    with SessionLocal.begin() as db:
        message, created = save_message(
            db,
            conversation_id,
            user_id,
            request.client_message_id,
            request.content,
        )
        response = MessageResponse.model_validate(message)
    return response, created


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
)
async def send_message(
    conversation_id: UUID,
    request: SendMessageRequest,
    user_id: UUID = Depends(authenticated_user_id),
) -> MessageResponse:
    response, created = await run_in_threadpool(
        persist_message, conversation_id, user_id, request,
    )
    if created:
        await manager.broadcast(conversation_id, {
            "type": "message_created",
            "message": response.model_dump(mode="json"),
        })
    return response


@router.post(
    "/conversations/{conversation_id}/ws-ticket",
    response_model=TicketResponse,
)
def websocket_ticket(
    conversation_id: UUID,
    user_id: UUID = Depends(authenticated_user_id),
) -> TicketResponse:
    with SessionLocal.begin() as db:
        raw_token, ticket = create_ticket(
            db, conversation_id, user_id, TICKET_TTL_SECONDS,
        )
        expires_at = ticket.expires_at
    return TicketResponse(ticket=raw_token, expires_at=expires_at)


def claim_ticket(raw_ticket: str, conversation_id: UUID) -> UUID | None:
    with SessionLocal.begin() as db:
        return consume_ticket(db, raw_ticket, conversation_id)


@router.websocket("/conversations/{conversation_id}/ws")
async def chat_websocket(
    websocket: WebSocket,
    conversation_id: UUID,
    ticket: str = Query(min_length=20),
) -> None:
    origin = websocket.headers.get("origin")
    if origin not in ALLOWED_WEBSOCKET_ORIGINS:
        await websocket.close(code=4403, reason="WebSocket origin is not allowed")
        return
    user_id = await run_in_threadpool(claim_ticket, ticket, conversation_id)
    if user_id is None:
        await websocket.close(code=4401, reason="Invalid or expired WebSocket ticket")
        return

    await manager.connect(conversation_id, websocket)
    await websocket.send_json({"type": "connected", "conversationId": str(conversation_id)})
    try:
        while True:
            raw = await websocket.receive_json()
            try:
                frame = WebSocketSendFrame.model_validate(raw)
                response, created = await run_in_threadpool(
                    persist_message, conversation_id, user_id, frame,
                )
            except ValidationError as exc:
                await websocket.send_json({
                    "type": "error",
                    "code": "INVALID_MESSAGE",
                    "detail": exc.errors(include_url=False),
                })
                continue
            except HTTPException as exc:
                await websocket.send_json({
                    "type": "error",
                    "code": "MESSAGE_REJECTED",
                    "detail": exc.detail,
                })
                continue

            if created:
                await manager.broadcast(conversation_id, {
                    "type": "message_created",
                    "message": response.model_dump(mode="json"),
                })
            else:
                await websocket.send_json({
                    "type": "message_acknowledged",
                    "message": response.model_dump(mode="json"),
                })
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(conversation_id, websocket)

