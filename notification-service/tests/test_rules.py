from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.events import NotificationSourceEvent
from app.services.rules import build_notifications

TS = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def _event(**overrides) -> NotificationSourceEvent:
    base = {
        "event_type": "OrderAccepted",
        "order_id": "order-1234-5678",
        "requester_id": "requester-1",
        "timestamp": TS,
        "order_name": "Chicken rice",
    }
    base.update(overrides)
    return NotificationSourceEvent(**base)


def test_order_accepted_notifies_requester_F2_1():
    drafts = build_notifications(_event(event_type="OrderAccepted"), "evt-1")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "ACCEPTED"
    assert drafts[0].title == "Courier found"
    assert drafts[0].body == 'A courier accepted "Chicken rice".'
    assert drafts[0].created_at == TS


def test_order_picked_up_F2_2():
    drafts = build_notifications(_event(event_type="OrderPickedUp"), "evt-2")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "PICKED_UP"
    assert drafts[0].body == '"Chicken rice" has been picked up.'


def test_order_delivered_F2_3():
    drafts = build_notifications(_event(event_type="OrderDelivered"), "evt-3")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "AWAITING_APPROVAL"
    assert drafts[0].body == '"Chicken rice" was delivered and is awaiting your approval.'


def test_order_approved_notifies_both_F2_4_F3_2():
    event = _event(event_type="OrderApproved", courier_id="courier-9")
    drafts = build_notifications(event, "evt-4")
    assert [d.recipient_id for d in drafts] == ["requester-1", "courier-9"]
    assert {d.order_status for d in drafts} == {"COMPLETED"}
    assert drafts[0].body == 'Your order "Chicken rice" is complete.'
    assert drafts[1].body == 'Your delivery of "Chicken rice" was approved.'


def test_order_completed_without_courier_notifies_requester_only():
    drafts = build_notifications(_event(event_type="OrderCompleted"), "evt-4b")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "COMPLETED"


def test_courier_withdrawn_F2_5():
    drafts = build_notifications(_event(event_type="CourierWithdrawn"), "evt-5")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "OPEN"
    assert drafts[0].body == 'The courier withdrew from "Chicken rice"; it is open again.'


def test_order_expired_F2_6():
    drafts = build_notifications(_event(event_type="OrderExpired"), "evt-6")
    assert [d.recipient_id for d in drafts] == ["requester-1"]
    assert drafts[0].order_status == "EXPIRED"
    assert drafts[0].body == '"Chicken rice" expired without being accepted.'


def test_requester_cancel_notifies_courier_F3_1():
    event = _event(
        event_type="OrderCancelled",
        courier_id="courier-9",
        reason="Changed my mind",
    )
    drafts = build_notifications(event, "evt-7")
    assert [d.recipient_id for d in drafts] == ["courier-9"]
    assert drafts[0].order_status == "CANCELLED"
    assert drafts[0].body == 'The requester cancelled "Chicken rice". Reason: Changed my mind'


def test_requester_cancel_without_courier_is_noop():
    event = _event(event_type="OrderCancelled", reason="Changed my mind")
    assert build_notifications(event, "evt-8") == []


def test_supplier_deactivation_notifies_both_F4_1():
    event = _event(
        event_type="OrderCancelled",
        courier_id="courier-9",
        reason="Supplier supplier-42 deactivated.",
    )
    drafts = build_notifications(event, "evt-9")
    assert [d.recipient_id for d in drafts] == ["requester-1", "courier-9"]
    assert {d.order_status for d in drafts} == {"CANCELLED"}


def test_supplier_deactivation_message_hides_supplier_id_F4_1_1():
    event = _event(
        event_type="OrderCancelled",
        courier_id="courier-9",
        reason="Supplier supplier-42 deactivated.",
    )
    drafts = build_notifications(event, "evt-10")
    for d in drafts:
        assert "supplier-42" not in d.body
        assert "Supplier supplier-42 deactivated." not in d.body
        assert d.body == '"Chicken rice" was cancelled because the supplier was deactivated.'


def test_missing_order_name_falls_back_to_order_id():
    event = _event(event_type="OrderAccepted", order_name=None)
    drafts = build_notifications(event, "evt-11")
    assert drafts[0].order_name == "Order order-12"
    assert drafts[0].body == 'A courier accepted "Order order-12".'


def test_unknown_event_type_is_noop():
    assert build_notifications(_event(event_type="SomethingElse"), "evt-12") == []
