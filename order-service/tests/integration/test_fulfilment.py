# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented and debugged pickup, delivery and completion tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Opt-in DB/HTTP completion and overdue tests; never run on development data."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text, update
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.main import create_app
from app.orders.errors import ApiError
from app.orders.lifecycle_repository import LifecycleRepository
from app.orders.tables import orders
from tests.integration.test_lifecycle import TokenIdentity, snapshot
from tests.integration.test_lifecycle import lifecycle_db as _lifecycle_database  # noqa: F401

pytestmark = pytest.mark.integration


async def accepted(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, owner = await seed()
    courier = uuid4()
    await repo.transition(order_id, courier, "accept")
    return database, repo, order_id, owner, courier


async def make_due(database, order_id):
    now = datetime.now(UTC)
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(orders)
            .where(orders.c.id == order_id)
            .values(
                accepted_at=now - timedelta(hours=1),
                acceptance_deadline=now - timedelta(minutes=30),
                delivery_deadline=now - timedelta(seconds=1),
            )
        )


async def test_full_http_journey_and_100_completion_retries(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    app = create_app(
        Settings(_env_file=None), database, clients=TokenIdentity(), lifecycle_repository=repo
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as http:
            path = f"/v1/orders/{order_id}"
            for action, actor, target in [
                ("pickup", courier, "PICKED_UP"),
                ("deliver", courier, "DELIVERED"),
                ("complete", owner, "COMPLETED"),
            ]:
                before = await snapshot(database, order_id)
                wrong_actor = courier if actor == owner else owner
                rejected = await http.post(
                    path + "/" + action, headers={"Authorization": f"Bearer {wrong_actor}"}
                )
                assert rejected.status_code == 403
                assert await snapshot(database, order_id) == before
                response = await http.post(
                    path + "/" + action, headers={"Authorization": f"Bearer {actor}"}
                )
                assert response.status_code == 200 and response.json()["state"] == target
            before = await snapshot(database, order_id)
            results = await asyncio.gather(
                *[
                    http.post(path + "/complete", headers={"Authorization": f"Bearer {owner}"})
                    for _ in range(100)
                ]
            )
            assert all(result.status_code == 200 for result in results)
            assert await snapshot(database, order_id) == before
            saved, history, events = before
            assert [item["new_state"] for item in history] == [
                "OPEN",
                "ACCEPTED",
                "PICKED_UP",
                "DELIVERED",
                "COMPLETED",
            ]
            assert (
                saved["accepted_at"]
                <= saved["picked_up_at"]
                <= saved["delivered_at"]
                <= saved["completed_at"]
            )
            assert len(events) == 1 and events[0]["event_type"] == "order.completed.v1"
            assert events[0]["courier_id"] == courier and events[0]["amount"] == saved["reward"]
            assert events[0]["state"] == "PENDING"  # No Credit/broker dependency to commit.
            for action in ("accept", "pickup", "deliver"):
                await repo.transition(order_id, courier, action)
            assert await snapshot(database, order_id) == before


async def test_concurrent_first_completions_emit_one_event(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    await repo.transition(order_id, courier, "pickup")
    await repo.transition(order_id, courier, "deliver")
    await asyncio.gather(*[repo.transition(order_id, owner, "complete") for _ in range(100)])
    _, history, events = await snapshot(database, order_id)
    assert len(history) == 5 and len(events) == 1


async def test_completion_rolls_back_when_outbox_write_fails(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    await repo.transition(order_id, courier, "pickup")
    await repo.transition(order_id, courier, "deliver")

    # Invalid reward in a test-only repository insertion exercises the DB constraint.
    class BrokenRepository(LifecycleRepository):
        async def _record(self, session, row, values, actor, now):
            return await super()._record(session, {**row, "reward": -1}, values, actor, now)

    before = await snapshot(database, order_id)
    with pytest.raises(SQLAlchemyError):
        await BrokenRepository(database.session_context).transition(order_id, owner, "complete")
    assert await snapshot(database, order_id) == before


async def test_overdue_worker_and_late_actions_keep_original_deadline(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    await make_due(database, order_id)
    before = await snapshot(database, order_id)
    await asyncio.gather(repo.overdue_batch(100), repo.overdue_batch(100))
    marked, history, events = await snapshot(database, order_id)
    assert marked["overdue_at"] == marked["delivery_deadline"]
    assert history == before[1] and not events and marked["state"] == "ACCEPTED"
    await repo.transition(order_id, courier, "pickup")
    await repo.transition(order_id, courier, "deliver")
    await repo.transition(order_id, owner, "complete")
    final = (await snapshot(database, order_id))[0]
    assert final["overdue_at"] == marked["overdue_at"]


async def test_late_delivery_racing_worker_records_one_overdue_marker(lifecycle_db):
    database, repo, order_id, _, courier = await accepted(lifecycle_db)
    await make_due(database, order_id)
    await asyncio.gather(repo.transition(order_id, courier, "pickup"), repo.overdue_batch(100))
    await asyncio.gather(repo.transition(order_id, courier, "deliver"), repo.overdue_batch(100))
    row, history, events = await snapshot(database, order_id)
    assert row["overdue_at"] == row["delivery_deadline"] and row["state"] == "DELIVERED"
    assert len(history) == 4 and not events


async def test_late_delivery_without_worker_still_records_overdue(lifecycle_db):
    database, repo, order_id, _, courier = await accepted(lifecycle_db)
    await make_due(database, order_id)
    # Place pickup before the deadline to test the delivery path alone.
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(orders)
            .where(orders.c.id == order_id)
            .values(state="PICKED_UP", picked_up_at=datetime.now(UTC) - timedelta(minutes=1))
        )
    delivered = await repo.transition(order_id, courier, "deliver")
    assert delivered["overdue_at"] == delivered["delivery_deadline"]


async def test_invalid_late_action_does_not_mark_overdue(lifecycle_db):
    database, repo, order_id, owner, _ = await accepted(lifecycle_db)
    await make_due(database, order_id)
    before = await snapshot(database, order_id)
    with pytest.raises(ApiError):
        await repo.transition(order_id, owner, "complete")
    assert await snapshot(database, order_id) == before


async def test_on_time_delivered_pending_confirmation_never_overdue(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    await repo.transition(order_id, courier, "pickup")
    await repo.transition(order_id, courier, "deliver")
    # This test represents the deadline later passing, keeping delivery before it.
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(orders)
            .where(orders.c.id == order_id)
            .values(
                accepted_at=datetime.now(UTC) - timedelta(minutes=3),
                picked_up_at=datetime.now(UTC) - timedelta(minutes=2),
                delivered_at=datetime.now(UTC) - timedelta(minutes=1),
                acceptance_deadline=datetime.now(UTC) - timedelta(seconds=90),
                delivery_deadline=datetime.now(UTC) - timedelta(seconds=30),
            )
        )
    await repo.overdue_batch(100)
    completed = await repo.transition(order_id, owner, "complete")
    assert completed["overdue_at"] is None


async def test_restricted_role_can_complete_but_not_retarget_event(lifecycle_db):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    async with database.session_context() as session:
        async with session.begin():
            await session.execute(text("SET LOCAL ROLE order_service_app"))
            # Repository uses its own sessions, so verify privileges directly as in earlier tests.
            assert await session.scalar(
                text(
                    "SELECT has_column_privilege(current_user, "
                    "'order_service.orders', 'completed_at', 'UPDATE')"
                )
            )
            assert not await session.scalar(
                text(
                    "SELECT has_column_privilege(current_user, "
                    "'order_service.outbox_events', 'courier_id', 'UPDATE')"
                )
            )

    @asynccontextmanager
    async def restricted():
        async with database.session_context() as session:
            await session.execute(text("SET ROLE order_service_app"))
            await session.commit()
            try:
                yield session
            finally:
                await session.rollback()
                await session.execute(text("RESET ROLE"))
                await session.commit()

    restricted_repo = LifecycleRepository(restricted)
    await restricted_repo.transition(order_id, courier, "pickup")
    await restricted_repo.transition(order_id, courier, "deliver")
    await restricted_repo.transition(order_id, owner, "complete")
    assert (await snapshot(database, order_id))[2][0]["requester_id"] == owner
