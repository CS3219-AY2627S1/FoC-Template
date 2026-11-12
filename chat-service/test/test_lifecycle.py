# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Generated and refined Chat Service lifecycle tests.

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from main.lifecycle import apply_lifecycle_event
from main.models import Conversation, ProcessedEvent


def payload(**changes):
    values = {
        "errandId": str(uuid4()),
        "requesterId": str(uuid4()),
        "courierId": str(uuid4()),
        "creditValue": 10,
    }
    values.update(changes)
    return values


def test_lifecycle_events_create_and_close_conversation(factory):
    event = payload(
        acceptedAt=datetime.now(timezone.utc).isoformat(),
        expiresAt=(datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    )
    # accepted currently lacks expiresAt in production, but the projection accepts
    # it when present and is also enriched by errand.created.
    with factory.begin() as db:
        assert apply_lifecycle_event(db, "accepted-1", "errand.accepted", event)
    with factory.begin() as db:
        assert apply_lifecycle_event(db, "completed-1", "errand.completed", {
            **event,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        })

    with factory() as db:
        conversation = db.scalar(select(Conversation))
        assert conversation.delivery_status == "COMPLETED"
        assert conversation.closed_at is not None
        assert conversation.chat_closes_at - conversation.closed_at == timedelta(minutes=30)


def test_late_earlier_events_enrich_without_reopening_terminal_state(factory):
    errand_id = uuid4()
    requester_id = uuid4()
    courier_id = uuid4()
    terminal = payload(
        errandId=str(errand_id), requesterId=str(requester_id),
        courierId=str(courier_id), failedAt=datetime.now(timezone.utc).isoformat(),
    )
    expiry = datetime.now(timezone.utc) + timedelta(hours=2)

    with factory.begin() as db:
        apply_lifecycle_event(db, "failed-1", "errand.failed", terminal)
    with factory.begin() as db:
        apply_lifecycle_event(db, "created-1", "errand.created", {
            "errandId": str(errand_id),
            "requesterId": str(requester_id),
            "creditValue": 10,
            "expiresAt": expiry.isoformat(),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
    with factory.begin() as db:
        apply_lifecycle_event(db, "accepted-1", "errand.accepted", {
            **terminal,
            "acceptedAt": datetime.now(timezone.utc).isoformat(),
        })

    with factory() as db:
        conversation = db.scalar(select(Conversation))
        assert conversation.delivery_status == "FAILED"
        assert conversation.expires_at is not None
        assert conversation.courier_id == courier_id


def test_duplicate_event_is_ignored(factory):
    event = payload(acceptedAt=datetime.now(timezone.utc).isoformat())
    with factory.begin() as db:
        assert apply_lifecycle_event(db, "same-event", "errand.accepted", event)
    with factory.begin() as db:
        assert not apply_lifecycle_event(db, "same-event", "errand.accepted", event)
    with factory() as db:
        assert len(db.scalars(select(Conversation)).all()) == 1
        assert len(db.scalars(select(ProcessedEvent)).all()) == 1


def test_expired_event_uses_resulting_status_and_expiry_time(factory):
    expired_at = datetime.now(timezone.utc)

    for resulting_status in ("EXPIRED", "FAILED"):
        event = payload(
            errandId=str(uuid4()),
            resultingStatus=resulting_status,
            expiredAt=expired_at.isoformat(),
        )
        with factory.begin() as db:
            assert apply_lifecycle_event(
                db, f"expired-{resulting_status.lower()}", "errand.expired", event
            )

    with factory() as db:
        conversations = {
            conversation.delivery_status: conversation
            for conversation in db.scalars(select(Conversation)).all()
        }
        assert set(conversations) == {"EXPIRED", "FAILED"}
        assert conversations["EXPIRED"].closed_at.replace(tzinfo=timezone.utc) == expired_at
        assert conversations["FAILED"].closed_at.replace(tzinfo=timezone.utc) == expired_at
        assert conversations["EXPIRED"].chat_closes_at is None
        assert conversations["FAILED"].chat_closes_at is None

