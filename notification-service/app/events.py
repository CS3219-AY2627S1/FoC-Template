# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code; Refactoring and documentation improvements — write pure functions that validate a raw order.events Kafka record and translate it into notification drafts; rename parse_record to process_record.
# Author review: Keith confirmed review and confirmed running `.venv/bin/python -m pytest tests/test_events.py`, with 416 passed.
# Details: notification-service/ai/usage-log.md; ai-20261104-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — add the start_at cutoff and the BeforeCutoff result, and add identifiers to Ignore (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — add correlation_id to the BeforeCutoff and Event results for failure logs (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001

"""Validate raw ``order.events`` records and translate them into drafts.

Everything here is pure: no Kafka, database, or network access. ``process_record``
is the entry point. Malformed reasons name the failed check and never echo
record contents, so they are safe to log.

Checks run in a fixed order: the transport check (envelope, headers, key), then
the cutoff, then the type filter and per-type validation and translation. Per-type
fields are therefore never checked for records before the cutoff.
"""

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

REQUESTER = "requester"
COURIER = "courier"

HANDLED_EVENT_TYPES = frozenset(
    {
        "order.opened",
        "order.rejected",
        "order.accepted",
        "order.picked_up",
        "order.completed",
        "order.cancelled",
        "order.expired",
    }
)

_ENVELOPE_FIELDS = (
    "event_id",
    "event_type",
    "schema_version",
    "occurred_at",
    "correlation_id",
    "payload",
)

# uuid.UUID() alone is too lenient: int(hex, 16) also accepts underscores, sign
# prefixes, and non-ASCII digits. Allow only the standard spellings of a UUID.
_UUID_CORE = "[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}"
_UUID_PATTERN = re.compile(
    rf"(?:urn:uuid:)?(?:{_UUID_CORE}|\{{{_UUID_CORE}\}})", re.IGNORECASE | re.ASCII
)


@dataclass(frozen=True)
class Malformed:
    """The record breaks the contract."""

    reason: str


@dataclass(frozen=True)
class BeforeCutoff:
    """A record older than the cutoff, whatever its type and payload fields."""

    event_id: UUID
    event_type: str
    order_id: UUID
    correlation_id: UUID


@dataclass(frozen=True)
class Ignore:
    """A valid record that produces no notifications."""

    event_id: UUID
    event_type: str
    order_id: UUID


@dataclass(frozen=True)
class NotificationDraft:
    recipient_id: UUID
    recipient_role: str
    type: str
    params: dict[str, Any]
    title: str
    body: str


@dataclass(frozen=True)
class Event:
    """A handled event. ``drafts`` may be empty."""

    event_id: UUID
    event_type: str
    occurred_at: datetime
    order_id: UUID
    correlation_id: UUID
    drafts: list[NotificationDraft]


ParseResult = Malformed | BeforeCutoff | Ignore | Event
Headers = Sequence[tuple[str, bytes | None]] | None


class _Invalid(Exception):
    """Internal: carries a Malformed reason out of nested validation."""


def process_record(
    key: bytes | None,
    value: bytes | None,
    headers: Headers,
    *,
    start_at: datetime,
) -> ParseResult:
    """Classify one raw Kafka record as Malformed, BeforeCutoff, Ignore, or Event.

    ``start_at`` must be timezone-aware. A record is before the cutoff only if
    ``occurred_at`` is strictly earlier than it.
    """

    try:
        return _parse(key, value, headers, start_at)
    except _Invalid as exc:
        return Malformed(str(exc))


def _parse(
    key: bytes | None, value: bytes | None, headers: Headers, start_at: datetime
) -> BeforeCutoff | Ignore | Event:
    envelope = _decode_value(value)
    for field in _ENVELOPE_FIELDS:
        if field not in envelope:
            raise _Invalid(f"envelope.{field}: missing")

    schema_version = envelope["schema_version"]
    if type(schema_version) is not int or schema_version != 1:
        raise _Invalid("envelope.schema_version: not the integer 1")
    event_id = _uuid(envelope["event_id"], "envelope.event_id")
    correlation_id = _uuid(envelope["correlation_id"], "envelope.correlation_id")
    occurred_at = _occurred_at(envelope["occurred_at"])

    payload = envelope["payload"]
    if not isinstance(payload, dict):
        raise _Invalid("envelope.payload: not an object")

    event_type = envelope["event_type"]
    if not isinstance(event_type, str):
        raise _Invalid("envelope.event_type: not a string")
    if not event_type.startswith("order."):
        raise _Invalid('envelope.event_type: does not start with "order."')

    if _header(headers, "event_type") != event_type:
        raise _Invalid("header.event_type: does not match envelope")
    if _uuid(_header(headers, "event_id"), "header.event_id") != event_id:
        raise _Invalid("header.event_id: does not match envelope")

    order_id = _order_id(key, payload)

    if occurred_at < start_at:
        return BeforeCutoff(event_id, event_type, order_id, correlation_id)

    if event_type not in HANDLED_EVENT_TYPES:
        return Ignore(event_id, event_type, order_id)

    return Event(
        event_id=event_id,
        event_type=event_type,
        occurred_at=occurred_at,
        order_id=order_id,
        correlation_id=correlation_id,
        drafts=_translate(event_type, payload),
    )


def _decode_value(value: bytes | None) -> dict[str, Any]:
    if not value:
        raise _Invalid("value: empty")
    try:
        text = value.decode("utf-8")
    except UnicodeDecodeError:
        raise _Invalid("value: not UTF-8") from None
    try:
        decoded = json.loads(text)
    except (ValueError, RecursionError):
        # ValueError also covers integers past Python's digit limit;
        # RecursionError covers pathologically nested JSON.
        raise _Invalid("value: invalid JSON") from None
    if not isinstance(decoded, dict):
        raise _Invalid("value: not a JSON object")
    return decoded


def _uuid(value: Any, location: str) -> UUID:
    if not isinstance(value, str) or not _UUID_PATTERN.fullmatch(value):
        raise _Invalid(f"{location}: not a UUID")
    return UUID(value)


def _occurred_at(value: Any) -> datetime:
    # fromisoformat accepts any character as the date/time separator.
    if not isinstance(value, str) or "T" not in value:
        raise _Invalid("envelope.occurred_at: not ISO-8601")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise _Invalid("envelope.occurred_at: not ISO-8601") from None
    if parsed.utcoffset() is None:
        raise _Invalid("envelope.occurred_at: no timezone")
    return parsed


def _header(headers: Headers, name: str) -> str:
    values = [raw for header, raw in headers or () if header == name]
    if not values:
        raise _Invalid(f"header.{name}: missing")
    if len(values) > 1:
        raise _Invalid(f"header.{name}: duplicated")
    try:
        return values[0].decode("utf-8")
    except (AttributeError, UnicodeDecodeError):
        raise _Invalid(f"header.{name}: not UTF-8") from None


def _order_id(key: bytes | None, payload: dict[str, Any]) -> UUID:
    if "order_id" not in payload:
        raise _Invalid("payload.order_id: missing")
    order_id = _uuid(payload["order_id"], "payload.order_id")
    if key is None:
        raise _Invalid("key: null")
    try:
        key_text = key.decode("utf-8")
    except UnicodeDecodeError:
        raise _Invalid("key: not UTF-8") from None
    if _uuid(key_text, "key") != order_id:
        raise _Invalid("key: does not match payload.order_id")
    return order_id


def _required_uuid(payload: dict[str, Any], field: str) -> UUID:
    if field not in payload:
        raise _Invalid(f"payload.{field}: missing")
    return _uuid(payload[field], f"payload.{field}")


def _credit_amount(payload: dict[str, Any]) -> int:
    if "credit_amount" not in payload:
        raise _Invalid("payload.credit_amount: missing")
    amount = payload["credit_amount"]
    if type(amount) is not int or amount < 1:
        raise _Invalid("payload.credit_amount: not an integer of at least 1")
    return amount


def _previous_status(payload: dict[str, Any]) -> str:
    if "previous_status" not in payload:
        raise _Invalid("payload.previous_status: missing")
    status = payload["previous_status"]
    if not isinstance(status, str) or not status:
        raise _Invalid("payload.previous_status: not a non-empty string")
    return status


def _reason(payload: dict[str, Any]) -> str | None:
    reason = payload.get("reason")
    if reason is not None and not isinstance(reason, str):
        raise _Invalid("payload.reason: not a string")
    return reason


def _credits(amount: int) -> str:
    return "1 credit" if amount == 1 else f"{amount} credits"


def _translate(event_type: str, payload: dict[str, Any]) -> list[NotificationDraft]:
    requester_id = _required_uuid(payload, "requester_id")
    courier_id = None
    if "courier_id" in payload:
        courier_id = _uuid(payload["courier_id"], "payload.courier_id")
        if courier_id == requester_id:
            raise _Invalid("payload.courier_id: equals requester_id")

    def to_requester(params: dict[str, Any], title: str, body: str) -> NotificationDraft:
        return NotificationDraft(requester_id, REQUESTER, event_type, params, title, body)

    def to_courier(params: dict[str, Any], title: str, body: str) -> NotificationDraft:
        return NotificationDraft(courier_id, COURIER, event_type, params, title, body)

    if event_type == "order.opened":
        amount = _credit_amount(payload)
        verb = "is" if amount == 1 else "are"
        return [
            to_requester(
                {"credit_amount": amount},
                "Order is live",
                f"Your order is live. {_credits(amount)} {verb} on hold.",
            )
        ]
    if event_type == "order.rejected":
        return [
            to_requester(
                {"reason": _reason(payload)},
                "Order not placed",
                "Your order couldn't be placed.",
            )
        ]
    if event_type == "order.accepted":
        return [to_requester({}, "Order accepted", "A courier accepted your order.")]
    if event_type == "order.picked_up":
        return [to_requester({}, "Order picked up", "Your order has been picked up.")]
    if event_type == "order.expired":
        return [to_requester({}, "Order expired", "Your order expired without a courier.")]
    if event_type == "order.completed":
        amount = _credit_amount(payload)
        if courier_id is None:
            raise _Invalid("payload.courier_id: missing")
        return [
            to_courier(
                {"credit_amount": amount},
                "Order completed",
                f"Order completed. {_credits(amount)} will be added to your balance.",
            )
        ]

    # order.cancelled is the only remaining handled type.
    cancelled_by = _required_uuid(payload, "cancelled_by")
    previous_status = _previous_status(payload)
    title = "Order cancelled"
    if cancelled_by == requester_id:
        if courier_id is None:
            return []
        params = {"cancelled_by_role": "requester", "previous_status": previous_status}
        return [to_courier(params, title, "The requester cancelled this order.")]

    params = {"cancelled_by_role": "admin", "previous_status": previous_status}
    drafts = [
        to_requester(params, title, "Your order was cancelled by an administrator.")
    ]
    if courier_id is not None:
        drafts.append(
            to_courier(dict(params), title, "This order was cancelled by an administrator.")
        )
    return drafts
