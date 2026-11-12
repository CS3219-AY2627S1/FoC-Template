# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-09
# Scope: Generated and refined Chat Service tests.

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from main.chat import consume_ticket, create_ticket, get_message, list_conversations, list_messages, save_message
from main.models import Conversation, Message, OutboxEvent


def test_messages_receive_per_conversation_sequence_numbers(factory, active_conversation):
    conversation, requester_id, courier_id = active_conversation
    with factory.begin() as db:
        first, first_created = save_message(
            db, conversation.id, requester_id, uuid4(), "First",
        )
    with factory.begin() as db:
        second, second_created = save_message(
            db, conversation.id, courier_id, uuid4(), "Second",
        )

    assert first_created and second_created
    assert (first.sequence_number, second.sequence_number) == (1, 2)
    with factory() as db:
        assert db.get(Conversation, conversation.id).next_sequence == 3
        events = sorted(
            db.scalars(select(OutboxEvent)).all(),
            key=lambda event: event.payload["sequenceNumber"],
        )
        assert [event.type for event in events] == ["chat.message.created"] * 2
        assert events[0].payload["recipientId"] == str(courier_id)
        assert events[1].payload["recipientId"] == str(requester_id)


def test_retry_returns_original_message_without_consuming_sequence(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    client_message_id = uuid4()
    with factory.begin() as db:
        original, created = save_message(
            db, conversation.id, requester_id, client_message_id, "On my way",
        )
    with factory.begin() as db:
        retried, retry_created = save_message(
            db, conversation.id, requester_id, client_message_id, "On my way",
        )

    assert created is True
    assert retry_created is False
    assert retried.id == original.id
    with factory() as db:
        assert len(db.scalars(select(Message)).all()) == 1
        assert len(db.scalars(select(OutboxEvent)).all()) == 1
        assert db.get(Conversation, conversation.id).next_sequence == 2


def test_reusing_client_id_for_different_content_is_rejected(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    client_message_id = uuid4()
    with factory.begin() as db:
        save_message(db, conversation.id, requester_id, client_message_id, "original")
    with factory.begin() as db:
        with pytest.raises(HTTPException) as error:
            save_message(db, conversation.id, requester_id, client_message_id, "changed")
        assert error.value.status_code == 409


def test_history_uses_sequence_cursor(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    for content in ("one", "two", "three"):
        with factory.begin() as db:
            save_message(db, conversation.id, requester_id, uuid4(), content)

    with factory() as db:
        rows, has_more = list_messages(
            db, conversation.id, requester_id, after_sequence=1,
            before_sequence=None, limit=1,
        )
    assert [row.sequence_number for row in rows] == [2]
    assert has_more is True


def test_non_participant_cannot_read_or_send(factory, active_conversation):
    conversation, _, _ = active_conversation
    stranger = uuid4()
    with factory() as db:
        with pytest.raises(HTTPException) as read_error:
            list_messages(db, conversation.id, stranger, None, None, 50)
        assert read_error.value.status_code == 404
    with factory.begin() as db:
        with pytest.raises(HTTPException) as send_error:
            save_message(db, conversation.id, stranger, uuid4(), "hello")
        assert send_error.value.status_code == 404


def test_message_can_be_retrieved_by_id_only_by_participants(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    with factory.begin() as db:
        saved, _ = save_message(db, conversation.id, requester_id, uuid4(), "preview me")

    with factory() as db:
        retrieved = get_message(db, conversation.id, saved.id, requester_id)
        assert retrieved.id == saved.id
        assert retrieved.content == "preview me"
        with pytest.raises(HTTPException) as inaccessible:
            get_message(db, conversation.id, saved.id, uuid4())
        assert inaccessible.value.status_code == 404


def test_user_conversation_list_contains_latest_message(factory, active_conversation):
    conversation, requester_id, courier_id = active_conversation
    with factory.begin() as db:
        save_message(db, conversation.id, requester_id, uuid4(), "first")
        latest, _ = save_message(db, conversation.id, courier_id, uuid4(), "latest")

    with factory() as db:
        requester_items = list_conversations(db, requester_id, 50)
        assert [item.id for item in requester_items] == [conversation.id]
        assert requester_items[0].last_message.id == latest.id
        assert list_conversations(db, uuid4(), 50) == []


def test_failed_conversation_is_read_only(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    with factory.begin() as db:
        stored = db.get(Conversation, conversation.id)
        stored.delivery_status = "FAILED"
        stored.closed_at = datetime.now(timezone.utc)
    with factory.begin() as db:
        with pytest.raises(HTTPException) as error:
            save_message(db, conversation.id, requester_id, uuid4(), "late")
        assert error.value.status_code == 409


def test_completed_conversation_is_writable_during_grace_period(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    with factory.begin() as db:
        stored = db.get(Conversation, conversation.id)
        stored.delivery_status = "COMPLETED"
        stored.closed_at = datetime.now(timezone.utc)
        stored.chat_closes_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    with factory.begin() as db:
        message, created = save_message(
            db, conversation.id, requester_id, uuid4(), "Thanks!",
        )
        assert created is True
        assert message.sequence_number == 1


def test_completed_conversation_is_read_only_after_grace_period(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    with factory.begin() as db:
        stored = db.get(Conversation, conversation.id)
        stored.delivery_status = "COMPLETED"
        stored.closed_at = datetime.now(timezone.utc) - timedelta(minutes=31)
        stored.chat_closes_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    with factory.begin() as db:
        with pytest.raises(HTTPException) as error:
            save_message(db, conversation.id, requester_id, uuid4(), "Too late")
        assert error.value.status_code == 409


def test_websocket_ticket_is_single_use(factory, active_conversation):
    conversation, requester_id, _ = active_conversation
    with factory.begin() as db:
        raw, _ = create_ticket(db, conversation.id, requester_id, ttl_seconds=30)
    with factory.begin() as db:
        assert consume_ticket(db, raw, conversation.id) == requester_id
    with factory.begin() as db:
        assert consume_ticket(db, raw, conversation.id) is None

