"""Strict v1 event parsing and transactional outbox construction."""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.messaging import (
    ORDER_EVENT_TYPES,
    OUTGOING_EVENT_TYPES,
)
from app.models import OutboxEvent, utc_now

SCHEMA_VERSION = 1


class MalformedMessage(Exception):
    """An incoming message does not match the documented v1 contract."""


@dataclass(frozen=True)
class OrderEvent:
    event_id: UUID
    event_type: str
    occurred_at: datetime
    correlation_id: UUID
    order_id: UUID
    requester_id: UUID
    credit_amount: int
    courier_id: UUID | None = None
    previous_status: str | None = None


IncomingEvent = OrderEvent


def isoformat_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_order_event(body: bytes) -> OrderEvent:
    """Reject malformed, unknown, or incomplete events before business handling."""

    try:
        data = json.loads(body)
        if not isinstance(data, dict):
            raise MalformedMessage
        required = {
            "event_id",
            "event_type",
            "schema_version",
            "occurred_at",
            "correlation_id",
            "payload",
        }
        if not required.issubset(data):
            raise MalformedMessage
        if type(data["schema_version"]) is not int or data["schema_version"] != 1:
            raise MalformedMessage
        event_type = data["event_type"]
        if event_type not in ORDER_EVENT_TYPES:
            raise MalformedMessage
        payload = data["payload"]
        if not isinstance(payload, dict):
            raise MalformedMessage
        for field in ("order_id", "requester_id", "credit_amount"):
            if field not in payload:
                raise MalformedMessage
        amount = payload["credit_amount"]
        if type(amount) is not int or amount <= 0:
            raise MalformedMessage
        courier_raw = payload.get("courier_id")
        previous_status = payload.get("previous_status")
        if previous_status is not None and not isinstance(previous_status, str):
            raise MalformedMessage
        pays_courier = event_type == "order.completed" or (
            event_type == "order.cancelled"
            and (previous_status or "").upper() == "PICKED_UP"
        )
        if pays_courier and courier_raw is None:
            raise MalformedMessage
        occurred_at = datetime.fromisoformat(
            str(data["occurred_at"]).replace("Z", "+00:00")
        )
        if occurred_at.tzinfo is None:
            raise MalformedMessage
        return OrderEvent(
            event_id=UUID(str(data["event_id"])),
            event_type=event_type,
            occurred_at=occurred_at,
            correlation_id=UUID(str(data["correlation_id"])),
            order_id=UUID(str(payload["order_id"])),
            requester_id=UUID(str(payload["requester_id"])),
            credit_amount=amount,
            courier_id=UUID(str(courier_raw)) if courier_raw is not None else None,
            previous_status=previous_status,
        )
    except MalformedMessage:
        raise
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise MalformedMessage from exc


def parse_incoming_event(body: bytes) -> IncomingEvent:
    """Parse one supported Order Service event."""

    return parse_order_event(body)


def enqueue_credit_event(
    db: Session,
    *,
    event_type: str,
    order_id: UUID,
    correlation_id: UUID,
    payload: dict,
) -> OutboxEvent:
    """Stage a response in the current database transaction."""

    if event_type not in OUTGOING_EVENT_TYPES:
        raise ValueError(f"Unsupported credit event type: {event_type}")
    event = OutboxEvent(
        event_id=uuid4(),
        event_type=event_type,
        schema_version=SCHEMA_VERSION,
        occurred_at=utc_now(),
        correlation_id=correlation_id,
        order_id=order_id,
        payload={"order_id": str(order_id), **payload},
    )
    db.add(event)
    return event


def dump_event(event: OutboxEvent) -> bytes:
    body = {
        "event_id": str(event.event_id),
        "event_type": event.event_type,
        "schema_version": event.schema_version,
        "occurred_at": isoformat_utc(event.occurred_at),
        "correlation_id": str(event.correlation_id),
        "payload": event.payload,
    }
    return json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
