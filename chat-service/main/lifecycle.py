# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation and test assistance for Chat Service lifecycle events.

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from main.models import Conversation, ProcessedEvent


STATE_RANK = {
    "OPEN": 0,
    "ACCEPTED": 1,
    "DELIVERED": 2,
    "COMPLETED": 3,
    "FAILED": 3,
    "CANCELLED": 3,
    "EXPIRED": 3,
}


def parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def apply_lifecycle_event(db: Session, event_id: str, event_type: str, payload: dict) -> bool:
    if db.get(ProcessedEvent, event_id) is not None:
        return False

    errand_id = UUID(payload["errandId"])
    conversation = db.scalar(
        select(Conversation).where(Conversation.errand_id == errand_id).with_for_update()
    )

    requester_id = UUID(payload["requesterId"])
    if conversation is None:
        conversation = Conversation(
            id=uuid4(),
            errand_id=errand_id,
            requester_id=requester_id,
            courier_id=UUID(payload["courierId"]) if payload.get("courierId") else None,
            delivery_status="OPEN",
            expires_at=parse_datetime(payload.get("expiresAt")),
            next_sequence=1,
        )
        db.add(conversation)
        db.flush()

    # Created events can arrive late; enrich the projection without downgrading it.
    conversation.requester_id = requester_id
    if payload.get("expiresAt"):
        conversation.expires_at = parse_datetime(payload["expiresAt"])
    if payload.get("courierId"):
        conversation.courier_id = UUID(payload["courierId"])

    event_status = event_type.removeprefix("errand.").upper()
    if event_status == "CREATED":
        event_status = "OPEN"
    elif event_status == "EXPIRED":
        # Order Service emits the same event for OPEN -> EXPIRED and
        # ACCEPTED -> FAILED, so the payload contains the actual new state.
        event_status = payload["resultingStatus"].upper()
        if event_status not in {"EXPIRED", "FAILED"}:
            raise ValueError("errand.expired has an invalid resultingStatus")

    current_rank = STATE_RANK.get(conversation.delivery_status, -1)
    new_rank = STATE_RANK.get(event_status, -1)
    if new_rank > current_rank or (new_rank == current_rank and new_rank < 3):
        conversation.delivery_status = event_status

    if event_type == "errand.accepted":
        conversation.accepted_at = parse_datetime(payload.get("acceptedAt"))
    elif event_type == "errand.delivered":
        conversation.delivered_at = parse_datetime(payload.get("deliveredAt"))
    elif (
        event_status in {"COMPLETED", "FAILED", "CANCELLED", "EXPIRED"}
        and conversation.delivery_status == event_status
        and conversation.closed_at is None
    ):
        timestamp_fields = {
            "COMPLETED": "completedAt",
            "FAILED": "failedAt",
            "CANCELLED": "cancelledAt",
            "EXPIRED": "expiredAt",
        }
        timestamp_field = (
            "expiredAt" if event_type == "errand.expired"
            else timestamp_fields[event_status]
        )
        terminal_at = parse_datetime(payload.get(timestamp_field)) or datetime.now(timezone.utc)
        conversation.closed_at = terminal_at
        if event_status == "COMPLETED":
            conversation.chat_closes_at = terminal_at + timedelta(minutes=30)

    db.add(ProcessedEvent(event_id=event_id, event_type=event_type))
    db.flush()
    return True

