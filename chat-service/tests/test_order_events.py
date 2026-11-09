# AI-influenced: order-event integration tests written with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Order lifecycle facts -> order chats (app/integrations/order_events.py)."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from sqlalchemy import func, select

from app.db import make_engine, make_sessionmaker
from app.integrations.order_events import (
    OrderEventConsumer,
    OrderFact,
    apply_order_event,
    conversation_key,
)
from app.models.processed_events import ProcessedEvent
from app.realtime.broker import LocalBroker
from app.realtime.hub import Hub
from app.state import AppState
from tests.conftest import make_settings, truncate_all


@pytest.fixture
async def state() -> AsyncIterator[AppState]:
    settings = make_settings()
    await truncate_all()
    engine = make_engine(settings.database_url)
    hub = Hub()
    yield AppState(settings, make_sessionmaker(engine), hub, LocalBroker(hub))
    await engine.dispose()


REQUESTER = str(uuid.uuid4())
COURIER = str(uuid.uuid4())
ORDER = "8f14e45f-ceea-467a-9575-0123456789ab"


def fact(event_type: str, *, courier_id: str | None = COURIER, **extra: Any) -> OrderFact:
    return OrderFact(
        event_type=event_type,
        order_id=ORDER,
        requester_id=REQUESTER,
        courier_id=courier_id,
        **extra,
    )


async def apply(state: AppState, f: OrderFact, event_id: str | None = None) -> bool:
    eid = event_id or str(uuid.uuid4())
    return await state.run(lambda s: apply_order_event(s, f, event_id=eid, retention_days=30))


async def order_chat(state: AppState) -> dict[str, Any] | None:
    found = await state.run(
        lambda s: s.find_conversations(unique_key=conversation_key(ORDER), metadata=None)
    )
    return found[0] if found else None


async def system_keys(state: AppState, user_id: str) -> list[str]:
    conv = await order_chat(state)
    assert conv is not None
    page = await state.run(lambda s: s.history(uuid.UUID(user_id), uuid.UUID(conv["id"])))
    return [m["payload"]["key"] for m in page["messages"] if m["kind"] == "system"]


async def test_accept_opens_a_chat_for_requester_and_courier(state: AppState) -> None:
    assert await apply(state, fact("OrderAccepted"), "evt-1") is True
    conv = await order_chat(state)
    assert conv is not None
    assert conv["metadata"] == {"order_id": ORDER} and conv["kind"] == "group"
    assert {(m["user_id"], m["label"]) for m in conv["members"]} == {
        (REQUESTER, "requester"),
        (COURIER, "courier"),
    }
    assert await system_keys(state, REQUESTER) == ["order.accepted"]

    # Redelivery of the same event changes nothing.
    assert await apply(state, fact("OrderAccepted"), "evt-1") is False
    assert await system_keys(state, REQUESTER) == ["order.accepted"]
    async with state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(ProcessedEvent)) == 1


async def test_progress_events_post_system_messages(state: AppState) -> None:
    # Even without the accept event (e.g. chat deployed mid-order) the chat appears.
    await apply(state, fact("OrderPickedUp"))
    await apply(state, fact("OrderDelivered"))
    assert await system_keys(state, COURIER) == ["order.picked_up", "order.delivered"]


async def test_withdrawn_courier_leaves_and_next_courier_starts_without_history(
    state: AppState,
) -> None:
    await apply(state, fact("OrderAccepted"))
    await apply(state, fact("CourierWithdrawn"))
    conv = await order_chat(state)
    assert conv is not None
    assert [m["user_id"] for m in conv["members"]] == [REQUESTER]

    second = str(uuid.uuid4())
    await apply(state, fact("OrderAccepted", courier_id=second))
    conv = await order_chat(state)
    assert conv is not None
    members = {m["user_id"]: m for m in conv["members"]}
    assert set(members) == {REQUESTER, second}
    assert members[second]["history_from_seq"] > 0
    # The new courier only sees what happened after joining.
    assert await system_keys(state, second) == ["member_added", "order.accepted"]
    assert "order.courier_withdrawn" in await system_keys(state, REQUESTER)


@pytest.mark.parametrize(
    ("event_type", "key"),
    [("OrderApproved", "order.completed"), ("OrderCancelled", "order.cancelled")],
)
async def test_terminal_events_close_the_chat_and_schedule_purge(
    state: AppState, event_type: str, key: str
) -> None:
    await apply(state, fact("OrderAccepted"))
    await apply(state, fact(event_type, reason="Changed my mind"))
    conv = await order_chat(state)
    assert conv is not None and conv["closed_at"] and conv["purge_after"]
    keys = await system_keys(state, REQUESTER)
    assert keys[-2:] == [key, "conversation_closed"]

    # Late events after closing are ignored instead of failing.
    await apply(state, fact("OrderDelivered"))
    assert await system_keys(state, REQUESTER) == keys


async def test_closed_chats_are_kept_by_default(state: AppState) -> None:
    assert state.settings.chat_closed_retention_days == 0
    days = state.settings.chat_closed_retention_days
    await apply(state, fact("OrderAccepted"))
    await state.run(
        lambda s: apply_order_event(
            s, fact("OrderApproved"), event_id=str(uuid.uuid4()), retention_days=days
        )
    )
    conv = await order_chat(state)
    assert conv is not None and conv["closed_at"] and conv["purge_after"] is None


async def test_cancellation_reason_reaches_the_chat(state: AppState) -> None:
    await apply(state, fact("OrderAccepted"))
    await apply(state, fact("OrderCancelled", reason="Supplier closed"))
    conv = await order_chat(state)
    assert conv is not None
    page = await state.run(lambda s: s.history(uuid.UUID(REQUESTER), uuid.UUID(conv["id"])))
    cancelled = next(m for m in page["messages"] if m["payload"]["key"] == "order.cancelled")
    assert cancelled["payload"]["params"] == {"order_id": ORDER, "reason": "Supplier closed"}


async def test_events_without_a_chat_or_unknown_types_are_no_ops(state: AppState) -> None:
    assert await apply(state, fact("OrderExpired", courier_id=None)) is True
    assert await apply(state, fact("OrderCancelled", courier_id=None)) is True
    assert await apply(state, fact("OrderDeletionRequested", courier_id=None)) is True
    assert await order_chat(state) is None


class FakeMessage:
    def __init__(self, body: bytes, message_id: str | None = "m1") -> None:
        self.body = body
        self.message_id = message_id
        self.headers: dict[str, Any] = {}
        self.routing_key = "OrderAccepted"
        self.outcome: str | None = None

    async def ack(self) -> None:
        self.outcome = "ack"

    async def nack(self, requeue: bool = True) -> None:
        self.outcome = f"nack(requeue={requeue})"

    async def reject(self, requeue: bool = False) -> None:
        self.outcome = f"reject(requeue={requeue})"


def body(**overrides: Any) -> bytes:
    payload = {
        "event_type": "OrderAccepted",
        "order_id": ORDER,
        "requester_id": REQUESTER,
        "courier_id": COURIER,
        "timestamp": "2026-11-07T12:00:00Z",
    }
    payload.update(overrides)
    return json.dumps(payload).encode()


async def test_consumer_acks_applied_and_duplicate_events(state: AppState) -> None:
    consumer = OrderEventConsumer(state)
    first, again = FakeMessage(body(), "evt-9"), FakeMessage(body(), "evt-9")
    await consumer.handle(first)
    await consumer.handle(again)
    assert (first.outcome, again.outcome) == ("ack", "ack")
    assert await system_keys(state, REQUESTER) == ["order.accepted"]


async def test_consumer_drops_malformed_events_and_ignores_bad_ids(state: AppState) -> None:
    consumer = OrderEventConsumer(state)
    malformed = FakeMessage(b'{"event_type": "OrderAccepted"}')
    await consumer.handle(malformed)
    assert malformed.outcome == "reject(requeue=False)"

    bad_id = FakeMessage(body(courier_id="not-a-uuid"))
    await consumer.handle(bad_id)
    assert bad_id.outcome == "ack"
    assert await order_chat(state) is None


def parking_consumer(state: AppState) -> tuple[OrderEventConsumer, list[tuple[str, str]]]:
    """A consumer whose dead queue is a list of (message id, reason)."""
    consumer = OrderEventConsumer(state)
    parked: list[tuple[str, str]] = []

    async def park(message: Any, reason: str) -> None:
        parked.append((message.message_id, reason))

    consumer._park = park
    return consumer, parked


async def test_a_failing_event_is_parked_after_the_retry_limit(
    state: AppState, monkeypatch
) -> None:
    consumer, parked = parking_consumer(state)
    calls = 0

    async def broken(op):
        nonlocal calls
        calls += 1
        raise RuntimeError("bug in a handler")

    monkeypatch.setattr(state, "run", broken)
    monkeypatch.setattr("app.integrations.order_events.asyncio.sleep", _no_sleep)
    msg = FakeMessage(body(), "evt-bad")
    await consumer.handle(msg)  # returns, so the events behind it are not blocked
    assert calls == state.settings.chat_order_event_retry_limit == 5
    assert msg.outcome == "ack"
    assert parked == [("evt-bad", "RuntimeError: bug in a handler")]


async def test_a_transient_failure_is_retried_in_place(state: AppState, monkeypatch) -> None:
    consumer, parked = parking_consumer(state)
    real_run, failures = state.run, [RuntimeError("blip")]

    async def flaky(op):
        if failures:
            raise failures.pop()
        return await real_run(op)

    monkeypatch.setattr(state, "run", flaky)
    monkeypatch.setattr("app.integrations.order_events.asyncio.sleep", _no_sleep)
    msg = FakeMessage(body())
    await consumer.handle(msg)
    assert (msg.outcome, parked) == ("ack", [])
    assert await order_chat(state) is not None


async def test_database_outages_do_not_use_up_the_retry_limit(state: AppState, monkeypatch) -> None:
    consumer, parked = parking_consumer(state)
    real_run = state.run
    outage = [ConnectionRefusedError("db down")] * 8  # more than the retry limit

    async def down_then_up(op):
        if outage:
            raise outage.pop()
        return await real_run(op)

    monkeypatch.setattr(state, "run", down_then_up)
    monkeypatch.setattr("app.integrations.order_events.asyncio.sleep", _no_sleep)
    msg = FakeMessage(body())
    await consumer.handle(msg)
    assert (msg.outcome, parked) == ("ack", [])
    assert await order_chat(state) is not None


async def test_malformed_events_go_to_the_dead_queue(state: AppState) -> None:
    consumer, parked = parking_consumer(state)
    msg = FakeMessage(b'{"event_type": "OrderAccepted"}', "evt-junk")
    await consumer.handle(msg)
    assert msg.outcome == "ack"
    assert [mid for mid, _ in parked] == ["evt-junk"]
    assert parked[0][1].startswith("malformed")


async def _no_sleep(_: float) -> None:
    return None
