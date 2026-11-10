# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented and debugged creation persistence and concurrency tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Writes only to an explicitly opted-in disposable Order test database."""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.db import Database
from app.orders.repository import OrderRepository
from app.orders.schemas import CreateOrder, OpenQuery
from app.orders.service import CreationService, digest, request_digest
from app.orders.tables import history, operations, orders
from tests.order_fakes import FakeClients
from tests.test_order_contracts import body_json

pytestmark = pytest.mark.integration


@pytest.fixture
async def real():
    url = os.environ.get("ORDER_WRITE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set ORDER_WRITE_TEST_DATABASE_URL to a disposable migrated database")
    database = Database(url)
    repo = OrderRepository(database.session_context)
    clients = FakeClients(uuid4())
    try:
        yield repo, clients, database
    finally:
        # Rows intentionally remain for inspection; caller owns this disposable test database.
        await database.dispose()


async def intent(repo, clients):
    body = CreateOrder.model_validate(body_json())
    op = await repo.begin(
        clients.actor,
        digest(str(uuid4())),
        request_digest(body),
        body,
        await clients.supplier(body.supplier_id, "test"),
    )
    return body, op


async def test_concurrent_same_key_has_one_order_and_history(real):
    repo, clients, database = real
    service = CreationService(repo, clients)
    body = CreateOrder.model_validate(body_json())
    results = await asyncio.gather(
        *[service.create(clients.actor, "test", "concurrent", body) for _ in range(10)]
    )
    assert all(status in (200, 201, 202) for status, _ in results)
    status, response = await service.create(clients.actor, "test", "concurrent", body)
    assert status == 200
    async with database.session_context() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(orders)
                .where(
                    orders.c.requester_id == clients.actor,
                )
            )
            == 1
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(history)
                .where(
                    history.c.order_id == response["orderId"],
                )
            )
            == 1
        )
    assert len(clients.reservations) == 1


async def test_crash_after_reserve_then_worker_and_retry(real):
    repo, clients, database = real
    body, op = await intent(repo, clients)
    claim = await repo.claim(op["id"])
    claim = await repo.change(claim, stage="RESERVATION_UNKNOWN")
    await clients.credit("reserve", claim)
    # Simulate dead worker's persisted expired lease, not an in-memory reset.
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(operations)
            .where(operations.c.id == op["id"])
            .values(
                lease_until=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    restarted = OrderRepository(database.session_context)
    await CreationService(restarted, clients).recover(op["id"])
    assert (await restarted.operation(op["id"]))["stage"] == "READY_TO_FINALIZE"
    assert await restarted.order(op["order_id"]) is None
    claim = await restarted.claim(op["id"])
    reservation = clients.reservations[op["order_id"]]
    assert await restarted.finalize(claim, reservation.reservation_id, op["supplier_snapshot"])
    assert (await restarted.operation(op["id"]))["stage"] == "SUCCEEDED"


async def test_expired_operation_releases_and_fences_delayed_reserve(real):
    repo, clients, database = real
    body, op = await intent(repo, clients)
    await clients.credit("reserve", op)
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(operations)
            .where(operations.c.id == op["id"])
            .values(
                acceptance_deadline=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    await CreationService(repo, clients).recover(op["id"])
    assert (await repo.operation(op["id"]))["stage"] == "ABORTED"
    assert op["order_id"] not in clients.reservations
    from app.orders.errors import ApiError

    with pytest.raises(ApiError):
        await clients.credit("reserve", op)
    assert await repo.order(op["order_id"]) is None


async def test_stale_lease_cannot_finalize_or_abort(real):
    repo, clients, database = real
    _, op = await intent(repo, clients)
    old = await repo.claim(op["id"])
    old = await repo.change(old, stage="RESERVATION_UNKNOWN")
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(operations)
            .where(operations.c.id == op["id"])
            .values(
                lease_until=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    new = await repo.claim(op["id"])
    assert new["lease_token"] != old["lease_token"]
    assert not await repo.finalize(old, uuid4(), op["supplier_snapshot"])
    assert await repo.change(old, stage="ABORTING") is None
    assert (await repo.operation(op["id"]))["stage"] == "RESERVATION_UNKNOWN"


async def test_finalization_rolls_back_all_three_records(real):
    repo, clients, database = real
    _, op = await intent(repo, clients)
    claim = await repo.claim(op["id"])
    claim = await repo.change(claim, stage="RESERVATION_UNKNOWN")
    # Violate a DB constraint deliberately inside finalization: no history/success can escape.
    async with database.session_context() as session, session.begin():
        payload = dict(op["payload"], reward=0)
        await session.execute(
            update(operations)
            .where(operations.c.id == op["id"])
            .values(
                payload=payload,
            )
        )
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        await repo.finalize(claim, uuid4(), op["supplier_snapshot"])
    assert await repo.order(op["order_id"]) is None
    assert (await repo.operation(op["id"]))["stage"] == "RESERVATION_UNKNOWN"


async def test_db_constraints_and_least_privilege(real):
    repo, clients, database = real
    async with database.session_context() as session:
        assert not await session.scalar(
            text(
                "SELECT has_table_privilege('order_service_app', "
                "'order_service.order_history', 'UPDATE')"
            )
        )
        assert not await session.scalar(
            text(
                "SELECT has_table_privilege('order_service_app', 'order_service.orders', 'DELETE')"
            )
        )
    service = CreationService(repo, clients)
    _, result = await service.create(
        clients.actor, "test", "constraint", CreateOrder.model_validate(body_json())
    )
    async with database.session_context() as session:
        with pytest.raises(IntegrityError):
            async with session.begin():
                await session.execute(
                    update(orders)
                    .where(orders.c.id == result["orderId"])
                    .values(courier_id=clients.actor)
                )


async def test_available_filter_and_supplier_snapshot_survive_dependency_change(real):
    repo, clients, database = real
    body = CreateOrder.model_validate(body_json())
    _, result = await CreationService(repo, clients).create(clients.actor, "test", "query", body)
    query = OpenQuery.model_validate({"supplierId": str(body.supplier_id)})
    rows, total = await repo.list_orders(query, available=True)
    assert total == 1
    assert rows[0]["supplier_snapshot"]["name"] == "Cafe"
    async with database.session_context() as session, session.begin():
        now = datetime.now(UTC)
        await session.execute(
            update(orders)
            .where(orders.c.id == result["orderId"])
            .values(
                created_at=now - timedelta(hours=2),
                acceptance_deadline=now - timedelta(hours=1),
            )
        )
    assert (await repo.list_orders(query, available=True))[1] == 0
    assert (await repo.order(result["orderId"]))["supplier_snapshot"]["name"] == "Cafe"


async def test_failure_after_order_insert_rolls_back_history_and_success(real, monkeypatch):
    repo, clients, database = real
    _, op = await intent(repo, clients)
    claim = await repo.claim(op["id"])
    claim = await repo.change(claim, stage="RESERVATION_UNKNOWN")

    def failing_session():
        session = database.session_context()
        original = session.execute

        async def execute(statement, *args, **kwargs):
            if getattr(statement, "table", None) is history:
                # Observe insertion in this transaction, then simulate storage failure.
                assert (
                    await session.scalar(
                        select(func.count())
                        .select_from(orders)
                        .where(
                            orders.c.id == op["order_id"],
                        )
                    )
                    == 1
                )
                raise SQLAlchemyError("simulated history failure")
            return await original(statement, *args, **kwargs)

        monkeypatch.setattr(session, "execute", execute)
        return session

    with pytest.raises(SQLAlchemyError):
        await OrderRepository(failing_session).finalize(claim, uuid4(), op["supplier_snapshot"])
    assert await repo.order(op["order_id"]) is None
    assert (await repo.operation(op["id"]))["stage"] == "RESERVATION_UNKNOWN"


async def test_lost_response_after_commit_replays_without_second_reservation(real, monkeypatch):
    repo, clients, database = real
    body = CreateOrder.model_validate(body_json())
    original = repo.finalize

    async def commit_then_disconnect(*args):
        assert await original(*args)
        raise SQLAlchemyError("simulated lost commit acknowledgment")

    monkeypatch.setattr(repo, "finalize", commit_then_disconnect)
    with pytest.raises(SQLAlchemyError):
        await CreationService(repo, clients).create(clients.actor, "test", "lost-response", body)
    restarted = OrderRepository(database.session_context)
    status, result = await CreationService(restarted, clients).create(
        clients.actor,
        "test",
        "lost-response",
        body,
    )
    assert status == 200
    assert clients.reserve_calls == 1
    assert (await restarted.order(result["orderId"]))["state"] == "OPEN"


async def test_real_database_http_create_and_query(real):
    from httpx import ASGITransport, AsyncClient

    from app.core.config import Settings
    from app.main import create_app

    repo, clients, database = real
    app = create_app(Settings(_env_file=None), database, clients=clients, repository=repo)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as http:
            response = await http.post(
                "/v1/orders", json=body_json(), headers={"Idempotency-Key": "real-http"}
            )
            assert response.status_code == 201, response.text
            order_id = response.json()["orderId"]
            assert (await http.get("/v1/orders/mine?relationship=requester")).json()["total"] == 1
            assert (await http.get(f"/v1/orders/{order_id}/history")).json()["total"] == 1
            assert (await http.get(f"/v1/orders/{order_id}")).json()["requesterId"] == str(
                clients.actor
            )
