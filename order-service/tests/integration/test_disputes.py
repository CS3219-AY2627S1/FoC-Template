# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
# Scope: Added PostgreSQL tests for disputed errands, retries, races and constraints.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F3 on PostgreSQL: DISPUTED holds the errand; only an accepted dispute fails it."""

import asyncio
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.orders.errors import ApiError
from app.orders.lifecycle_repository import LifecycleRepository
from tests.integration.test_fulfilment import accepted, make_due
from tests.integration.test_lifecycle import lifecycle_db as _lifecycle_database  # noqa: F401
from tests.integration.test_lifecycle import snapshot

pytestmark = pytest.mark.integration
FAILURE = {"reason": "OTHER", "details": "Courier never replied"}


async def advanced(lifecycle_db, source):
    database, repo, order_id, owner, courier = await accepted(lifecycle_db)
    if source in ("PICKED_UP", "DELIVERED"):
        await repo.transition(order_id, courier, "pickup")
    if source == "DELIVERED":
        await repo.transition(order_id, courier, "deliver")
    return database, repo, order_id, owner, courier


async def outcome(coroutine):
    try:
        return await coroutine
    except ApiError as error:
        return error


@pytest.mark.parametrize("source", ["ACCEPTED", "PICKED_UP", "DELIVERED"])
async def test_withdrawn_dispute_returns_the_errand_and_its_lifecycle_continues(
    lifecycle_db, source
):
    database, repo, order_id, owner, courier = await advanced(lifecycle_db, source)
    dispute = uuid4()
    held = await repo.open_dispute(order_id, owner, "USER", dispute_id=dispute)
    assert (held["state"], held["disputed_from_state"], held["dispute_id"]) == (
        "DISPUTED",
        source,
        dispute,
    )
    blocked = {"ACCEPTED": ("pickup", courier), "PICKED_UP": ("deliver", courier)}
    action, actor = blocked.get(source, ("complete", owner))
    with pytest.raises(ApiError, match="ERRAND_DISPUTED"):
        await repo.transition(order_id, actor, action)

    restored = await repo.restore(order_id, owner, "USER", dispute_id=dispute)
    assert restored["state"] == source and restored["dispute_id"] is None
    before = await snapshot(database, order_id)
    await asyncio.gather(
        *[repo.restore(order_id, owner, "USER", dispute_id=dispute) for _ in range(20)]
    )
    assert await snapshot(database, order_id) == before
    row, history, events = before
    assert [entry["new_state"] for entry in history[-2:]] == ["DISPUTED", source]
    assert all(entry["dispute_id"] == dispute for entry in history[-2:])
    assert history[-1]["actor_type"] == "USER" and not events
    # The lifecycle carries on, and a later problem can be reported as a new dispute.
    await repo.transition(order_id, actor, action)
    if source != "DELIVERED":
        await repo.open_dispute(order_id, courier, "USER", dispute_id=uuid4())


async def test_rejected_dispute_is_recorded_as_an_administrator_action(lifecycle_db):
    database, repo, order_id, _, courier = await advanced(lifecycle_db, "PICKED_UP")
    dispute, admin = uuid4(), uuid4()
    await repo.open_dispute(order_id, admin, "ADMIN", dispute_id=dispute)
    await repo.restore(order_id, admin, "ADMIN", dispute_id=dispute)
    row, history, events = await snapshot(database, order_id)
    assert row["state"] == "PICKED_UP" and not events
    assert [(entry["actor_type"], entry["actor_id"]) for entry in history[-2:]] == [
        ("ADMIN", admin),
        ("ADMIN", admin),
    ]


@pytest.mark.parametrize("source", ["ACCEPTED", "PICKED_UP", "DELIVERED"])
async def test_accepted_dispute_fails_once_and_releases_credits(lifecycle_db, source):
    database, repo, order_id, owner, _ = await advanced(lifecycle_db, source)
    dispute, admin = uuid4(), uuid4()
    await repo.open_dispute(order_id, owner, "USER", dispute_id=dispute)
    await repo.accept_dispute(order_id, admin, dispute_id=dispute, failure=FAILURE)
    before = await snapshot(database, order_id)
    await asyncio.gather(
        *[
            repo.accept_dispute(order_id, uuid4(), dispute_id=dispute, failure=FAILURE)
            for _ in range(20)
        ]
    )
    assert await snapshot(database, order_id) == before
    row, history, events = before
    assert row["state"] == "FAILED" and row["dispute_id"] is None
    assert (row["failure_reason"], row["failure_details"]) == ("OTHER", FAILURE["details"])
    assert (row["failed_by"], row["decided_by"], row["decision_dispute_id"]) == (
        admin,
        admin,
        dispute,
    )
    assert (history[-1]["previous_state"], history[-1]["actor_type"]) == ("DISPUTED", "ADMIN")
    assert history[-1]["dispute_id"] == dispute
    # Credit releases the reservation to the requester; the event carries no payout.
    assert [event["event_type"] for event in events] == ["order.failed.v1"]
    assert events[0]["amount"] is None
    with pytest.raises(ApiError, match="INVALID_TRANSITION"):
        await repo.open_dispute(order_id, owner, "USER", dispute_id=uuid4())


async def test_competing_reports_hold_the_errand_for_one_dispute(lifecycle_db):
    database, repo, order_id, owner, courier = await advanced(lifecycle_db, "PICKED_UP")
    disputes = [uuid4() for _ in range(10)]
    results = await asyncio.gather(
        *[
            outcome(repo.open_dispute(order_id, (owner, courier)[i % 2], "USER", dispute_id=d))
            for i, d in enumerate(disputes)
        ]
    )
    errors = [result for result in results if isinstance(result, ApiError)]
    assert len(errors) == 9 and {error.code for error in errors} == {"DISPUTE_OPEN"}
    row, history, _ = await snapshot(database, order_id)
    assert row["state"] == "DISPUTED" and row["dispute_id"] in disputes
    assert [entry["new_state"] for entry in history].count("DISPUTED") == 1


async def test_confirmation_racing_a_report_has_one_valid_outcome(lifecycle_db):
    database, repo, order_id, owner, courier = await advanced(lifecycle_db, "DELIVERED")
    results = await asyncio.gather(
        outcome(repo.transition(order_id, owner, "complete")),
        outcome(repo.open_dispute(order_id, courier, "USER", dispute_id=uuid4())),
    )
    assert sum(isinstance(result, ApiError) for result in results) == 1
    row, _, events = await snapshot(database, order_id)
    assert row["state"] in ("COMPLETED", "DISPUTED")
    assert len(events) == (1 if row["state"] == "COMPLETED" else 0)


async def test_withdrawal_racing_acceptance_ends_in_one_state(lifecycle_db):
    database, repo, order_id, owner, _ = await advanced(lifecycle_db, "ACCEPTED")
    dispute = uuid4()
    await repo.open_dispute(order_id, owner, "USER", dispute_id=dispute)
    results = await asyncio.gather(
        outcome(repo.restore(order_id, owner, "USER", dispute_id=dispute)),
        outcome(repo.accept_dispute(order_id, uuid4(), dispute_id=dispute, failure=FAILURE)),
    )
    assert sum(isinstance(result, ApiError) for result in results) == 1
    row, _, events = await snapshot(database, order_id)
    assert row["state"] in ("ACCEPTED", "FAILED")
    assert len(events) == (1 if row["state"] == "FAILED" else 0)


@pytest.mark.parametrize("late", [False, True])
async def test_overdue_worker_skips_disputed_errands_but_keeps_the_marker(lifecycle_db, late):
    database, repo, order_id, owner, _ = await accepted(lifecycle_db)
    if late:
        await make_due(database, order_id)
    held = await repo.open_dispute(order_id, owner, "USER", dispute_id=uuid4())
    before = await snapshot(database, order_id)
    await repo.overdue_batch(100)
    assert await snapshot(database, order_id) == before
    assert held["overdue_at"] == (held["delivery_deadline"] if late else None)


async def test_returned_errand_is_flagged_overdue_by_the_worker(lifecycle_db):
    database, repo, order_id, owner, _ = await accepted(lifecycle_db)
    dispute = uuid4()
    await repo.open_dispute(order_id, owner, "USER", dispute_id=dispute)
    await make_due(database, order_id)
    await repo.overdue_batch(100)
    assert (await snapshot(database, order_id))[0]["overdue_at"] is None
    await repo.restore(order_id, owner, "USER", dispute_id=dispute)
    await repo.overdue_batch(100)
    row = (await snapshot(database, order_id))[0]
    assert row["overdue_at"] == row["delivery_deadline"]


async def test_database_refuses_failures_without_an_accepted_dispute(lifecycle_db):
    database, _, order_id, owner, _ = await accepted(lifecycle_db)
    with pytest.raises(SQLAlchemyError):
        async with database.session_context() as session, session.begin():
            await session.execute(
                text(
                    "UPDATE order_service.orders SET state = 'FAILED', failed_at = now(), "
                    "failed_by = :owner, failure_reason = 'ITEM_DAMAGED' WHERE id = :id"
                ),
                {"owner": owner, "id": order_id},
            )


async def test_database_refuses_a_dispute_that_disagrees_with_the_errand(lifecycle_db):
    database, _, order_id, _, _ = await accepted(lifecycle_db)
    with pytest.raises(SQLAlchemyError):
        async with database.session_context() as session, session.begin():
            # Never picked up, so it cannot return to PICKED_UP.
            await session.execute(
                text(
                    "UPDATE order_service.orders SET state = 'DISPUTED', dispute_id = :d, "
                    "disputed_from_state = 'PICKED_UP', disputed_at = now() WHERE id = :id"
                ),
                {"d": uuid4(), "id": order_id},
            )


async def test_app_role_can_dispute_but_cannot_rewrite_history(lifecycle_db):
    database, _, order_id, owner, _ = await accepted(lifecycle_db)

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

    repo, dispute = LifecycleRepository(restricted), uuid4()
    await repo.open_dispute(order_id, owner, "USER", dispute_id=dispute)
    await repo.accept_dispute(order_id, uuid4(), dispute_id=dispute, failure=FAILURE)
    async with restricted() as session:
        assert not await session.scalar(
            text(
                "SELECT has_column_privilege(current_user, 'order_service.order_history', "
                "'dispute_id', 'UPDATE')"
            )
        )
    assert (await snapshot(database, order_id))[0]["state"] == "FAILED"
