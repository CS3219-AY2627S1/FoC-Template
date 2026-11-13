"""Safe correlation fields extracted from domain-event payloads."""

from __future__ import annotations

import json
from typing import Any

from .context import normalize_identifier


def context_from_event_body(body: bytes | None) -> dict[str, str]:
    """Extract bounded identifiers from an event without raising on bad input."""

    if not body:
        return {}
    try:
        envelope: Any = json.loads(body)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    if not isinstance(envelope, dict):
        return {}

    fields: dict[str, str] = {}
    for name in ("event_id", "correlation_id"):
        identifier = normalize_identifier(envelope.get(name))
        if identifier is not None:
            fields[name] = identifier

    # A domain event is the unit of work for a Kafka consumer. Reusing its
    # immutable event ID as request_id lets logs and outbound HTTP calls follow
    # the same operation across service boundaries.
    if "event_id" in fields:
        fields["request_id"] = fields["event_id"]

    event_type = envelope.get("event_type")
    if (
        isinstance(event_type, str)
        and 0 < len(event_type) <= 64
        and event_type.isprintable()
    ):
        fields["event_type"] = event_type

    payload = envelope.get("payload")
    if isinstance(payload, dict):
        for name in (
            "order_id",
            "requester_id",
            "courier_id",
            "user_id",
            "actor_user_id",
            "target_user_id",
            "cancelled_by",
        ):
            identifier = normalize_identifier(payload.get(name))
            if identifier is not None:
                fields[name] = identifier
    return fields
