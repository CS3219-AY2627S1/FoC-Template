# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented and debugged pickup, delivery and completion tests.
# Author review: I validated correctness and added boundary checks where needed.

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.orders.errors import ApiError
from app.orders.lifecycle import FULFILMENT, overdue_values, transition_values
from app.orders.outbox import event_payload

NOW = datetime(2030, 1, 1, tzinfo=UTC)
OWNER, COURIER = uuid4(), uuid4()


def row(**changes):
    return {
        "requester_id": OWNER,
        "courier_id": COURIER,
        "state": "ACCEPTED",
        "delivery_deadline": NOW + timedelta(minutes=1),
        "overdue_at": None,
        **changes,
    }


@pytest.mark.parametrize("action", FULFILMENT)
def test_fulfilment_eligible_role_timestamps_and_replay(action):
    source, target, timestamp, role = FULFILMENT[action]
    order = row(state=source)
    result = transition_values(order, order[role], action, NOW)
    assert result == {"state": target, timestamp: NOW}
    assert order["state"] == source
    assert transition_values({**order, **result}, order[role], action, NOW) == {}


@pytest.mark.parametrize("action", FULFILMENT)
@pytest.mark.parametrize("actor", [OWNER, COURIER, uuid4()])
def test_fulfilment_permissions_before_replay(action, actor):
    source, _, timestamp, role = FULFILMENT[action]
    order = row(state=source, **{timestamp: NOW})
    if actor == order[role]:
        assert transition_values(order, actor, action, NOW) == {}
    else:
        with pytest.raises(ApiError) as error:
            transition_values(order, actor, action, NOW)
        assert error.value.status == (403 if actor in (OWNER, COURIER) else 404)


@pytest.mark.parametrize("action", FULFILMENT)
@pytest.mark.parametrize(
    "state",
    ["OPEN", "ACCEPTED", "PICKED_UP", "DELIVERED", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"],
)
def test_no_skips_reversals_or_terminal_changes(action, state):
    source, _, _, role = FULFILMENT[action]
    order = row(state=state)
    if state != source:
        with pytest.raises(ApiError, match="INVALID_TRANSITION"):
            transition_values(order, order[role], action, NOW)


@pytest.mark.parametrize("action", ["pickup", "deliver"])
@pytest.mark.parametrize("offset", [-1, 0, 1])
def test_deadline_equality_and_late_actions_record_overdue_without_blocking(action, offset):
    deadline = NOW + timedelta(seconds=offset)
    order = row(state=FULFILMENT[action][0], delivery_deadline=deadline)
    values = transition_values(order, COURIER, action, NOW)
    assert values.get("overdue_at") == (deadline if offset <= 0 else None)


@pytest.mark.parametrize(
    "state", ["OPEN", "DELIVERED", "COMPLETED", "CANCELLED", "EXPIRED", "FAILED"]
)
def test_overdue_excludes_undeliverable_terminal_and_on_time_delivered_orders(state):
    assert overdue_values(row(state=state, delivery_deadline=NOW), NOW) == {}


def test_overdue_time_never_rewritten():
    previous = NOW - timedelta(seconds=1)
    assert overdue_values(row(delivery_deadline=previous, overdue_at=previous), NOW) == {}


def test_completion_event_only_exposes_required_transfer_identity():
    event = {
        "event_id": uuid4(),
        "order_id": uuid4(),
        "reservation_id": uuid4(),
        "event_type": "order.completed.v1",
        "occurred_at": NOW,
        "requester_id": OWNER,
        "courier_id": COURIER,
        "amount": 5,
        "private": "secret",
    }
    payload = event_payload(event)
    assert payload["amount"] == 5 and payload["courierId"] == str(COURIER)
    assert set(payload) == {
        "eventId",
        "eventType",
        "orderId",
        "reservationId",
        "occurredAt",
        "requesterId",
        "courierId",
        "amount",
    }
