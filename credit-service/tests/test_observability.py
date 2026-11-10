# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
"""Tests for the observability layer (metrics, readiness).

Counters are process-global, so every assertion here is a *delta* read through
``metrics.metric_value`` — that keeps the tests independent of their order and
of whatever other test modules already recorded.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app
from app.models.task_result import CreditTaskResult, TaskResultKind, TaskResultOutcome
from app.observability import health as broker_health
from app.observability import metrics
from app.schemas.interop import (
    OrderActionEvent,
    OrderApprovalRequestedEvent,
    OrderUpdateRequestedEvent,
)
from app.services import publisher
from app.services.consumer import CreditEventConsumer
from app.services.credit_service import CreditService
from foc_shared.events import OrderEvent, OrderEventType

CLIENT = {"X-User-Id": "user-1", "X-User-Role": "client"}
BALANCE_ROUTE = "/credits/{user_id}/balance"
RESERVE_ROUTE = "/credits/reservations"


@pytest_asyncio.fixture
async def client(monkeypatch) -> AsyncGenerator[TestClient, None]:
    from app import models  # noqa: F401

    # Keep the tests hermetic: the reservation publish path must not try to
    # reach RabbitMQ (it would block for the connect timeout on every request).
    async def _noop(event) -> None:
        return None

    monkeypatch.setattr(publisher, "publish_reservation_event", _noop)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _override() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as s:
            yield s

    app.dependency_overrides[get_session] = _override
    async with maker() as s:
        service = CreditService(s)
        await service.ensure_account("user-1")
        await service.ensure_account("user-2")

    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    from app import models  # noqa: F401

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


def _reserve(client: TestClient, *, amount: int = 30, order_id: str = "order-1"):
    return client.post(
        RESERVE_ROUTE,
        json={"user_id": "user-1", "order_id": order_id, "amount": amount},
        headers=CLIENT,
    )


# ── exposition + HTTP labels ───────────────────────────────────────────────────


def test_metrics_endpoint_renders_prometheus_text(client):
    resp = client.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    assert "credit_http_requests_total" in body
    assert "credit_reservation_ops_total" in body
    assert "credit_consumer_last_message_unixtime" in body


def test_http_metrics_use_route_templates_not_raw_paths(client):
    client.get("/credits/user-1/balance", headers=CLIENT)
    client.get("/credits/user-1/balance", headers=CLIENT)

    rows = metrics.counter_table(metrics.HTTP_REQUESTS)
    matching = [
        row
        for row in rows
        if row.get("route") == BALANCE_ROUTE
        and row.get("method") == "GET"
        and row.get("status") == "200"
    ]
    assert matching and float(matching[0]["value"]) >= 2
    # The concrete user id must never become a label value.
    assert all("user-1" not in str(row.get("route", "")) for row in rows)


def test_health_is_untouched(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_request_id_is_echoed_back(client):
    resp = client.get("/credits/user-1/balance", headers={**CLIENT, "x-request-id": "trace-42"})
    assert resp.headers["x-request-id"] == "trace-42"
    generated = client.get("/credits/user-1/balance", headers=CLIENT)
    assert generated.headers["x-request-id"]


# ── error envelope codes ──────────────────────────────────────────────────────


def test_error_code_is_recorded_for_business_rejection(client):
    before = metrics.metric_value(
        metrics.HTTP_ERRORS, route=RESERVE_ROUTE, code="insufficient_credits"
    )
    resp = _reserve(client, amount=999)
    assert resp.status_code == 409
    assert resp.json()["code"] == "insufficient_credits"
    after = metrics.metric_value(
        metrics.HTTP_ERRORS, route=RESERVE_ROUTE, code="insufficient_credits"
    )
    assert after == before + 1


def test_error_code_is_recorded_for_validation_errors(client):
    before = metrics.metric_value(metrics.HTTP_ERRORS, route=RESERVE_ROUTE, code="validation_error")
    resp = client.post(
        RESERVE_ROUTE,
        json={"user_id": "user-1", "order_id": "order-1", "amount": 0},
        headers=CLIENT,
    )
    assert resp.status_code == 422
    after = metrics.metric_value(metrics.HTTP_ERRORS, route=RESERVE_ROUTE, code="validation_error")
    assert after == before + 1


# ── business counters ────────────────────────────────────────────────────────


def test_duplicate_reservation_is_suppressed_not_counted_as_accepted(client):
    accepted_before = metrics.metric_value(metrics.RESERVATION_OPS, outcome="accepted")
    dup_before = metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="reservation")

    first = _reserve(client, amount=30, order_id="order-dup")
    second = _reserve(client, amount=30, order_id="order-dup")

    assert first.status_code == 201
    assert second.status_code in (200, 201)
    assert first.json()["id"] == second.json()["id"]
    assert metrics.metric_value(metrics.RESERVATION_OPS, outcome="accepted") == accepted_before + 1
    assert metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="reservation") == dup_before + 1


def test_conflicting_reservation_counts_conflict(client):
    _reserve(client, amount=30, order_id="order-conflict")
    before = metrics.metric_value(metrics.RESERVATION_OPS, outcome="conflict")
    resp = _reserve(client, amount=40, order_id="order-conflict")
    assert resp.status_code == 409
    assert metrics.metric_value(metrics.RESERVATION_OPS, outcome="conflict") == before + 1


def test_transfer_and_release_outcomes_are_counted(client):
    created = _reserve(client, amount=20, order_id="order-counted").json()
    transfer_before = metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok")
    client.post(
        f"/credits/reservations/{created['id']}/transfer",
        json={"courier_id": "user-2"},
        headers=CLIENT,
    )
    assert metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok") == transfer_before + 1

    released = _reserve(client, amount=10, order_id="order-released").json()
    release_before = metrics.metric_value(metrics.RELEASE_OPS, outcome="ok")
    client.post(f"/credits/reservations/{released['id']}/release", headers=CLIENT)
    assert metrics.metric_value(metrics.RELEASE_OPS, outcome="ok") == release_before + 1


async def test_saga_retries_exhausted_is_counted(session, monkeypatch):
    async def _noop(event) -> None:
        return None

    monkeypatch.setattr(publisher, "publish_credit_event", _noop)
    event = OrderActionEvent(
        event_type="OrderDeletionRequested",
        task_id="task-exhausted",
        order_id="order-x",
        reservation_id="reservation-x",
        requester_id="user-1",
        timestamp=datetime.now(UTC),
    )
    before = metrics.metric_value(metrics.SAGA_RETRIES_EXHAUSTED, kind="release")
    await CreditService(session).report_release_retries_exhausted(event, RuntimeError("boom"))
    assert metrics.metric_value(metrics.SAGA_RETRIES_EXHAUSTED, kind="release") == before + 1


# ── success counters follow the commit ──────────────────────────────────────


@pytest.fixture
def quiet_publisher(monkeypatch):
    async def _noop(event) -> None:
        return None

    monkeypatch.setattr(publisher, "publish_credit_event", _noop)
    monkeypatch.setattr(publisher, "publish_reservation_event", _noop)


async def _seed(session) -> tuple[CreditService, str]:
    service = CreditService(session)
    await service.ensure_account("requester")
    await service.ensure_account("courier")
    reservation = await service.reserve(user_id="requester", order_id="order-1", amount=40)
    return service, reservation.id


async def _lose_the_save_race(session, service, kind: TaskResultKind, task_id: str) -> None:
    """Another worker stored this task's outcome after our pre-check ran."""
    session.add(
        CreditTaskResult(
            task_id=task_id,
            kind=kind.value,
            reservation_id="other",
            order_id="other",
            requester_id="requester",
            outcome=TaskResultOutcome.RELEASED.value,
        )
    )
    await session.commit()
    session.expunge_all()

    original = service._task_results.get
    calls = {"n": 0}

    async def _first_call_misses(key):
        calls["n"] += 1
        return None if calls["n"] == 1 else await original(key)

    service._task_results.get = _first_call_misses


def _release_request(reservation_id: str) -> OrderActionEvent:
    return OrderActionEvent(
        event_type="OrderDeletionRequested",
        task_id="task-rel",
        order_id="order-1",
        reservation_id=reservation_id,
        requester_id="requester",
        timestamp=datetime.now(UTC),
    )


def _update_request(reservation_id: str, reward: int) -> OrderUpdateRequestedEvent:
    return OrderUpdateRequestedEvent(
        task_id="task-upd",
        order_id="order-1",
        reservation_id=reservation_id,
        requester_id="requester",
        reward=reward,
        timestamp=datetime.now(UTC),
    )


def _approval_request(reservation_id: str) -> OrderApprovalRequestedEvent:
    return OrderApprovalRequestedEvent(
        task_id="task-apr",
        order_id="order-1",
        reservation_id=reservation_id,
        requester_id="requester",
        courier_id="courier",
        timestamp=datetime.now(UTC),
    )


async def test_release_request_counts_success_once_committed(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    before = metrics.metric_value(metrics.RELEASE_OPS, outcome="ok")

    await service.handle_release_requested(_release_request(reservation_id))

    assert metrics.metric_value(metrics.RELEASE_OPS, outcome="ok") == before + 1


async def test_release_request_not_counted_when_save_loses_race(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    await _lose_the_save_race(session, service, TaskResultKind.RELEASE, "task-rel")
    before = metrics.metric_value(metrics.RELEASE_OPS, outcome="ok")
    dup_before = metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result")

    await service.handle_release_requested(_release_request(reservation_id))

    assert metrics.metric_value(metrics.RELEASE_OPS, outcome="ok") == before
    assert metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result") == dup_before + 1


async def test_update_request_counts_amended_once_committed(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    before = metrics.metric_value(metrics.AMENDMENT_OPS, outcome="amended")

    await service.handle_update_requested(_update_request(reservation_id, reward=55))

    assert metrics.metric_value(metrics.AMENDMENT_OPS, outcome="amended") == before + 1


async def test_update_request_counts_unchanged_once_committed(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    before = metrics.metric_value(metrics.AMENDMENT_OPS, outcome="unchanged")

    await service.handle_update_requested(_update_request(reservation_id, reward=40))

    assert metrics.metric_value(metrics.AMENDMENT_OPS, outcome="unchanged") == before + 1


async def test_update_request_not_counted_when_save_loses_race(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    await _lose_the_save_race(session, service, TaskResultKind.AMEND, "task-upd")
    amended_before = metrics.metric_value(metrics.AMENDMENT_OPS, outcome="amended")
    unchanged_before = metrics.metric_value(metrics.AMENDMENT_OPS, outcome="unchanged")

    dup_before = metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result")
    await service.handle_update_requested(_update_request(reservation_id, reward=55))

    assert metrics.metric_value(metrics.AMENDMENT_OPS, outcome="amended") == amended_before
    assert metrics.metric_value(metrics.AMENDMENT_OPS, outcome="unchanged") == unchanged_before
    assert metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result") == dup_before + 1


async def test_approval_request_counts_transfer_once_committed(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    before = metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok")

    await service.handle_approval_requested(_approval_request(reservation_id))

    assert metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok") == before + 1


async def test_approval_request_not_counted_when_save_loses_race(session, quiet_publisher):
    service, reservation_id = await _seed(session)
    await _lose_the_save_race(session, service, TaskResultKind.TRANSFER, "task-apr")
    before = metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok")

    dup_before = metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result")
    await service.handle_approval_requested(_approval_request(reservation_id))

    assert metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok") == before
    assert metrics.metric_value(metrics.DUPLICATE_SUPPRESSED, op="task_result") == dup_before + 1


async def test_release_request_on_released_reservation_counts_only_already_released(
    session, quiet_publisher
):
    service, reservation_id = await _seed(session)
    await service.release_for_order("order-1")
    ok_before = metrics.metric_value(metrics.RELEASE_OPS, outcome="ok")
    already_before = metrics.metric_value(metrics.RELEASE_OPS, outcome="already_released")

    await service.handle_release_requested(_release_request(reservation_id))

    assert metrics.metric_value(metrics.RELEASE_OPS, outcome="ok") == ok_before
    assert (
        metrics.metric_value(metrics.RELEASE_OPS, outcome="already_released") == already_before + 1
    )


async def test_approval_request_on_transferred_reservation_counts_only_already_transferred(
    session, quiet_publisher
):
    service, reservation_id = await _seed(session)
    await service.transfer_for_order("order-1", "courier")
    ok_before = metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok")
    already_before = metrics.metric_value(metrics.TRANSFER_OPS, outcome="already_transferred")

    await service.handle_approval_requested(_approval_request(reservation_id))

    assert metrics.metric_value(metrics.TRANSFER_OPS, outcome="ok") == ok_before
    assert (
        metrics.metric_value(metrics.TRANSFER_OPS, outcome="already_transferred")
        == already_before + 1
    )


# ── consumer metrics ─────────────────────────────────────────────────────────


class _FakeMessage:
    def __init__(self, body: bytes, *, routing_key: str = "OrderCompleted") -> None:
        self.body = body
        self.routing_key = routing_key
        self.headers: dict = {}
        self.acked = False

    async def ack(self) -> None:
        self.acked = True

    async def nack(self, requeue: bool | None = None) -> None:
        raise AssertionError(f"unexpected nack (requeue={requeue})")


async def test_consumer_records_messages_and_freshness():
    event = OrderEvent(
        event_type=OrderEventType.ORDER_COMPLETED,
        order_id="order-consumer",
        requester_id="user-1",
        courier_id="user-2",
        timestamp=datetime.now(UTC),
    )

    async def _noop(event) -> None:
        return None

    queue = "credit-service.order-events"
    before = metrics.metric_value(metrics.CONSUMER_MESSAGES, queue=queue, result="ok")
    message = _FakeMessage(event.model_dump_json().encode())
    await CreditEventConsumer()._dispatch(message, model=OrderEvent, handler=_noop, queue=queue)

    assert message.acked is True
    assert metrics.metric_value(metrics.CONSUMER_MESSAGES, queue=queue, result="ok") == before + 1
    last = metrics.metric_value(metrics.CONSUMER_LAST_MESSAGE, queue=queue)
    assert last > 0


# ── readiness ───────────────────────────────────────────────────────────────


def test_readiness_reports_degraded_when_broker_is_down(client):
    broker_health.set_broker_state(False, "not connected")
    resp = client.get("/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["broker"] == "unavailable"


def test_readiness_is_ready_when_broker_is_connected(client):
    broker_health.set_broker_state(True)
    try:
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ready"
    finally:
        broker_health.set_broker_state(False, "test finished")
