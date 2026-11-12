# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation and test assistance for Chat Service.

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from main.models import Conversation, Message, WebSocketTicket
from main.outbox import append_message_created
from main.schemas import ConversationListItem, ConversationResponse, MessageResponse


WRITABLE_STATUSES = {"ACCEPTED", "DELIVERED"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    # PostgreSQL preserves timezone awareness; SQLite test databases do not.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def is_writable(conversation: Conversation, now: datetime | None = None) -> bool:
    now = now or utc_now()
    if conversation.delivery_status == "COMPLETED":
        return (
            conversation.chat_closes_at is not None
            and as_utc(conversation.chat_closes_at) > as_utc(now)
        )
    return (
        conversation.delivery_status in WRITABLE_STATUSES
        and conversation.expires_at is not None
        and as_utc(conversation.expires_at) > as_utc(now)
        and conversation.closed_at is None
    )


def require_participant(conversation: Conversation | None, user_id: UUID) -> Conversation:
    # Use 404 for both missing and inaccessible conversations to avoid disclosing IDs.
    if conversation is None or user_id not in {conversation.requester_id, conversation.courier_id}:
        raise HTTPException(404, "Conversation not found")
    if conversation.delivery_status == "OPEN" or conversation.courier_id is None:
        raise HTTPException(404, "Conversation not found")
    return conversation


def conversation_response(conversation: Conversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        errand_id=conversation.errand_id,
        requester_id=conversation.requester_id,
        courier_id=conversation.courier_id,
        delivery_status=conversation.delivery_status,
        expires_at=conversation.expires_at,
        accepted_at=conversation.accepted_at,
        delivered_at=conversation.delivered_at,
        closed_at=conversation.closed_at,
        chat_closes_at=conversation.chat_closes_at,
        writable=is_writable(conversation),
    )


def get_conversation_for_errand(db: Session, errand_id: UUID, user_id: UUID) -> Conversation:
    conversation = db.scalar(select(Conversation).where(Conversation.errand_id == errand_id))
    return require_participant(conversation, user_id)


def get_conversation(db: Session, conversation_id: UUID, user_id: UUID) -> Conversation:
    return require_participant(db.get(Conversation, conversation_id), user_id)


def get_message(
    db: Session,
    conversation_id: UUID,
    message_id: UUID,
    user_id: UUID,
) -> Message:
    get_conversation(db, conversation_id, user_id)
    message = db.scalar(select(Message).where(
        Message.id == message_id,
        Message.conversation_id == conversation_id,
    ))
    if message is None:
        raise HTTPException(404, "Message not found")
    return message


def list_conversations(
    db: Session,
    user_id: UUID,
    limit: int,
) -> list[ConversationListItem]:
    conversations = list(db.scalars(
        select(Conversation)
        .where(
            or_(Conversation.requester_id == user_id, Conversation.courier_id == user_id),
            Conversation.courier_id.is_not(None),
            Conversation.delivery_status != "OPEN",
        )
        .order_by(Conversation.created_at.desc(), Conversation.id.desc())
        .limit(limit)
    ).all())
    if not conversations:
        return []

    latest_by_conversation: dict[UUID, Message] = {}
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id.in_([item.id for item in conversations]))
        .order_by(Message.conversation_id, Message.sequence_number.desc())
    ).all()
    for message in messages:
        latest_by_conversation.setdefault(message.conversation_id, message)

    return [ConversationListItem(
        **conversation_response(conversation).model_dump(),
        last_message=(
            MessageResponse.model_validate(latest_by_conversation[conversation.id])
            if conversation.id in latest_by_conversation else None
        ),
    ) for conversation in conversations]


def list_messages(
    db: Session,
    conversation_id: UUID,
    user_id: UUID,
    after_sequence: int | None,
    before_sequence: int | None,
    limit: int,
) -> tuple[list[Message], bool]:
    get_conversation(db, conversation_id, user_id)
    filters = [Message.conversation_id == conversation_id]
    if after_sequence is not None:
        filters.append(Message.sequence_number > after_sequence)
    if before_sequence is not None:
        filters.append(Message.sequence_number < before_sequence)

    descending = before_sequence is not None and after_sequence is None
    ordering = Message.sequence_number.desc() if descending else Message.sequence_number.asc()
    rows = db.scalars(
        select(Message).where(*filters).order_by(ordering).limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    if descending:
        rows.reverse()
    return list(rows), has_more


def save_message(
    db: Session,
    conversation_id: UUID,
    sender_id: UUID,
    client_message_id: UUID,
    content: str,
) -> tuple[Message, bool]:
    # The row lock makes sequence allocation atomic across concurrent senders.
    conversation = db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .with_for_update()
    )
    conversation = require_participant(conversation, sender_id)

    existing = db.scalar(select(Message).where(
        Message.conversation_id == conversation_id,
        Message.sender_id == sender_id,
        Message.client_message_id == client_message_id,
    ))
    if existing is not None:
        if existing.content != content:
            raise HTTPException(409, "client_message_id was already used for different content")
        return existing, False

    if not is_writable(conversation):
        if conversation.expires_at is None:
            raise HTTPException(409, "Conversation lifecycle is still synchronizing")
        raise HTTPException(409, "Conversation is read-only")

    message = Message(
        id=uuid4(),
        conversation_id=conversation.id,
        sender_id=sender_id,
        client_message_id=client_message_id,
        sequence_number=conversation.next_sequence,
        content=content,
        created_at=utc_now(),
    )
    conversation.next_sequence += 1
    db.add(message)
    db.flush()
    recipient_id = (
        conversation.courier_id
        if sender_id == conversation.requester_id
        else conversation.requester_id
    )
    append_message_created(db, conversation, message, recipient_id)
    db.flush()
    return message, True


def create_ticket(
    db: Session,
    conversation_id: UUID,
    user_id: UUID,
    ttl_seconds: int = 30,
) -> tuple[str, WebSocketTicket]:
    get_conversation(db, conversation_id, user_id)
    now = utc_now()
    db.execute(delete(WebSocketTicket).where(or_(
        WebSocketTicket.used_at.is_not(None),
        WebSocketTicket.expires_at <= now,
    )))
    raw_token = secrets.token_urlsafe(32)
    ticket = WebSocketTicket(
        id=uuid4(),
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        conversation_id=conversation_id,
        user_id=user_id,
        expires_at=now + timedelta(seconds=ttl_seconds),
    )
    db.add(ticket)
    db.flush()
    return raw_token, ticket


def consume_ticket(db: Session, raw_token: str, conversation_id: UUID) -> UUID | None:
    now = utc_now()
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    claimed = db.execute(
        update(WebSocketTicket)
        .where(
            WebSocketTicket.token_hash == token_hash,
            WebSocketTicket.conversation_id == conversation_id,
            WebSocketTicket.used_at.is_(None),
            WebSocketTicket.expires_at > now,
        )
        .values(used_at=now)
        .returning(WebSocketTicket.user_id)
    ).scalar_one_or_none()
    return claimed

