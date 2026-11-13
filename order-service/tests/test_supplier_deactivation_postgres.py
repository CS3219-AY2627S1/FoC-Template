# AI-INFLUENCED: Verify accepted orders survive supplier deactivation on PostgreSQL with Codex.
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.order_event_outbox import OrderEventOutbox
from app.models.orders import OrderTable
from app.schemas.supplier_events import SupplierDeactivatedEvent
from app.services import orders, supplier_deactivation
from app.services.lifecycle import OrderStatus


def _accepted_order() -> OrderTable:
    return OrderTable(
        order_id="order-1",
        name="Lunch",
        details="Bring lunch",
        reward=5,
        deadline=datetime.now(UTC) + timedelta(hours=1),
        supplier_id="supplier-1",
        requester_id="requester-1",
        courier_id="courier-1",
        reservation_id="reservation-1",
        pickup_location="Library",
        delivery_location="Dorm",
        status=OrderStatus.ACCEPTED,
    )


def _fact() -> SupplierDeactivatedEvent:
    return SupplierDeactivatedEvent(
        event_id="fact-1", supplier_id="supplier-1", timestamp=datetime.now(UTC)
    )


async def test_accepted_order_survives_deactivation(postgres_sessions) -> None:
    async with postgres_sessions() as session, session.begin():
        session.add(_accepted_order())

    async with postgres_sessions() as session:
        assert await supplier_deactivation.process_supplier_deactivated(session, _fact()) == 0
    async with postgres_sessions() as session:
        await orders.pickup_order(session, "order-1", "courier-1")

    async with postgres_sessions() as session:
        order = await session.get(OrderTable, "order-1")
        events = (await session.scalars(select(OrderEventOutbox))).all()
    assert order.status == OrderStatus.PICKED_UP
    assert [event.payload["event_type"] for event in events] == ["OrderPickedUp"]
