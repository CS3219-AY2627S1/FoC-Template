# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Scope: Implemented and debugged acceptance, cancellation and expiry tests.
# Author review: I validated correctness and added boundary checks where needed.

"""Real transactions/races; only opt-in disposable databases may be used."""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.orders.errors import ApiError
from app.orders.lifecycle_repository import LifecycleRepository
from app.orders.outbox import OutboxRepository
from app.orders.schemas import Principal
from app.orders.tables import history, orders, outbox

pytestmark = pytest.mark.integration


@pytest.fixture(name="lifecycle_db")
async def lifecycle_db():
    url = os.environ.get("ORDER_WRITE_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set ORDER_WRITE_TEST_DATABASE_URL to a disposable migrated database")
    database = Database(url)
    ids = []

    async def seed(*, expired=False):
        now = datetime.now(UTC)
        order_id, owner = uuid4(), uuid4()
        ids.append(order_id)
        async with database.session_context() as session, session.begin():
            await session.execute(
                insert(orders).values(
                    id=order_id,
                    requester_id=owner,
                    supplier_id=uuid4(),
                    reservation_id=uuid4(),
                    supplier_snapshot={
                        "name": "Test cafe",
                        "buildingArea": "COM3",
                        "floor": None,
                        "pickupLocationDescription": "Counter",
                        "latitude": None,
                        "longitude": None,
                        "updatedAt": now.isoformat(),
                    },
                    item_description="Test errand",
                    delivery_location="COM2",
                    reward=5,
                    state="OPEN",
                    created_at=now - timedelta(hours=2),
                    updated_at=now,
                    acceptance_deadline=now + timedelta(seconds=-1 if expired else 3600),
                    delivery_deadline=now + timedelta(hours=2),
                )
            )
            await session.execute(
                insert(history).values(
                    order_id=order_id,
                    sequence=1,
                    new_state="OPEN",
                    actor_id=owner,
                    actor_type="USER",
                    occurred_at=now - timedelta(hours=2),
                )
            )
        return order_id, owner

    try:
        yield database, LifecycleRepository(database.session_context), seed
    finally:
        # Only generated rows owned by this test; never reset/truncate a schema.
        async with database.session_context() as session, session.begin():
            for table in (outbox, history, orders):
                column = orders.c.id if table is orders else table.c.order_id
                await session.execute(delete(table).where(column.in_(ids)))
        await database.dispose()


async def snapshot(database, order_id):
    async with database.session_context() as session:
        row = (
            (await session.execute(select(orders).where(orders.c.id == order_id))).mappings().one()
        )
        entries = (
            (
                await session.execute(
                    select(history)
                    .where(history.c.order_id == order_id)
                    .order_by(history.c.sequence)
                )
            )
            .mappings()
            .all()
        )
        events = (
            (await session.execute(select(outbox).where(outbox.c.order_id == order_id)))
            .mappings()
            .all()
        )
        return dict(row), [dict(entry) for entry in entries], [dict(event) for event in events]


async def attempt(repo, order_id, actor, action):
    try:
        return await repo.transition(order_id, actor, action)
    except ApiError as error:
        return error


async def test_100_acceptors_have_one_winner_and_replay(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, _ = await seed()
    actors = [uuid4() for _ in range(100)]
    results = await asyncio.gather(*[attempt(repo, order_id, actor, "accept") for actor in actors])
    winners = [result for result in results if not isinstance(result, ApiError)]
    assert len(winners) == 1
    assert all(
        result.code == "ORDER_NOT_OPEN" for result in results if isinstance(result, ApiError)
    )
    saved, entries, events = await snapshot(database, order_id)
    assert saved["courier_id"] in actors
    assert saved["accepted_at"] < saved["acceptance_deadline"]
    assert len(entries) == 2 and not events
    before = await snapshot(database, order_id)
    await LifecycleRepository(database.session_context).transition(
        order_id, saved["courier_id"], "accept"
    )
    assert await snapshot(database, order_id) == before


async def test_accept_cancel_race_and_duplicate_cancellation(lifecycle_db):
    database, repo, seed = lifecycle_db
    for _ in range(8):
        order_id, owner = await seed()
        courier = uuid4()
        actions = [(courier, "accept"), (owner, "cancel")]
        if _ % 2:
            actions.reverse()
        results = await asyncio.gather(
            *[attempt(repo, order_id, actor, action) for actor, action in actions]
        )
        assert sum(not isinstance(result, ApiError) for result in results) == 1
        saved, entries, events = await snapshot(database, order_id)
        assert len(entries) == 2
        assert saved["state"] in ("ACCEPTED", "CANCELLED")
        assert len(events) == (1 if saved["state"] == "CANCELLED" else 0)
    order_id, owner = await seed()
    await asyncio.gather(*[repo.transition(order_id, owner, "cancel") for _ in range(10)])
    saved, entries, events = await snapshot(database, order_id)
    assert saved["state"] == "CANCELLED" and len(entries) == 2 and len(events) == 1
    assert events[0]["state"] == "PENDING"


async def test_expiry_wins_after_deadline_without_rejected_request_side_effects(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, owner = await seed(expired=True)
    before = await snapshot(database, order_id)
    for actor, action in [(uuid4(), "accept"), (owner, "cancel")]:
        result = await attempt(repo, order_id, actor, action)
        assert result.code == "DEADLINE_PASSED"
    assert await snapshot(database, order_id) == before
    await asyncio.gather(
        repo.expire_batch(100),
        repo.expire_batch(100),
        attempt(repo, order_id, owner, "cancel"),
        attempt(repo, order_id, uuid4(), "accept"),
    )
    saved, entries, events = await snapshot(database, order_id)
    assert saved["state"] == "EXPIRED"
    assert saved["expired_at"] >= saved["acceptance_deadline"]
    assert len(entries) == 2 and len(events) == 1
    assert entries[-1]["actor_type"] == "SYSTEM" and entries[-1]["actor_id"] is None
    assert entries[-1]["occurred_at"] == saved["expired_at"] == events[0]["occurred_at"]


async def test_expiry_skips_accepted_and_uncommitted_locks(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, _ = await seed()
    await repo.transition(order_id, uuid4(), "accept")
    accepted, _, _ = await snapshot(database, order_id)
    # Advance deadline while preserving accepted_at < deadline.
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(orders)
            .where(orders.c.id == order_id)
            .values(acceptance_deadline=accepted["accepted_at"] + timedelta(microseconds=1))
        )
    locked_id, _ = await seed(expired=True)
    async with database.session_context() as session, session.begin():
        await session.execute(select(orders).where(orders.c.id == locked_id).with_for_update())
        await asyncio.wait_for(repo.expire_batch(100), timeout=2)
        assert (await snapshot(database, locked_id))[0]["state"] == "OPEN"
    await repo.expire_batch(100)
    assert (await snapshot(database, order_id))[0]["state"] == "ACCEPTED"
    assert (await snapshot(database, locked_id))[0]["state"] == "EXPIRED"


async def test_deadline_is_checked_after_waiting_for_lock(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, _ = await seed()
    async with database.session_context() as blocker, blocker.begin():
        await blocker.execute(select(orders).where(orders.c.id == order_id).with_for_update())
        task = asyncio.create_task(attempt(repo, order_id, uuid4(), "accept"))
        await asyncio.sleep(0.1)
        assert not task.done()
        await blocker.execute(
            update(orders)
            .where(orders.c.id == order_id)
            .values(acceptance_deadline=func.clock_timestamp())
        )
    assert (await task).code == "DEADLINE_PASSED"
    assert (await snapshot(database, order_id))[0]["state"] == "OPEN"


@pytest.mark.parametrize("target", [history, outbox], ids=["history", "outbox"])
async def test_transition_rolls_back_if_history_or_outbox_fails(lifecycle_db, monkeypatch, target):
    database, _, seed = lifecycle_db
    order_id, owner = await seed()
    before = await snapshot(database, order_id)

    def failing_session():
        session = database.session_context()
        original = session.execute

        async def execute(statement, *args, **kwargs):
            if (
                getattr(statement, "is_insert", False)
                and getattr(statement, "table", None) is target
            ):
                raise SQLAlchemyError("Test-only write failure")
            return await original(statement, *args, **kwargs)

        monkeypatch.setattr(session, "execute", execute)
        return session

    with pytest.raises(SQLAlchemyError):
        await LifecycleRepository(failing_session).transition(order_id, owner, "cancel")
    assert await snapshot(database, order_id) == before


async def test_restricted_role_can_transition_but_not_rewrite_history_or_payload(lifecycle_db):
    database, _, seed = lifecycle_db
    order_id, owner = await seed()
    from contextlib import asynccontextmanager

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

    await LifecycleRepository(restricted).transition(order_id, owner, "cancel")
    async with database.session_context() as session:
        for table, column in [
            ("orders", "reward"),
            ("outbox_events", "reservation_id"),
            ("order_history", "new_state"),
        ]:
            assert not await session.scalar(
                text("SELECT has_column_privilege('order_service_app', :table, :column, 'UPDATE')"),
                {"table": f"order_service.{table}", "column": column},
            )


async def test_outbox_leases_fence_stale_workers_and_resume_after_crash(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, owner = await seed()
    await repo.transition(order_id, owner, "cancel")
    out = OutboxRepository(database.session_context)
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(outbox)
            .where(outbox.c.order_id == order_id)
            .values(next_attempt_at=datetime(1970, 1, 1, tzinfo=UTC))
        )
    claims = await asyncio.gather(out.claim(30), out.claim(30))
    claim = next(item for item in claims if item and item["order_id"] == order_id)
    assert sum(item is not None and item["order_id"] == order_id for item in claims) == 1
    async with database.session_context() as session, session.begin():
        await session.execute(
            update(outbox)
            .where(outbox.c.event_id == claim["event_id"])
            .values(lease_until=datetime.now(UTC) - timedelta(seconds=1))
        )
    recovered = await out.claim(30)
    assert (
        recovered["event_id"] == claim["event_id"]
        and recovered["lease_token"] != claim["lease_token"]
    )
    assert not await out.finish(claim)
    assert not await out.finish(claim, failed=True)
    assert await out.finish(recovered, failed=True)
    _, _, events = await snapshot(database, order_id)
    assert events[0]["state"] == "PENDING" and events[0]["next_attempt_at"] > datetime.now(UTC)
    assert events[0]["last_error_code"] == "PUBLISH_UNAVAILABLE"


class TokenIdentity:
    async def identity(self, token):
        return Principal.model_validate(
            {"userId": UUID(token), "systemRole": "USER", "accountStatus": "ACTIVE"}
        )


async def test_http_actions_queries_and_system_history(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, owner = await seed()
    app = create_app(
        Settings(_env_file=None), database, clients=TokenIdentity(), lifecycle_repository=repo
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as http:
            courier = uuid4()
            auth = {"Authorization": f"Bearer {courier}"}
            response = await http.post(f"/v1/orders/{order_id}/accept", headers=auth)
            assert response.status_code == 200, response.text
            assert response.json()["courierId"] == str(courier)
            assert response.json()["acceptedAt"]
            assert "reservationId" not in response.json()
            assert (await http.get("/v1/orders/mine?relationship=courier", headers=auth)).json()[
                "total"
            ] == 1
            assert (await http.get(f"/v1/orders/{order_id}/history", headers=auth)).json()[
                "total"
            ] == 2
            response = await http.post(
                f"/v1/orders/{order_id}/cancel", headers={"Authorization": f"Bearer {owner}"}
            )
            assert response.status_code == 409
            expired_id, owner = await seed(expired=True)
            await repo.expire_batch(100)
            response = await http.get(
                f"/v1/orders/{expired_id}/history", headers={"Authorization": f"Bearer {owner}"}
            )
            assert response.json()["items"][-1]["actorId"] is None
            assert (await http.get(f"/v1/orders/{expired_id}", headers=auth)).status_code == 404


async def test_lost_response_after_commit_is_safe_to_repeat(lifecycle_db):
    database, repo, seed = lifecycle_db
    order_id, owner = await seed()
    # Ignore the first committed response as if the client connection had dropped.
    await repo.transition(order_id, owner, "cancel")
    before = await snapshot(database, order_id)
    await LifecycleRepository(database.session_context).transition(order_id, owner, "cancel")
    assert await snapshot(database, order_id) == before
