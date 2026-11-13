# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code; Debugging assistance; Refactoring and documentation improvements — write unit tests for record validation, the type filter, per-type required fields, and notification translation; fix a test helper bug; rename parse_record to process_record.
# Author review: Keith confirmed review and confirmed running `.venv/bin/python -m pytest tests/test_events.py`, with 416 passed.
# Details: notification-service/ai/usage-log.md; ai-20261104-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — pass start_at through a helper, compare Ignore with its new fields, and add cutoff tests (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — expect correlation_id on BeforeCutoff and Event (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001

import ast
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

import pytest

from app import events
from app.events import (
    BeforeCutoff,
    Event,
    Ignore,
    Malformed,
    NotificationDraft,
    process_record,
)
from app.models import RECIPIENT_ROLES

EVENT_ID = "11111111-1111-4111-8111-111111111111"
CORRELATION_ID = "22222222-2222-4222-8222-222222222222"
ORDER_ID = "33333333-aaaa-4333-8333-333333333333"
REQUESTER_ID = "44444444-bbbb-4444-8444-444444444444"
COURIER_ID = "55555555-cccc-4555-8555-555555555555"
ADMIN_ID = "66666666-dddd-4666-8666-666666666666"

REQUIRED_PAYLOADS = {
    "order.opened": {"requester_id": REQUESTER_ID, "credit_amount": 8},
    "order.rejected": {"requester_id": REQUESTER_ID, "reason": "INSUFFICIENT_CREDIT"},
    "order.accepted": {"requester_id": REQUESTER_ID, "courier_id": COURIER_ID},
    "order.picked_up": {"requester_id": REQUESTER_ID, "courier_id": COURIER_ID},
    "order.completed": {
        "requester_id": REQUESTER_ID,
        "courier_id": COURIER_ID,
        "credit_amount": 8,
    },
    "order.cancelled": {
        "requester_id": REQUESTER_ID,
        "cancelled_by": REQUESTER_ID,
        "previous_status": "OPEN",
    },
    "order.expired": {"requester_id": REQUESTER_ID},
}
HANDLED_TYPES = sorted(REQUIRED_PAYLOADS)

# Earlier than every occurred_at in the tests that are not about the cutoff.
START_AT = datetime(2000, 1, 1, tzinfo=timezone.utc)

_DROP = object()
EVENT_TYPE_HEADER = ("event_type", b"order.accepted")
EVENT_ID_HEADER = ("event_id", EVENT_ID.encode())


def build_envelope(event_type: str = "order.accepted", payload=None, **overrides) -> dict:
    if payload is None:
        payload = REQUIRED_PAYLOADS.get(event_type, {"requester_id": REQUESTER_ID})
        payload = {"order_id": ORDER_ID, **payload}
    envelope = {
        "event_id": EVENT_ID,
        "event_type": event_type,
        "schema_version": 1,
        "occurred_at": "2026-11-04T08:30:00+08:00",
        "correlation_id": CORRELATION_ID,
        "payload": payload,
    }
    envelope.update(overrides)
    return envelope


def record(envelope: dict, key=_DROP, headers=_DROP) -> tuple:
    event_type = envelope.get("event_type")
    if key is _DROP:
        key = ORDER_ID.encode()
    if headers is _DROP:
        headers = [
            ("event_type", str(event_type).encode()),
            ("event_id", EVENT_ID.encode()),
        ]
    return key, json.dumps(envelope).encode(), headers


def process(key, value, headers, start_at: datetime = START_AT):
    return process_record(key, value, headers, start_at=start_at)


def parse_event(event_type: str, **payload_fields) -> Event | Ignore | Malformed:
    payload = {"order_id": ORDER_ID, **REQUIRED_PAYLOADS.get(event_type, {})}
    for field, value in payload_fields.items():
        if value is _DROP:
            payload.pop(field, None)
        else:
            payload[field] = value
    return process(*record(build_envelope(event_type, payload)))


def draft(recipient, role, event_type, params, title, body) -> NotificationDraft:
    return NotificationDraft(UUID(recipient), role, event_type, params, title, body)


def assert_malformed(result, reason: str) -> None:
    assert result == Malformed(reason)


# --- Translation: recipients, roles, params, and text ---


@pytest.mark.parametrize(
    ("event_type", "fields", "expected"),
    [
        pytest.param(
            "order.opened",
            {},
            draft(
                REQUESTER_ID,
                "requester",
                "order.opened",
                {"credit_amount": 8},
                "Order is live",
                "Your order is live. 8 credits are on hold.",
            ),
            id="opened",
        ),
        pytest.param(
            "order.rejected",
            {},
            draft(
                REQUESTER_ID,
                "requester",
                "order.rejected",
                {"reason": "INSUFFICIENT_CREDIT"},
                "Order not placed",
                "Your order couldn't be placed.",
            ),
            id="rejected",
        ),
        pytest.param(
            "order.accepted",
            {},
            draft(
                REQUESTER_ID,
                "requester",
                "order.accepted",
                {},
                "Order accepted",
                "A courier accepted your order.",
            ),
            id="accepted",
        ),
        pytest.param(
            "order.picked_up",
            {},
            draft(
                REQUESTER_ID,
                "requester",
                "order.picked_up",
                {},
                "Order picked up",
                "Your order has been picked up.",
            ),
            id="picked_up",
        ),
        pytest.param(
            "order.completed",
            {},
            draft(
                COURIER_ID,
                "courier",
                "order.completed",
                {"credit_amount": 8},
                "Order completed",
                "Order completed. 8 credits will be added to your balance.",
            ),
            id="completed",
        ),
        pytest.param(
            "order.expired",
            {},
            draft(
                REQUESTER_ID,
                "requester",
                "order.expired",
                {},
                "Order expired",
                "Your order expired without a courier.",
            ),
            id="expired",
        ),
    ],
)
def test_single_recipient_types(event_type, fields, expected) -> None:
    result = parse_event(event_type, **fields)

    assert isinstance(result, Event)
    assert result.drafts == [expected]


def test_event_carries_identifiers_and_timestamp() -> None:
    result = parse_event("order.accepted")

    assert result.event_id == UUID(EVENT_ID)
    assert result.event_type == "order.accepted"
    assert result.order_id == UUID(ORDER_ID)
    assert result.correlation_id == UUID(CORRELATION_ID)
    assert result.occurred_at == datetime(
        2026, 11, 4, 8, 30, tzinfo=timezone(timedelta(hours=8))
    )


def test_opened_singular_credit_wording() -> None:
    result = parse_event("order.opened", credit_amount=1)

    assert result.drafts[0].params == {"credit_amount": 1}
    assert result.drafts[0].body == "Your order is live. 1 credit is on hold."


def test_completed_singular_credit_wording() -> None:
    result = parse_event("order.completed", credit_amount=1)

    assert result.drafts[0].body == (
        "Order completed. 1 credit will be added to your balance."
    )


def test_completed_text_never_says_credits_were_paid() -> None:
    body = parse_event("order.completed").drafts[0].body.lower()

    assert "will be added" in body
    assert "paid" not in body


def test_completed_notifies_courier_never_the_requester() -> None:
    result = parse_event("order.completed")

    assert [d.recipient_id for d in result.drafts] == [UUID(COURIER_ID)]


def test_rejected_reason_is_never_in_the_text() -> None:
    result = parse_event("order.rejected", reason="SECRET_CODE")

    assert result.drafts[0].params == {"reason": "SECRET_CODE"}
    assert "SECRET_CODE" not in result.drafts[0].title
    assert "SECRET_CODE" not in result.drafts[0].body


@pytest.mark.parametrize(
    "reason", ["", "  spaced  ", "insufficient balance"], ids=["empty", "spaces", "text"]
)
def test_rejected_reason_passes_through_unchanged(reason) -> None:
    assert parse_event("order.rejected", reason=reason).drafts[0].params == {
        "reason": reason
    }


def test_rejected_absent_reason_is_null() -> None:
    assert parse_event("order.rejected", reason=_DROP).drafts[0].params == {"reason": None}


def test_rejected_explicit_null_reason_is_null() -> None:
    assert parse_event("order.rejected", reason=None).drafts[0].params == {"reason": None}


@pytest.mark.parametrize("reason", [42, True, ["x"], {"code": "x"}])
def test_rejected_non_string_reason_is_malformed(reason) -> None:
    assert_malformed(
        parse_event("order.rejected", reason=reason), "payload.reason: not a string"
    )


REQUESTER_CANCEL_PARAMS = {"cancelled_by_role": "requester", "previous_status": "ACCEPTED"}
ADMIN_CANCEL_PARAMS = {"cancelled_by_role": "admin", "previous_status": "ACCEPTED"}


def test_cancelled_by_requester_with_courier_notifies_courier_only() -> None:
    result = parse_event(
        "order.cancelled", courier_id=COURIER_ID, previous_status="ACCEPTED"
    )

    assert result.drafts == [
        draft(
            COURIER_ID,
            "courier",
            "order.cancelled",
            REQUESTER_CANCEL_PARAMS,
            "Order cancelled",
            "The requester cancelled this order.",
        )
    ]


def test_cancelled_by_requester_without_courier_is_event_with_no_drafts() -> None:
    result = parse_event("order.cancelled")

    assert isinstance(result, Event)
    assert result.drafts == []


def test_cancelled_by_admin_without_courier_notifies_requester() -> None:
    result = parse_event(
        "order.cancelled", cancelled_by=ADMIN_ID, previous_status="ACCEPTED"
    )

    assert result.drafts == [
        draft(
            REQUESTER_ID,
            "requester",
            "order.cancelled",
            ADMIN_CANCEL_PARAMS,
            "Order cancelled",
            "Your order was cancelled by an administrator.",
        )
    ]


ADMIN_DRAFTS = [
    draft(
        REQUESTER_ID,
        "requester",
        "order.cancelled",
        ADMIN_CANCEL_PARAMS,
        "Order cancelled",
        "Your order was cancelled by an administrator.",
    ),
    draft(
        COURIER_ID,
        "courier",
        "order.cancelled",
        ADMIN_CANCEL_PARAMS,
        "Order cancelled",
        "This order was cancelled by an administrator.",
    ),
]


def test_cancelled_by_admin_with_courier_notifies_both() -> None:
    result = parse_event(
        "order.cancelled",
        cancelled_by=ADMIN_ID,
        courier_id=COURIER_ID,
        previous_status="ACCEPTED",
    )

    assert result.drafts == ADMIN_DRAFTS


def test_cancelled_by_courier_takes_the_admin_branch() -> None:
    result = parse_event(
        "order.cancelled",
        cancelled_by=COURIER_ID,
        courier_id=COURIER_ID,
        previous_status="ACCEPTED",
    )

    assert result.drafts == ADMIN_DRAFTS


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
def test_params_never_contain_actor_uuids(event_type) -> None:
    extra = {"cancelled_by": ADMIN_ID} if event_type == "order.cancelled" else {}
    result = parse_event(event_type, courier_id=COURIER_ID, **extra)

    assert result.drafts
    for notification in result.drafts:
        serialized = json.dumps(notification.params)
        for actor in (REQUESTER_ID, COURIER_ID, ADMIN_ID):
            assert actor not in serialized


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
def test_recipient_roles_are_allowed_by_the_schema(event_type) -> None:
    extra = {"cancelled_by": ADMIN_ID} if event_type == "order.cancelled" else {}
    result = parse_event(event_type, courier_id=COURIER_ID, **extra)

    assert {d.recipient_role for d in result.drafts} <= set(RECIPIENT_ROLES)


# --- Filter ---


@pytest.mark.parametrize("event_type", ["order.created", "order.refunded", "order."])
def test_unhandled_order_types_are_ignored(event_type) -> None:
    assert process(*record(build_envelope(event_type))) == Ignore(
        UUID(EVENT_ID), event_type, UUID(ORDER_ID)
    )


def test_ignored_type_does_not_need_handled_type_fields() -> None:
    envelope = build_envelope("order.created", {"order_id": ORDER_ID})

    assert process(*record(envelope)) == Ignore(
        UUID(EVENT_ID), "order.created", UUID(ORDER_ID)
    )


def test_ignored_type_still_gets_transport_validation() -> None:
    result = process(*record(build_envelope("order.created"), key=None))

    assert_malformed(result, "key: null")


@pytest.mark.parametrize("event_type", ["credit.reserved", "orders.opened", "ORDER.opened", ""])
def test_event_type_without_order_prefix_is_malformed(event_type) -> None:
    assert_malformed(
        process(*record(build_envelope(event_type))),
        'envelope.event_type: does not start with "order."',
    )


def test_unknown_payload_fields_are_ignored() -> None:
    result = parse_event("order.accepted", delivery_label="x", nested={"a": [1]})

    assert isinstance(result, Event)
    assert result.drafts[0].params == {}


# --- Transport: value ---


@pytest.mark.parametrize(
    ("value", "reason"),
    [
        pytest.param(None, "value: empty", id="null"),
        pytest.param(b"", "value: empty", id="empty"),
        pytest.param(b"\xff\xfe{}", "value: not UTF-8", id="non-utf8"),
        pytest.param(b"{not json", "value: invalid JSON", id="invalid-json"),
        pytest.param(b"[" * 200_000, "value: invalid JSON", id="too-deeply-nested"),
        pytest.param(
            b'{"n": ' + b"1" * 5000 + b"}", "value: invalid JSON", id="integer-too-long"
        ),
        pytest.param(b"[1, 2]", "value: not a JSON object", id="array"),
        pytest.param(b'"text"', "value: not a JSON object", id="string"),
        pytest.param(b"null", "value: not a JSON object", id="json-null"),
    ],
)
def test_bad_value_is_malformed(value, reason) -> None:
    key, _, headers = record(build_envelope())

    assert_malformed(process(key, value, headers), reason)


# --- Transport: envelope ---


@pytest.mark.parametrize(
    "field",
    ["event_id", "event_type", "schema_version", "occurred_at", "correlation_id", "payload"],
)
def test_missing_envelope_field_is_malformed(field) -> None:
    envelope = build_envelope()
    del envelope[field]

    result = process(*record(envelope, headers=[EVENT_TYPE_HEADER, EVENT_ID_HEADER]))

    assert_malformed(result, f"envelope.{field}: missing")


@pytest.mark.parametrize(
    "version", [True, False, "1", 2, 0, 1.0, None], ids=repr
)
def test_bad_schema_version_is_malformed(version) -> None:
    result = process(*record(build_envelope(schema_version=version)))

    assert_malformed(result, "envelope.schema_version: not the integer 1")


BAD_UUIDS = [
    "not-a-uuid",
    "",
    "1234",
    EVENT_ID + "0",
    "1111_111-1111-4111-8111-111111111111",
    "+1111111-1111-4111-8111-111111111111",
    "١" + EVENT_ID[1:],
    EVENT_ID + "\n",
    "{" + EVENT_ID,
    123,
    None,
    True,
    [EVENT_ID],
]


@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_bad_event_id_is_malformed(value) -> None:
    result = process(*record(build_envelope(event_id=value)))

    assert_malformed(result, "envelope.event_id: not a UUID")


@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_bad_correlation_id_is_malformed(value) -> None:
    result = process(*record(build_envelope(correlation_id=value)))

    assert_malformed(result, "envelope.correlation_id: not a UUID")


@pytest.mark.parametrize("value", ["2026-11-04T08:30:00", "20261104T083000"])
def test_occurred_at_without_timezone_is_malformed(value) -> None:
    result = process(*record(build_envelope(occurred_at=value)))

    assert_malformed(result, "envelope.occurred_at: no timezone")


@pytest.mark.parametrize(
    "value",
    [
        "yesterday",
        "",
        "2026-11-04",
        "2026-13-45T08:30:00Z",
        "2026-11-04x08:30:00+00:00",
        "2026-11-04 08:30:00+00:00",
        1730000000,
        None,
        True,
    ],
    ids=repr,
)
def test_invalid_occurred_at_is_malformed(value) -> None:
    result = process(*record(build_envelope(occurred_at=value)))

    assert_malformed(result, "envelope.occurred_at: not ISO-8601")


@pytest.mark.parametrize(
    ("value", "offset"),
    [
        ("2026-11-04T00:30:00Z", timedelta(0)),
        ("2026-11-04T00:30:00+00:00", timedelta(0)),
        ("2026-11-04T08:30:00.123456+08:00", timedelta(hours=8)),
        ("2026-11-03T19:30:00-05:00", timedelta(hours=-5)),
    ],
)
def test_occurred_at_with_timezone_is_accepted(value, offset) -> None:
    result = process(*record(build_envelope(occurred_at=value)))

    assert result.occurred_at.utcoffset() == offset


@pytest.mark.parametrize("payload", [[], "x", 1, True])
def test_non_object_payload_is_malformed(payload) -> None:
    result = process(*record(build_envelope(payload=payload)))

    assert_malformed(result, "envelope.payload: not an object")


def test_null_payload_is_malformed() -> None:
    envelope = build_envelope()
    envelope["payload"] = None

    assert_malformed(process(*record(envelope)), "envelope.payload: not an object")


@pytest.mark.parametrize("event_type", [None, 1, ["order.opened"]], ids=repr)
def test_non_string_event_type_is_malformed(event_type) -> None:
    envelope = build_envelope()
    envelope["event_type"] = event_type

    assert_malformed(process(*record(envelope)), "envelope.event_type: not a string")


# --- Transport: headers ---


@pytest.mark.parametrize(
    ("headers", "reason"),
    [
        pytest.param(None, "header.event_type: missing", id="no-headers"),
        pytest.param([], "header.event_type: missing", id="empty-headers"),
        pytest.param(
            [EVENT_ID_HEADER], "header.event_type: missing", id="missing-event-type"
        ),
        pytest.param(
            [EVENT_TYPE_HEADER], "header.event_id: missing", id="missing-event-id"
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, EVENT_TYPE_HEADER, EVENT_ID_HEADER],
            "header.event_type: duplicated",
            id="duplicated-event-type",
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, EVENT_ID_HEADER, EVENT_ID_HEADER],
            "header.event_id: duplicated",
            id="duplicated-event-id",
        ),
        pytest.param(
            [("event_type", b"\xff"), EVENT_ID_HEADER],
            "header.event_type: not UTF-8",
            id="non-utf8-event-type",
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, ("event_id", b"\xff")],
            "header.event_id: not UTF-8",
            id="non-utf8-event-id",
        ),
        pytest.param(
            [("event_type", None), EVENT_ID_HEADER],
            "header.event_type: not UTF-8",
            id="null-event-type",
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, ("event_id", None)],
            "header.event_id: not UTF-8",
            id="null-event-id",
        ),
        pytest.param(
            [("event_type", b"order.opened"), EVENT_ID_HEADER],
            "header.event_type: does not match envelope",
            id="mismatched-event-type",
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, ("event_id", CORRELATION_ID.encode())],
            "header.event_id: does not match envelope",
            id="mismatched-event-id",
        ),
        pytest.param(
            [EVENT_TYPE_HEADER, ("event_id", b"not-a-uuid")],
            "header.event_id: not a UUID",
            id="event-id-not-uuid",
        ),
    ],
)
def test_bad_headers_are_malformed(headers, reason) -> None:
    result = process(*record(build_envelope(), headers=headers))

    assert_malformed(result, reason)


def test_event_id_header_compares_as_a_uuid() -> None:
    headers = [EVENT_TYPE_HEADER, ("event_id", EVENT_ID.upper().encode())]

    assert isinstance(process(*record(build_envelope(), headers=headers)), Event)


def test_other_headers_are_ignored_even_when_duplicated() -> None:
    headers = [EVENT_TYPE_HEADER, EVENT_ID_HEADER, ("trace", b"\xff"), ("trace", None)]

    assert isinstance(process(*record(build_envelope(), headers=headers)), Event)


# --- Transport: key and order_id ---


@pytest.mark.parametrize(
    ("key", "reason"),
    [
        pytest.param(None, "key: null", id="null"),
        pytest.param(b"", "key: not a UUID", id="empty"),
        pytest.param(b"\xff\xfe", "key: not UTF-8", id="non-utf8"),
        pytest.param(b"order-1", "key: not a UUID", id="not-uuid"),
        pytest.param(
            COURIER_ID.encode(), "key: does not match payload.order_id", id="mismatch"
        ),
    ],
)
def test_bad_key_is_malformed(key, reason) -> None:
    assert_malformed(process(*record(build_envelope(), key=key)), reason)


def test_missing_order_id_is_malformed() -> None:
    assert_malformed(
        parse_event("order.accepted", order_id=_DROP), "payload.order_id: missing"
    )


@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_bad_order_id_is_malformed(value) -> None:
    assert_malformed(
        parse_event("order.accepted", order_id=value), "payload.order_id: not a UUID"
    )


# --- UUID canonicalisation ---


def non_canonical_forms(value: str) -> list[str]:
    return [
        value.upper(),
        value.replace("-", ""),
        "{" + value + "}",
        "urn:uuid:" + value,
    ]


@pytest.mark.parametrize("form", non_canonical_forms(ORDER_ID))
def test_non_canonical_order_id_matches_canonical_key(form) -> None:
    result = parse_event("order.accepted", order_id=form)

    assert result.order_id == UUID(ORDER_ID)


@pytest.mark.parametrize("form", non_canonical_forms(ORDER_ID))
def test_non_canonical_key_matches_canonical_order_id(form) -> None:
    result = process(*record(build_envelope(), key=form.encode()))

    assert result.order_id == UUID(ORDER_ID)


@pytest.mark.parametrize("form", non_canonical_forms(REQUESTER_ID))
def test_non_canonical_cancelled_by_still_matches_requester(form) -> None:
    result = parse_event("order.cancelled", cancelled_by=form)

    assert result.drafts == []


@pytest.mark.parametrize("form", non_canonical_forms(REQUESTER_ID))
def test_non_canonical_courier_id_equal_to_requester_is_malformed(form) -> None:
    assert_malformed(
        parse_event("order.accepted", courier_id=form),
        "payload.courier_id: equals requester_id",
    )


def test_recipients_are_returned_canonically() -> None:
    result = parse_event("order.completed", courier_id=COURIER_ID.upper())

    assert result.drafts[0].recipient_id == UUID(COURIER_ID)


# --- Required fields per handled type ---


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
def test_missing_requester_id_is_malformed(event_type) -> None:
    assert_malformed(
        parse_event(event_type, requester_id=_DROP), "payload.requester_id: missing"
    )


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_bad_requester_id_is_malformed(event_type, value) -> None:
    assert_malformed(
        parse_event(event_type, requester_id=value), "payload.requester_id: not a UUID"
    )


@pytest.mark.parametrize("event_type", ["order.opened", "order.completed"])
def test_missing_credit_amount_is_malformed(event_type) -> None:
    assert_malformed(
        parse_event(event_type, credit_amount=_DROP), "payload.credit_amount: missing"
    )


@pytest.mark.parametrize("event_type", ["order.opened", "order.completed"])
@pytest.mark.parametrize("amount", [0, -1, 1.0, 1.5, "8", True, False, None, [8]], ids=repr)
def test_bad_credit_amount_is_malformed(event_type, amount) -> None:
    assert_malformed(
        parse_event(event_type, credit_amount=amount),
        "payload.credit_amount: not an integer of at least 1",
    )


@pytest.mark.parametrize(
    "event_type",
    ["order.rejected", "order.accepted", "order.picked_up", "order.cancelled", "order.expired"],
)
def test_other_types_do_not_validate_credit_amount(event_type) -> None:
    assert isinstance(parse_event(event_type, credit_amount="not checked"), Event)


def test_completed_missing_courier_is_malformed() -> None:
    assert_malformed(
        parse_event("order.completed", courier_id=_DROP), "payload.courier_id: missing"
    )


def test_cancelled_missing_cancelled_by_is_malformed() -> None:
    assert_malformed(
        parse_event("order.cancelled", cancelled_by=_DROP), "payload.cancelled_by: missing"
    )


@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_cancelled_bad_cancelled_by_is_malformed(value) -> None:
    assert_malformed(
        parse_event("order.cancelled", cancelled_by=value), "payload.cancelled_by: not a UUID"
    )


def test_cancelled_missing_previous_status_is_malformed() -> None:
    assert_malformed(
        parse_event("order.cancelled", previous_status=_DROP),
        "payload.previous_status: missing",
    )


@pytest.mark.parametrize("value", ["", 1, None, True, ["OPEN"]], ids=repr)
def test_cancelled_bad_previous_status_is_malformed(value) -> None:
    assert_malformed(
        parse_event("order.cancelled", previous_status=value),
        "payload.previous_status: not a non-empty string",
    )


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
@pytest.mark.parametrize("value", BAD_UUIDS, ids=repr)
def test_bad_courier_id_is_malformed_on_any_type(event_type, value) -> None:
    assert_malformed(
        parse_event(event_type, courier_id=value), "payload.courier_id: not a UUID"
    )


@pytest.mark.parametrize("event_type", HANDLED_TYPES)
def test_courier_equal_to_requester_is_malformed_on_any_type(event_type) -> None:
    assert_malformed(
        parse_event(event_type, courier_id=REQUESTER_ID),
        "payload.courier_id: equals requester_id",
    )


# --- Cutoff ---

# build_envelope's occurred_at, 2026-11-04T08:30:00+08:00, as a UTC instant.
OCCURRED_AT = datetime(2026, 11, 4, 0, 30, tzinfo=timezone.utc)
AFTER_OCCURRED_AT = OCCURRED_AT + timedelta(microseconds=1)


def before_cutoff(event_type: str = "order.accepted") -> BeforeCutoff:
    return BeforeCutoff(UUID(EVENT_ID), event_type, UUID(ORDER_ID), UUID(CORRELATION_ID))


def test_start_at_is_a_required_keyword_argument() -> None:
    key, value, headers = record(build_envelope())

    with pytest.raises(TypeError):
        process_record(key, value, headers)
    with pytest.raises(TypeError):
        process_record(key, value, headers, START_AT)


@pytest.mark.parametrize("event_type", HANDLED_TYPES + ["order.created", "order.refunded"])
def test_any_type_before_the_cutoff_is_before_cutoff(event_type) -> None:
    result = process(*record(build_envelope(event_type)), start_at=AFTER_OCCURRED_AT)

    assert result == before_cutoff(event_type)


@pytest.mark.parametrize(
    ("event_type", "payload"),
    [
        pytest.param("order.completed", {"requester_id": REQUESTER_ID}, id="no-courier"),
        pytest.param("order.opened", {"requester_id": REQUESTER_ID}, id="no-amount"),
        pytest.param("order.opened", {"credit_amount": 0}, id="no-requester-bad-amount"),
        pytest.param(
            "order.accepted",
            {"requester_id": REQUESTER_ID, "courier_id": REQUESTER_ID},
            id="courier-is-requester",
        ),
        pytest.param(
            "order.cancelled", {"requester_id": "not-a-uuid"}, id="bad-requester"
        ),
        pytest.param("order.rejected", {"reason": 7}, id="bad-reason"),
    ],
)
def test_per_type_fields_are_not_checked_before_the_cutoff(event_type, payload) -> None:
    envelope = build_envelope(event_type, {"order_id": ORDER_ID, **payload})

    assert process(*record(envelope)) != before_cutoff(event_type)
    assert process(*record(envelope), start_at=AFTER_OCCURRED_AT) == before_cutoff(event_type)


def test_occurred_at_equal_to_start_at_is_not_before_the_cutoff() -> None:
    result = process(*record(build_envelope()), start_at=OCCURRED_AT)

    assert isinstance(result, Event)


def test_invalid_record_equal_to_start_at_is_still_malformed() -> None:
    envelope = build_envelope(
        "order.completed", {"order_id": ORDER_ID, "requester_id": REQUESTER_ID}
    )

    assert_malformed(
        process(*record(envelope), start_at=OCCURRED_AT), "payload.credit_amount: missing"
    )


def test_ignored_type_equal_to_start_at_is_ignored() -> None:
    result = process(*record(build_envelope("order.created")), start_at=OCCURRED_AT)

    assert result == Ignore(UUID(EVENT_ID), "order.created", UUID(ORDER_ID))


@pytest.mark.parametrize(
    ("start_at", "expected_type"),
    [
        # The same instant in other offsets: not before the cutoff.
        (datetime(2026, 11, 3, 19, 30, tzinfo=timezone(timedelta(hours=-5))), Event),
        (datetime(2026, 11, 4, 9, 30, tzinfo=timezone(timedelta(hours=9))), Event),
        # Later wall-clock text but an earlier instant, and the reverse.
        (datetime(2026, 11, 4, 8, 0, tzinfo=timezone(timedelta(hours=8))), Event),
        (datetime(2026, 11, 3, 20, 0, tzinfo=timezone(timedelta(hours=-5))), BeforeCutoff),
    ],
)
def test_cutoff_compares_instants_across_offsets(start_at, expected_type) -> None:
    assert type(process(*record(build_envelope()), start_at=start_at)) is expected_type


def test_extreme_occurred_at_compares_without_error() -> None:
    envelope = build_envelope(occurred_at="0001-01-01T00:00:00+14:00")

    assert process(*record(envelope), start_at=START_AT) == before_cutoff()


@pytest.mark.parametrize(
    ("overrides", "record_kwargs", "reason"),
    [
        pytest.param({"schema_version": 2}, {}, "envelope.schema_version: not the integer 1", id="schema"),
        pytest.param({"event_id": "x"}, {}, "envelope.event_id: not a UUID", id="event-id"),
        pytest.param({"correlation_id": "x"}, {}, "envelope.correlation_id: not a UUID", id="correlation"),
        pytest.param({"payload": []}, {}, "envelope.payload: not an object", id="payload"),
        pytest.param(
            {"occurred_at": "2020-01-01T00:00:00"}, {}, "envelope.occurred_at: no timezone", id="naive"
        ),
        pytest.param(
            {"event_type": "credit.reserved"},
            {},
            'envelope.event_type: does not start with "order."',
            id="prefix",
        ),
        pytest.param({}, {"headers": []}, "header.event_type: missing", id="headers"),
        pytest.param({}, {"key": None}, "key: null", id="key"),
    ],
)
def test_transport_failure_before_the_cutoff_is_still_malformed(
    overrides, record_kwargs, reason
) -> None:
    result = process(
        *record(build_envelope(**overrides), **record_kwargs), start_at=AFTER_OCCURRED_AT
    )

    assert_malformed(result, reason)


def test_empty_value_before_the_cutoff_is_still_malformed() -> None:
    assert_malformed(process(ORDER_ID.encode(), b"", [], start_at=AFTER_OCCURRED_AT), "value: empty")


def test_reason_with_nul_after_the_cutoff_is_an_event() -> None:
    result = parse_event("order.rejected", reason="bad\u0000reason")

    assert isinstance(result, Event)
    assert result.drafts[0].params == {"reason": "bad\u0000reason"}


# --- Purity ---


def test_module_imports_only_pure_standard_library() -> None:
    tree = ast.parse(Path(events.__file__).read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imported.add(node.module.split(".")[0])

    assert imported == {"collections", "dataclasses", "datetime", "json", "re", "typing", "uuid"}


def test_parsing_opens_no_sockets_or_files(monkeypatch) -> None:
    def forbidden(*args, **kwargs):
        raise AssertionError("I/O attempted")

    monkeypatch.setattr("socket.socket", forbidden)
    monkeypatch.setattr("builtins.open", forbidden)

    for event_type in HANDLED_TYPES:
        assert isinstance(parse_event(event_type), Event)
