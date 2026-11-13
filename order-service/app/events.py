"""Versioned order event contract, shared by the API and the worker."""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.messaging import INCOMING_EVENT_TYPES
from app.models import Order, OutboxEvent, utc_now

SCHEMA_VERSION = 1


class MalformedMessage(Exception):
    """An incoming message does not match the v1 event contract."""


@dataclass(frozen=True)
class IncomingEvent:
    event_id: UUID
    event_type: str
    correlation_id: UUID
    order_id: UUID
    reason: str | None


def isoformat_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def enqueue_event(
    db: Session,
    *,
    event_type: str,
    order: Order,
    correlation_id: UUID,
    extra: dict | None = None,
) -> OutboxEvent:
    """Stage an event in the caller's transaction. The worker publishes it later."""

    payload = {
        "order_id": str(order.id),
        "requester_id": str(order.requester_id),
        "credit_amount": order.credit_amount,
        "pickup_supplier_id": str(order.pickup_supplier_id),
        "delivery_label": order.delivery_label,
        "created_at": isoformat_utc(order.created_at),
    }
    if order.courier_id is not None:
        payload["courier_id"] = str(order.courier_id)
    if extra:
        payload.update(extra)
    event = OutboxEvent(
        event_id=uuid4(),
        event_type=event_type,
        schema_version=SCHEMA_VERSION,
        occurred_at=utc_now(),
        correlation_id=correlation_id,
        order_id=order.id,
        payload=payload,
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


def parse_incoming(body: bytes) -> IncomingEvent:
    try:
        data = json.loads(body)
        if not isinstance(data, dict):
            raise MalformedMessage
        for field in (
            "event_id",
            "event_type",
            "schema_version",
            "occurred_at",
            "correlation_id",
            "payload",
        ):
            if field not in data:
                raise MalformedMessage
        if type(data["schema_version"]) is not int or data["schema_version"] != SCHEMA_VERSION:
            raise MalformedMessage
        if not isinstance(data["occurred_at"], str) or not data["occurred_at"]:
            raise MalformedMessage
        if data["event_type"] not in INCOMING_EVENT_TYPES:
            raise MalformedMessage
        payload = data["payload"]
        if not isinstance(payload, dict) or "order_id" not in payload:
            raise MalformedMessage
        reason = payload.get("reason")
        if reason is not None and not isinstance(reason, str):
            raise MalformedMessage
        return IncomingEvent(
            event_id=UUID(str(data["event_id"])),
            event_type=data["event_type"],
            correlation_id=UUID(str(data["correlation_id"])),
            order_id=UUID(str(payload["order_id"])),
            reason=reason,
        )
    except MalformedMessage:
        raise
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise MalformedMessage from exc
